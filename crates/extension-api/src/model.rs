//! Domain types shared by every source of a diff and the Tauri command layer.
//!
//! These types are serialised straight to the frontend, so the wire shape is
//! part of Diff Trek's public contract. Keep `rename_all = "camelCase"` in
//! sync with `src/types/diff.ts`.

use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum FileStatus {
    Modified,
    Added,
    Deleted,
    Renamed,
    Copied,
    TypeChanged,
}

impl FileStatus {
    /// Parses the single-letter status produced by `git diff --name-status`.
    /// Similarity scores (`R100`, `C75`) are stripped by the caller.
    pub fn from_code(code: char) -> Option<Self> {
        match code {
            'M' => Some(Self::Modified),
            'A' => Some(Self::Added),
            'D' => Some(Self::Deleted),
            'R' => Some(Self::Renamed),
            'C' => Some(Self::Copied),
            'T' => Some(Self::TypeChanged),
            _ => None,
        }
    }

    /// `R` and `C` records carry both an old and a new path.
    pub fn has_old_path(self) -> bool {
        matches!(self, Self::Renamed | Self::Copied)
    }
}

/// Lightweight metadata for one changed file.
///
/// Deliberately cheap to produce: the whole list is returned before any diff
/// body is read, so the UI can render the document skeleton immediately.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChangedFile {
    /// Stable logical id. Equal to `path`, which is unique within one diff.
    pub id: String,
    pub path: String,
    pub old_path: Option<String>,
    pub status: FileStatus,
    /// `None` for binary files, where Git reports `-` instead of a count.
    pub additions: Option<u32>,
    pub deletions: Option<u32>,
    pub binary: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum LineKind {
    Context,
    Add,
    Delete,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffLine {
    pub kind: LineKind,
    pub old_line_number: Option<u32>,
    pub new_line_number: Option<u32>,
    pub content: String,
    /// True when Git emitted `\ No newline at end of file` after this line.
    pub no_newline: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffHunk {
    /// `<path>:hunk:<index>` — stable for the lifetime of one diff snapshot.
    pub id: String,
    pub old_start: u32,
    pub old_lines: u32,
    pub new_start: u32,
    pub new_lines: u32,
    /// The function/section context Git appends after the `@@` marker.
    pub heading: Option<String>,
    pub lines: Vec<DiffLine>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileDiff {
    pub id: String,
    pub path: String,
    pub old_path: Option<String>,
    pub status: FileStatus,
    pub binary: bool,
    /// Set when the diff exceeded the caller's byte budget. `hunks` is then
    /// empty and the UI offers to load it explicitly.
    pub truncated: bool,
    pub additions: u32,
    pub deletions: u32,
    /// Longest rendered line in the diff, in characters. The frontend uses
    /// this to size the horizontal scroll area without measuring the DOM.
    pub max_line_length: u32,
    pub hunks: Vec<DiffHunk>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepositoryInfo {
    /// Which source this is: `git` for a repository, or the id of the
    /// extension that opened it. The frontend uses it to decide which
    /// extension panels belong on an empty diff.
    pub source: String,
    /// Absolute path to the repository working tree root.
    pub root: String,
    /// Directory name of the root, for display.
    pub name: String,
    /// Branch name, or `None` when HEAD is detached.
    pub branch: Option<String>,
    /// Abbreviated HEAD commit, or `None` in a repository with no commits.
    pub head: Option<String>,
    pub detached: bool,
    /// Set when Diff Trek was given a commit or range to show instead of the
    /// working tree.
    pub comparison: Option<ComparisonInfo>,
    /// What a file on only one side means here, which decides how the
    /// document words it.
    pub one_sided: OneSided,
    /// What the two sides are called where the document names them.
    pub side_names: SideNames,
}

/// The names of the two sides, as the document shows them — on an image's
/// two panes, and in "missing from …".
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SideNames {
    pub original: String,
    pub working: String,
}

impl Default for SideNames {
    /// A repository's two sides are two moments in the same tree.
    fn default() -> Self {
        Self {
            original: "Before".to_string(),
            working: "After".to_string(),
        }
    }
}

/// What a file present on only one side of a comparison means.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum OneSided {
    /// History: between two versions of the same tree the file was added or
    /// deleted, so that is what the document says.
    #[default]
    Change,
    /// Presence: two folders are not two versions of anything, so a file
    /// found on one side is simply missing from the other.
    Missing,
}

/// A commit or range from the command line, for the header.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ComparisonInfo {
    /// The arguments as typed, e.g. `main...HEAD`.
    pub label: String,
    /// Abbreviated base commit; `None` when the target is a root commit and is
    /// compared against nothing.
    pub base: Option<String>,
    /// Abbreviated target commit.
    pub target: String,
}
