//! Process-wide state: the changed-file list last read from the open source.
//!
//! The file list is cached because every `get_file_diff` call needs the
//! metadata (status, rename pair, binary flag) for the path it was given, and
//! re-listing the source per file would be wasteful. Which source is open is
//! kept separately, in the extension API's `ActiveSource`, because extensions
//! open sources too.
//!
//! The listing remembers which source it came from, and is only ever read
//! back for that same source. Opening a source and listing it are separate
//! commands, so without that a listing that finished after an extension
//! opened something else would answer for the new source with the old one's
//! files — or a diff would be asked of one source with the other's metadata.

use crate::error::{AppError, AppResult};
use crate::git::model::ChangedFile;
use difftrek_extension_api::source::Source;
use std::sync::{Arc, Mutex};

#[derive(Default)]
pub struct AppState {
    listing: Mutex<Option<Listing>>,
}

struct Listing {
    source: Arc<dyn Source>,
    files: Vec<ChangedFile>,
}

impl AppState {
    /// Stores what `source` listed, replacing any earlier listing.
    pub fn set_files(&self, source: &Arc<dyn Source>, files: Vec<ChangedFile>) {
        *self.lock() = Some(Listing {
            source: Arc::clone(source),
            files,
        });
    }

    /// Forgets the listing, whichever source it came from.
    pub fn clear(&self) {
        *self.lock() = None;
    }

    /// One file's metadata, as `source` listed it. A path listed only by some
    /// other source is not found, which is the truth as far as `source` is
    /// concerned.
    pub fn file(&self, source: &Arc<dyn Source>, path: &str) -> AppResult<ChangedFile> {
        self.lock()
            .as_ref()
            .filter(|listing| same_source(&listing.source, source))
            .and_then(|listing| listing.files.iter().find(|file| file.path == path))
            .cloned()
            .ok_or_else(|| AppError::file_not_found(path))
    }

    /// A poisoned lock means another command panicked. Recovering the guard is
    /// safe here: the cached data is plain values, not a half-updated
    /// invariant, and refusing every later command would be worse.
    fn lock(&self) -> std::sync::MutexGuard<'_, Option<Listing>> {
        self.listing.lock().unwrap_or_else(|err| err.into_inner())
    }
}

/// The same open source, not merely an equal one: compared by allocation,
/// ignoring the vtable half of the fat pointer, which can differ between
/// codegen units for the same type.
fn same_source(a: &Arc<dyn Source>, b: &Arc<dyn Source>) -> bool {
    std::ptr::addr_eq(Arc::as_ptr(a), Arc::as_ptr(b))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::git::model::{FileDiff, FileStatus, RepositoryInfo};
    use difftrek_extension_api::source::Side;
    use std::any::Any;

    struct Stub;

    impl Source for Stub {
        fn info(&self) -> AppResult<RepositoryInfo> {
            unreachable!()
        }
        fn changed_files(&self) -> AppResult<Vec<ChangedFile>> {
            unreachable!()
        }
        fn file_diff(&self, _: &ChangedFile, _: usize) -> AppResult<FileDiff> {
            unreachable!()
        }
        fn file_bytes(&self, _: &ChangedFile, _: Side) -> AppResult<Vec<u8>> {
            unreachable!()
        }
        fn as_any(&self) -> &dyn Any {
            self
        }
    }

    fn source() -> Arc<dyn Source> {
        Arc::new(Stub)
    }

    fn file(path: &str) -> ChangedFile {
        ChangedFile {
            id: path.to_string(),
            path: path.to_string(),
            old_path: None,
            status: FileStatus::Modified,
            additions: Some(1),
            deletions: Some(0),
            binary: false,
        }
    }

    #[test]
    fn looks_up_cached_metadata_by_path() {
        let state = AppState::default();
        let open = source();
        state.set_files(&open, vec![file("a.ts"), file("b.ts")]);

        assert_eq!(state.file(&open, "b.ts").unwrap().path, "b.ts");
        assert!(state.file(&open, "missing.ts").is_err());
    }

    #[test]
    fn a_new_listing_replaces_the_old_one() {
        let state = AppState::default();
        let open = source();
        state.set_files(&open, vec![file("a.ts")]);
        state.set_files(&open, vec![file("b.ts")]);

        assert!(state.file(&open, "a.ts").is_err());
    }

    #[test]
    fn one_source_never_answers_with_anothers_files() {
        let state = AppState::default();
        let (old, new) = (source(), source());
        state.set_files(&old, vec![file("a.ts")]);

        assert!(state.file(&new, "a.ts").is_err());
        assert!(state.file(&old, "a.ts").is_ok());
    }

    #[test]
    fn clearing_forgets_everything() {
        let state = AppState::default();
        let open = source();
        state.set_files(&open, vec![file("a.ts")]);
        state.clear();

        assert!(state.file(&open, "a.ts").is_err());
    }
}
