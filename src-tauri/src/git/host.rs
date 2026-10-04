//! What the core does for an extension's source: diff two files on disk.
//!
//! `git diff --no-index` rather than a diff of our own, so a folder comparison
//! uses the same algorithm, context and output as a repository, goes through
//! the same parser and truncation, and ends up looking and navigating exactly
//! alike.

use difftrek_extension_api::i18n;
use super::command::run_no_index;
use super::model::{ChangedFile, FileDiff};
use super::repository::{binary_diff, diff_from_output, CONTEXT_LINES};
use crate::error::{AppError, AppResult, ErrorKind};
use difftrek_extension_api::source::{DiffStat, Host};
use std::path::Path;

/// Git's own name for a side that does not exist. `diff --no-index` treats it
/// specially on every platform, Windows included.
const NO_FILE: &str = "/dev/null";

pub struct GitHost;

impl Host for GitHost {
    fn diff_files(
        &self,
        file: &ChangedFile,
        old: Option<&Path>,
        new: Option<&Path>,
        max_bytes: usize,
    ) -> AppResult<FileDiff> {
        if file.binary {
            return Ok(binary_diff(file));
        }

        let context = format!("--unified={CONTEXT_LINES}");
        let (old, new) = sides(old, new)?;
        let output = run_no_index(&[
            "--no-color",
            "--no-ext-diff",
            "--no-textconv",
            &context,
            "--",
            &old,
            &new,
        ])?;

        Ok(diff_from_output(file, &output, max_bytes))
    }

    fn diff_stat(&self, old: Option<&Path>, new: Option<&Path>) -> AppResult<DiffStat> {
        let (old, new) = sides(old, new)?;
        let output = run_no_index(&[
            "--no-ext-diff",
            "--no-textconv",
            "--numstat",
            "--",
            &old,
            &new,
        ])?;
        Ok(parse_stat(&output.text()))
    }
}

/// Both sides as arguments, with a missing one spelled the way Git expects.
fn sides(old: Option<&Path>, new: Option<&Path>) -> AppResult<(String, String)> {
    if old.is_none() && new.is_none() {
        return Err(AppError::new(
            ErrorKind::InvalidDiff,
            i18n::t("error.nothingToCompare"),
        ));
    }

    let spell = |path: Option<&Path>| {
        path.map(|path| path.to_string_lossy().into_owned())
            .unwrap_or_else(|| NO_FILE.to_string())
    };

    Ok((spell(old), spell(new)))
}

/// Reads the first `--numstat` line: `added<TAB>removed<TAB>paths`, with `-`
/// for both counts when Git considers either side binary. No line at all means
/// the files are identical.
fn parse_stat(raw: &str) -> DiffStat {
    let Some(line) = raw.lines().next() else {
        return DiffStat {
            additions: Some(0),
            deletions: Some(0),
            binary: false,
        };
    };

    let mut fields = line.split('\t');
    let additions = fields.next().and_then(|count| count.parse().ok());
    let deletions = fields.next().and_then(|count| count.parse().ok());

    DiffStat {
        additions,
        deletions,
        binary: additions.is_none() || deletions.is_none(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::git::model::{FileStatus, LineKind};
    use crate::git::repository::DEFAULT_MAX_DIFF_BYTES;
    use std::fs;

    fn scratch(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("difftrek-host-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn meta(status: FileStatus) -> ChangedFile {
        ChangedFile {
            id: "notes.txt".into(),
            path: "notes.txt".into(),
            old_path: None,
            status,
            additions: None,
            deletions: None,
            binary: false,
        }
    }

    #[test]
    fn parses_counts_binary_markers_and_silence() {
        assert_eq!(
            parse_stat("2\t1\ta => b\n"),
            DiffStat {
                additions: Some(2),
                deletions: Some(1),
                binary: false
            }
        );
        assert_eq!(
            parse_stat("-\t-\ta => b\n"),
            DiffStat {
                additions: None,
                deletions: None,
                binary: true
            }
        );
        assert_eq!(
            parse_stat(""),
            DiffStat {
                additions: Some(0),
                deletions: Some(0),
                binary: false
            }
        );
    }

    #[test]
    fn diffs_two_files_on_disk_into_hunks() {
        let dir = scratch("modified");
        let old = dir.join("old.txt");
        let new = dir.join("new.txt");
        fs::write(&old, "one\ntwo\nthree\n").unwrap();
        fs::write(&new, "one\n2\nthree\nfour\n").unwrap();

        let diff = GitHost
            .diff_files(
                &meta(FileStatus::Modified),
                Some(&old),
                Some(&new),
                DEFAULT_MAX_DIFF_BYTES,
            )
            .unwrap();

        assert_eq!(diff.path, "notes.txt");
        assert_eq!((diff.additions, diff.deletions), (2, 1));
        assert_eq!(diff.hunks.len(), 1);
        assert!(diff.hunks[0]
            .lines
            .iter()
            .any(|line| line.kind == LineKind::Add && line.content == "four"));

        let stat = GitHost.diff_stat(Some(&old), Some(&new)).unwrap();
        assert_eq!(
            (stat.additions, stat.deletions, stat.binary),
            (Some(2), Some(1), false)
        );
    }

    #[test]
    fn a_missing_side_diffs_as_an_added_file() {
        let dir = scratch("added");
        let new = dir.join("new.txt");
        fs::write(&new, "hello\nworld\n").unwrap();

        let diff = GitHost
            .diff_files(
                &meta(FileStatus::Added),
                None,
                Some(&new),
                DEFAULT_MAX_DIFF_BYTES,
            )
            .unwrap();

        assert_eq!((diff.additions, diff.deletions), (2, 0));
        assert_eq!(diff.hunks[0].new_start, 1);
    }

    #[test]
    fn binary_content_is_reported_by_the_stat() {
        let dir = scratch("binary");
        let old = dir.join("a.bin");
        let new = dir.join("b.bin");
        fs::write(&old, [0u8, 1, 2]).unwrap();
        fs::write(&new, [0u8, 1, 3]).unwrap();

        assert!(GitHost.diff_stat(Some(&old), Some(&new)).unwrap().binary);
    }

    #[test]
    fn an_oversized_diff_is_truncated_like_any_other() {
        let dir = scratch("truncated");
        let old = dir.join("old.txt");
        let new = dir.join("new.txt");
        fs::write(&old, "a\n").unwrap();
        fs::write(&new, "b\n").unwrap();

        let diff = GitHost
            .diff_files(&meta(FileStatus::Modified), Some(&old), Some(&new), 10)
            .unwrap();

        assert!(diff.truncated);
        assert!(diff.hunks.is_empty());
    }
}
