//! Process-wide state: the changed-file list last read from the open source.
//!
//! The file list is cached because every `get_file_diff` call needs the
//! metadata (status, rename pair, binary flag) for the path it was given, and
//! re-listing the source per file would be wasteful. Which source is open is
//! kept separately, in the extension API's `ActiveSource`, because extensions
//! open sources too.

use crate::error::{AppError, AppResult};
use crate::git::model::ChangedFile;
use std::sync::Mutex;

#[derive(Default)]
pub struct AppState {
    files: Mutex<Vec<ChangedFile>>,
}

impl AppState {
    pub fn set_files(&self, files: Vec<ChangedFile>) {
        *self.lock() = files;
    }

    pub fn file(&self, path: &str) -> AppResult<ChangedFile> {
        self.lock()
            .iter()
            .find(|file| file.path == path)
            .cloned()
            .ok_or_else(|| AppError::file_not_found(path))
    }

    /// A poisoned lock means another command panicked. Recovering the guard is
    /// safe here: the cached data is plain values, not a half-updated
    /// invariant, and refusing every later command would be worse.
    fn lock(&self) -> std::sync::MutexGuard<'_, Vec<ChangedFile>> {
        self.files.lock().unwrap_or_else(|err| err.into_inner())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::git::model::FileStatus;

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
        state.set_files(vec![file("a.ts"), file("b.ts")]);

        assert_eq!(state.file("b.ts").unwrap().path, "b.ts");
        assert!(state.file("missing.ts").is_err());
    }

    #[test]
    fn a_new_listing_replaces_the_old_one() {
        let state = AppState::default();
        state.set_files(vec![file("a.ts")]);
        state.set_files(vec![file("b.ts")]);

        assert!(state.file("a.ts").is_err());
    }
}
