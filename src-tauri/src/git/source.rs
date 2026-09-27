//! A Git repository as a [`Source`]: the built-in one, opened at startup when
//! Diff Trek is launched inside a working tree.
//!
//! Everything here delegates to [`super::repository`]; this only binds a root
//! and a comparison together so the command layer can treat a repository like
//! any other source.

use super::model::{ChangedFile, ComparisonInfo, FileDiff, RepositoryInfo};
use super::repository;
use super::revision::Comparison;
use crate::error::AppResult;
use difftrek_extension_api::source::{Side, Source};
use std::any::Any;
use std::path::{Path, PathBuf};

pub struct GitSource {
    root: PathBuf,
    comparison: Comparison,
    /// The commit or range from the command line, for the header.
    label: Option<ComparisonInfo>,
}

impl GitSource {
    /// A root and its comparison are only ever set together, so a root can
    /// never be paired with another repository's commits.
    pub fn new(root: PathBuf, comparison: Comparison, label: Option<ComparisonInfo>) -> Self {
        Self {
            root,
            comparison,
            label,
        }
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    pub fn comparison(&self) -> &Comparison {
        &self.comparison
    }
}

impl Source for GitSource {
    fn info(&self) -> AppResult<RepositoryInfo> {
        repository::info(&self.root, self.label.clone())
    }

    fn changed_files(&self) -> AppResult<Vec<ChangedFile>> {
        repository::changed_files(&self.root, &self.comparison)
    }

    fn file_diff(&self, file: &ChangedFile, max_bytes: usize) -> AppResult<FileDiff> {
        repository::file_diff(&self.root, &self.comparison, file, max_bytes)
    }

    /// The original side of a rename is read from the path it had before;
    /// between commits a rename is the common case.
    fn file_bytes(&self, file: &ChangedFile, side: Side) -> AppResult<Vec<u8>> {
        let path = match side {
            Side::Original => file.old_path.as_deref().unwrap_or(&file.path),
            Side::Working => &file.path,
        };

        repository::file_bytes(&self.root, &self.comparison, path, side)
    }

    fn as_any(&self) -> &dyn Any {
        self
    }
}
