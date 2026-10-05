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
  Sources are kept per window: a command takes the calling
  `window: tauri::WebviewWindow<R>` and opens with
  `active.open(window.label(), source)`, so other windows keep what they show.
  `scripts/extensions.mjs` links it in — a line in the marked block of
  `src-tauri/Cargo.toml` and a call in `src-tauri/src/extensions.rs` — on every
  `pnpm dev`, `pnpm build` and `pnpm test:rust`. Run `pnpm extensions` after
  adding or removing one by hand.
- **The React half** imports only from `@difftrek/extension`
  (`src/extensions/api.ts`) and is found by Vite at build time.
- **Capabilities** are copied into `src-tauri/capabilities/` as
  `extension-<id>.json`, which is gitignored. Grant them to `"windows": ["*"]`:
  Diff Trek opens more windows than `main`, and a capability naming only
  `main` leaves the extension dead in every other one.

An extension is never load-bearing: a panel that throws is removed, and the
rest of the app carries on.

## The landing screen

Outside a repository Diff Trek shows a landing screen: a coloured band across
the top holding the screen's title, then extensions' panels, then the core's
own guidance. A panel contributes with `landing: { modes, component }`.

The **first** panel on the screen can also name it, with `useHeading`: a hook
returning `{ title, intro? }`, so it can translate with `useT`. The core draws
these large in the band; the panel itself then starts with its controls, not a
heading of its own. Without `useHeading`, or if it throws, the band keeps Diff
Trek's own heading.

```tsx
export default defineExtension({
  id: 'dir-compare',
  landing: {
    modes: ['none'],
    component: CompareFolders,
    useHeading: () => {
      const t = useT<Key>();
      return { title: t('dirCompare.title'), intro: t('dirCompare.intro') };
    },
  },
});
```

Where an extension tells the two sides of a comparison apart by colour, it
uses the core's `--side-a` and `--side-b` (bare RGB channels:
`rgb(var(--side-a) / 12%)`), so its colours always match the band's.

## Words

An extension's words go in `extensions/<id>/locales/<tag>.json`, one flat
JSON object per language the core ships (`en-GB` at least), in the same format
as the core's `locales/`. They are **layered over the core's catalogues**, not
kept apart: language by language, the extension's messages are merged on top,
so one `t` reads both, and an extension can use the core's words, add its own,
or reword the core's.

- **React:** `useT<Key>()` from `@difftrek/extension`, where `Key` is
  `keyof typeof import('../locales/en-GB.json')`. The core finds the files by
  itself at build time.
- **Rust:** embed the same files in a `difftrek_extension_api::i18n::Catalogs`
  and call `i18n::add_layer` with it when registering (and before formatting a
  message, so tests see it too); then `i18n::t`/`i18n::tf` answer from every
  layer in the active language. `i18n::check_catalogues` checks the files as
  the core's are checked — call it from a test.
- Name keys after the extension (`dirCompare.title`) so they cannot collide by
  accident, and ship only languages the core ships.
