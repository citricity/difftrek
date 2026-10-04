//! Where a diff comes from.
//!
//! Every command the document uses — the header, the file list, one file's
//! diff, one side of a file — is answered by the [`Source`] open in the window
//! that asked. The core opens a Git repository in a window launched on one; an
//! extension opens anything else through [`ActiveSource::open`], and that
//! window's frontend then reloads onto it.

use crate::error::{AppError, AppResult, ErrorKind};
use crate::model::{ChangedFile, FileDiff, RepositoryInfo};
use std::any::Any;
use std::collections::HashMap;
use std::path::Path;
use std::sync::{Arc, Mutex, MutexGuard};

/// Which side of the comparison to read.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Side {
    /// The left-hand side: the index, a comparison's base commit, the first
    /// folder.
    Original,
    /// The right-hand side: the file on disk, a comparison's target commit,
    /// the second folder.
    Working,
}

impl Side {
    pub fn parse(value: &str) -> AppResult<Self> {
        match value {
            "original" => Ok(Self::Original),
            "working" => Ok(Self::Working),
            other => Err(
                AppError::new(ErrorKind::InvalidDiff, crate::i18n::t("error.unknownSide"))
                    .with_detail(format!("side={other}")),
            ),
        }
    }
}

/// Something that can be shown as a diff.
///
/// Calls arrive on Tauri's command threads, possibly several at once — the
/// frontend loads up to five diffs in parallel — so an implementation must be
/// safe to share.
pub trait Source: Send + Sync + 'static {
    /// What the header shows.
    fn info(&self) -> AppResult<RepositoryInfo>;

    /// Every file that differs, cheaply: this is read before any diff body,
    /// so the document skeleton can render straight away.
    fn changed_files(&self) -> AppResult<Vec<ChangedFile>>;

    /// One file's diff. `file` is an entry from [`Source::changed_files`];
    /// a diff whose raw form exceeds `max_bytes` comes back `truncated`.
    fn file_diff(&self, file: &ChangedFile, max_bytes: usize) -> AppResult<FileDiff>;

    /// One whole side of a file, exactly as stored.
    ///
    /// The core applies its own limits on top — text for expanding context,
    /// images by extension and size — so a source only has to read.
    fn file_bytes(&self, file: &ChangedFile, side: Side) -> AppResult<Vec<u8>>;

    /// Lets the core recognise its own sources: features that only make sense
    /// for a Git repository, such as AI changelogs, look for one here.
    fn as_any(&self) -> &dyn Any;
}

/// What the core does on a source's behalf.
///
/// Diffing is the core's business — its Git invocation, parser and limits are
/// what make every file in the document look and navigate alike — so a source
/// that has two files on disk hands them over rather than diffing them itself.
pub trait Host: Send + Sync + 'static {
    /// Diffs two files. `None` stands for a side that does not exist: `old` for
    /// an added file, `new` for a deleted one. `file` supplies the id, paths
    /// and status the result carries.
    fn diff_files(
        &self,
        file: &ChangedFile,
        old: Option<&Path>,
        new: Option<&Path>,
        max_bytes: usize,
    ) -> AppResult<FileDiff>;

    /// Line counts for the file list, as `git diff --numstat` gives them:
    /// `None` for both, and `binary` set, when either side is not text.
    fn diff_stat(&self, old: Option<&Path>, new: Option<&Path>) -> AppResult<DiffStat>;
}

/// Lines added and removed between two files.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct DiffStat {
    pub additions: Option<u32>,
    pub deletions: Option<u32>,
    pub binary: bool,
}

/// The source open in each window, shared as Tauri state.
///
/// Every window shows its own comparison — one repository here, a range in
/// another, two folders in a third — so sources are kept per window, by the
/// window's label. The core manages one of these; an extension's commands
/// reach it with `app.state::<ActiveSource>()` and the label of the window
/// that called them (`window.label()`). Opening a source replaces that
/// window's previous one whole, which is why its frontend reloads afterwards
/// rather than patching what it has. Other windows are untouched.
pub struct ActiveSource {
    current: Mutex<HashMap<String, Arc<dyn Source>>>,
    host: Arc<dyn Host>,
}

impl ActiveSource {
    pub fn new(host: Arc<dyn Host>) -> Self {
        Self {
            current: Mutex::new(HashMap::new()),
            host,
        }
    }

    /// Makes `source` what every later command from `window` reads.
    pub fn open(&self, window: &str, source: Arc<dyn Source>) {
        self.lock().insert(window.to_string(), source);
    }

