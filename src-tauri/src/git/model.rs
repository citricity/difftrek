//! Domain types shared between the Git layer and the Tauri command layer.
//!
//! They live in the extension API crate, because every source of a diff —
//! a repository or an extension's — produces the same shapes for the
//! frontend. Re-exported here so the Git layer keeps naming them
//! `git::model`.

pub use difftrek_extension_api::model::*;
