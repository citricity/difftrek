# Extensions

Anything in this folder is compiled into Diff Trek. The community build ships
with it empty; other builds, such as Diff Trek Pro, copy their extensions in
before building. Nothing in the core names an extension, so adding one is
adding a folder here.

```
extensions/<id>/
  extension.json      { "id": "<id>", "name": "Human-readable name" }
  rust/               optional: a crate exposing
                      pub fn register<R: tauri::Runtime>(tauri::Builder<R>) -> tauri::Builder<R>
  ui/index.ts(x)      optional: export default defineExtension({ id: "<id>", … })
  capabilities.json   optional: a Tauri capability granting the extension's commands
```

- **`id`** must match the folder name. It is also the name of the extension's
  Tauri plugin, so its commands are `plugin:<id>|<command>`, which is what
  `host.invoke` in the React half calls.
- **The Rust half** depends on `difftrek-extension-api`
  (`../../../crates/extension-api`) for the domain types and for
  `ActiveSource`, through which it can open a new source of files to compare.
  `scripts/extensions.mjs` links it in — a line in the marked block of
  `src-tauri/Cargo.toml` and a call in `src-tauri/src/extensions.rs` — on every
  `pnpm dev`, `pnpm build` and `pnpm test:rust`. Run `pnpm extensions` after
  adding or removing one by hand.
- **The React half** imports only from `@difftrek/extension`
  (`src/extensions/api.ts`) and is found by Vite at build time.
- **Capabilities** are copied into `src-tauri/capabilities/` as
  `extension-<id>.json`, which is gitignored.

An extension is never load-bearing: a panel that throws is removed, and the
rest of the app carries on.
