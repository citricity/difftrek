//! What an extension may rely on from Diff Trek, and what it provides back.
//!
//! Diff Trek's extensions are compiled in, not loaded: a build scans the
//! repository's `extensions/` folder and links every extension it finds (see
//! `scripts/extensions.mjs`). Each one is a Tauri plugin for its commands plus
//! a React module for its UI, and this crate is the part of the core its Rust
//! half may depend on. Nothing here depends on Tauri, so an extension's own
//! logic can be tested without a running app.
//!
//! The central idea is the [`source::Source`]: whatever produces the list of
//! changed files and both sides of each one. A Git repository is the built-in
//! source; an extension can open another — two folders, say — and the whole
//! document, navigation included, works on it unchanged.

pub mod error;
pub mod i18n;
pub mod model;
pub mod source;