    /// The source open in `window`, if any. Cloned out so a slow call on it
    /// never holds the lock another command is waiting for.
    pub fn current(&self, window: &str) -> Option<Arc<dyn Source>> {
        self.lock().get(window).cloned()
    }

    /// The source open in `window`, or the error the startup screen knows how
    /// to show.
    pub fn require(&self, window: &str) -> AppResult<Arc<dyn Source>> {
        self.current(window).ok_or_else(AppError::not_a_repository)
    }

    /// Forgets `window`'s source: the window has closed, or is about to open
    /// its launch target afresh.
    pub fn close(&self, window: &str) {
        self.lock().remove(window);
    }

    /// Every window's source, for finding a window already showing something.
    pub fn all(&self) -> Vec<(String, Arc<dyn Source>)> {
        self.lock()
            .iter()
            .map(|(window, source)| (window.clone(), Arc::clone(source)))
            .collect()
    }

    /// What a new source should diff with.
    pub fn host(&self) -> Arc<dyn Host> {
        Arc::clone(&self.host)
    }

    /// A poisoned lock means another command panicked mid-swap. Each value is
    /// a single pointer, never half-written, so carrying on is safe.
    fn lock(&self) -> MutexGuard<'_, HashMap<String, Arc<dyn Source>>> {
        self.current.lock().unwrap_or_else(|err| err.into_inner())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    struct NoHost;

    impl Host for NoHost {
        fn diff_files(
            &self,
            _: &ChangedFile,
            _: Option<&Path>,
            _: Option<&Path>,
            _: usize,
        ) -> AppResult<FileDiff> {
            unreachable!()
        }

        fn diff_stat(&self, _: Option<&Path>, _: Option<&Path>) -> AppResult<DiffStat> {
            unreachable!()
        }
    }

    struct Named(&'static str);

    impl Source for Named {
        fn info(&self) -> AppResult<RepositoryInfo> {
            Ok(RepositoryInfo {
                source: "test".to_string(),
                root: String::new(),
                name: self.0.to_string(),
                branch: None,
                head: None,
                detached: false,
                comparison: None,
                one_sided: Default::default(),
                side_names: Default::default(),
            })
        }

        fn changed_files(&self) -> AppResult<Vec<ChangedFile>> {
            Ok(Vec::new())
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

    #[test]
    fn nothing_is_open_until_a_source_is() {
        let active = ActiveSource::new(Arc::new(NoHost));
        assert!(active.current("main").is_none());
        assert_eq!(
            active.require("main").err().map(|error| error.kind),
            Some(ErrorKind::NotARepository)
        );
    }

    #[test]
    fn opening_a_source_replaces_the_previous_one() {
        let active = ActiveSource::new(Arc::new(NoHost));
        active.open("main", Arc::new(Named("first")));
        active.open("main", Arc::new(Named("second")));

        let info = active.require("main").unwrap().info().unwrap();
        assert_eq!(info.name, "second");
    }

    #[test]
    fn each_window_has_its_own_source() {
        let active = ActiveSource::new(Arc::new(NoHost));
        active.open("main", Arc::new(Named("repository")));
        active.open("window-1", Arc::new(Named("folders")));

        assert_eq!(active.require("main").unwrap().info().unwrap().name, "repository");
        assert_eq!(active.require("window-1").unwrap().info().unwrap().name, "folders");
        assert!(active.current("window-2").is_none());
    }

    #[test]
    fn closing_a_window_forgets_only_its_source() {
        let active = ActiveSource::new(Arc::new(NoHost));
        active.open("main", Arc::new(Named("repository")));
        active.open("window-1", Arc::new(Named("folders")));

        active.close("window-1");

        assert!(active.current("window-1").is_none());
        assert!(active.current("main").is_some());
        assert_eq!(active.all().len(), 1);
    }

    #[test]
    fn a_source_can_be_recognised_by_type() {
        let active = ActiveSource::new(Arc::new(NoHost));
        active.open("main", Arc::new(Named("git")));

        let source = active.require("main").unwrap();
        assert!(source.as_any().downcast_ref::<Named>().is_some());
    }

    #[test]
    fn side_parses_known_values() {
        assert_eq!(Side::parse("original").unwrap(), Side::Original);
        assert_eq!(Side::parse("working").unwrap(), Side::Working);
    }

    #[test]
    fn side_rejects_unknown_values() {
        let error = Side::parse("staged").unwrap_err();
        assert_eq!(error.kind, ErrorKind::InvalidDiff);
    }
}
