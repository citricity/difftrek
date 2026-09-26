#!/usr/bin/env node
/**
 * Links every extension in `extensions/` into the build.
 *
 * An extension is a folder holding an `extension.json`, plus either or both
 * halves:
 *
 *   extensions/<id>/
 *     extension.json      { "id": "<id>", "name": "…" }
 *     rust/               a crate exposing
 *                         `pub fn register<R: Runtime>(Builder<R>) -> Builder<R>`
 *     ui/index.ts(x)      default-exports `defineExtension({ … })`
 *     capabilities.json   a Tauri capability granting its commands
 *
 * The React half needs nothing from here: Vite finds it with
 * `import.meta.glob` (see `src/extensions/registry.ts`). Cargo cannot find
 * anything by itself — every dependency has to be named in a manifest — so
 * this writes each extension's crate into the marked block of
 * `src-tauri/Cargo.toml`, and `src-tauri/src/extensions.rs` to call each one's
 * `register`. They must be direct dependencies of the app: Tauri finds a
 * plugin's permissions through its build script's `links` metadata, which
 * Cargo passes only to the crate immediately above. Capabilities are copied
 * into `src-tauri/capabilities/`, where Tauri reads every file.
 *
 * Nothing in the core names an extension, so adding one is adding a folder.
 * Files are only rewritten when their content changes, so an unchanged set of
 * extensions never triggers a Rust rebuild. The committed copies are the ones
 * for an empty folder, so a fresh clone builds with plain `cargo`; run with
 * `--check` to fail instead of writing, which proves that is still so.
 */

import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const extensionsDir = join(root, 'extensions');
const manifestPath = join(root, 'src-tauri', 'Cargo.toml');
const registryPath = join(root, 'src-tauri', 'src', 'extensions.rs');
const BLOCK = /(# BEGIN EXTENSIONS\n)[\s\S]*?(# END EXTENSIONS\n)/;
const capabilitiesDir = join(root, 'src-tauri', 'capabilities');

/** Generated capability files carry this prefix, so stale ones can be found. */
const CAPABILITY_PREFIX = 'extension-';

const check = process.argv.includes('--check');

/** An id doubles as a Tauri plugin name and a file name. */
const ID_PATTERN = /^[a-z][a-z0-9-]*$/;

function fail(message) {
  console.error(`[extensions] ${message}`);
  process.exit(1);
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    fail(`${relative(root, path)} is not valid JSON: ${error.message}`);
  }
}

/** The `[package] name` of a crate, read without a TOML parser. */
function crateName(manifest) {
  const text = readFileSync(manifest, 'utf8');
  const packageSection = text
    .split(/^\[/m)
    .find((section) => section.startsWith('package]'));
  const match = packageSection?.match(/^name\s*=\s*"([^"]+)"/m);
  if (!match) fail(`${relative(root, manifest)} has no [package] name.`);
  return match[1];
}

function discover() {
  if (!existsSync(extensionsDir)) return [];

  return readdirSync(extensionsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((folder) => existsSync(join(extensionsDir, folder, 'extension.json')))
    .sort()
    .map((folder) => {
      const dir = join(extensionsDir, folder);
      const { id, name } = readJson(join(dir, 'extension.json'));

      if (typeof id !== 'string' || !ID_PATTERN.test(id)) {
        fail(
          `extensions/${folder}: "id" must be lower-case letters, digits and hyphens.`,
        );
      }
      if (id !== folder) {
        fail(`extensions/${folder}: "id" is "${id}"; it must match the folder name.`);
      }

      const manifest = join(dir, 'rust', 'Cargo.toml');
      const capabilities = join(dir, 'capabilities.json');
      const hasUi = ['index.ts', 'index.tsx'].some((file) =>
        existsSync(join(dir, 'ui', file)),
      );

      return {
        id,
        name: typeof name === 'string' ? name : id,
        crate: existsSync(manifest) ? crateName(manifest) : null,
        capabilities: existsSync(capabilities) ? capabilities : null,
        hasUi,
      };
    });
}

/** The app's manifest, with the marked block listing each extension crate. */
function appManifest(extensions) {
  const current = readFileSync(manifestPath, 'utf8');
  if (!BLOCK.test(current)) {
    fail(
      'src-tauri/Cargo.toml has lost its "# BEGIN EXTENSIONS" / "# END EXTENSIONS" lines.',
    );
  }

  const lines = extensions
    .filter((extension) => extension.crate !== null)
    .map(
      (extension) =>
        `${extension.crate} = { path = "../extensions/${extension.id}/rust" }\n`,
    )
    .join('');

  return current.replace(BLOCK, (_, begin, end) => `${begin}${lines}${end}`);
}

function registrySource(extensions) {
  const ids = extensions.map((extension) => `"${extension.id}"`).join(', ');
  const calls = extensions
    .filter((extension) => extension.crate !== null)
    .map(
      (extension) =>
        `    let builder = ${extension.crate.replaceAll('-', '_')}::register(builder);\n`,
    )
    .join('');

  return `//! Generated by scripts/extensions.mjs from the contents of extensions/.
//! Do not edit: run \`pnpm extensions\` instead. The committed copy is the one
//! for an empty folder.

/// The id of every extension compiled in.
pub const EXTENSIONS: &[&str] = &[${ids}];

/// Adds every extension's Tauri plugin to the app.
pub fn register<R: tauri::Runtime>(builder: tauri::Builder<R>) -> tauri::Builder<R> {
${calls}    builder
}
`;
}

/** Every file this run should leave behind, keyed by absolute path. */
function plan(extensions) {
  const files = new Map([
    [manifestPath, appManifest(extensions)],
    [registryPath, registrySource(extensions)],
  ]);

  for (const extension of extensions) {
    if (extension.capabilities === null) continue;
    files.set(
      join(capabilitiesDir, `${CAPABILITY_PREFIX}${extension.id}.json`),
      readFileSync(extension.capabilities, 'utf8'),
    );
  }

  return files;
}

function staleCapabilities(files) {
  if (!existsSync(capabilitiesDir)) return [];

  return readdirSync(capabilitiesDir)
    .filter((file) => file.startsWith(CAPABILITY_PREFIX))
    .map((file) => join(capabilitiesDir, file))
    .filter((path) => !files.has(path));
}

const extensions = discover();
const files = plan(extensions);
const stale = staleCapabilities(files);

const changed = [...files].filter(
  ([path, content]) => !existsSync(path) || readFileSync(path, 'utf8') !== content,
);

if (check) {
  const problems = [...changed.map(([path]) => path), ...stale];
  if (problems.length > 0) {
    fail(`out of date: ${problems.map((path) => relative(root, path)).join(', ')}`);
  }
} else {
  for (const [path, content] of changed) writeFileSync(path, content);
  for (const path of stale) rmSync(path);
}

const summary =
  extensions.length === 0
    ? 'none'
    : extensions
        .map((extension) => {
          const halves = [extension.crate && 'rust', extension.hasUi && 'ui'].filter(
            Boolean,
          );
          return `${extension.id} (${halves.join(' + ') || 'empty'})`;
        })
        .join(', ');
console.log(`[extensions] ${summary}`);
