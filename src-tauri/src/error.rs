//! Application-level errors.
//!
//! They live in the extension API crate, because an extension's source reports
//! failures in the same terms the frontend already switches on. Re-exported
//! here so the core keeps naming them `crate::error`.

pub use difftrek_extension_api::error::*;
