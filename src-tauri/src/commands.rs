//! The Tauri command surface.
//!
//! This is the core's whole frontend/backend boundary; extensions add their
//! own commands as Tauri plugins. Commands stay thin: resolve state, call the
//! open source, return domain types. No presentation logic here, and no Git
//! logic in the frontend.

use crate::ai_changelog::service::{self as changelog, ChangelogView};
use crate::error::{AppError, AppResult, ErrorKind};
use crate::git::model::{ChangedFile, FileDiff, RepositoryInfo};
use crate::git_alias::{self, AliasStatus, ConfigTarget};
use crate::git::repository::{self, Side, DEFAULT_MAX_DIFF_BYTES};
use crate::git::revision::{self, Comparison};
use crate::git::source::GitSource;
use crate::launch::{self, launch_target, LaunchOptions};
use crate::settings::{self, Settings};
use crate::state::AppState;
use difftrek_extension_api::source::{ActiveSource, Source};
use std::sync::Arc;
use tauri::{Manager, Runtime, State};

/// Where `settings.json` lives, per the platform's own conventions.
fn settings_path<R: Runtime>(app: &tauri::AppHandle<R>) -> std::path::PathBuf {
    let config_dir = app
        .path()
        .app_config_dir()
        .unwrap_or_else(|_| std::path::PathBuf::from("."));

    settings::file_path(&config_dir)
}

/// Scales the whole interface to a stored level.
///
/// Page zoom is a property of the webview rather than of the document, so it
/// is the shell that applies it: the frontend chooses a level and never
/// touches the scaling itself. A platform that will not zoom is not a reason
/// to fail a save, so the error is reported and swallowed.
fn apply_zoom<R: Runtime>(app: &tauri::AppHandle<R>, settings: Settings) {
    let Some(webview) = app.get_webview_window("main") else {
        return;
    };

    if let Err(err) = webview.set_zoom(settings::zoom_factor(settings.zoom)) {
        eprintln!("[difftrek] could not set the zoom level: {err}");
    }
}

/// Applies the stored zoom during setup, before the window is first shown, so
/// that a scaled interface opens scaled rather than snapping to size a moment
/// after it appears.
pub fn apply_stored_zoom<R: Runtime>(app: &tauri::AppHandle<R>) {
    apply_zoom(app, settings::load_from(&settings_path(app)));
}

/// Current preferences.
///
/// Infallible by design: a missing or damaged file reads as the defaults, so
/// the UI always has something to render and never blocks on this.
#[tauri::command]
pub fn get_settings<R: Runtime>(app: tauri::AppHandle<R>) -> Settings {
    settings::load_from(&settings_path(&app))
}

/// Stores preferences, returning what was actually stored.
///
/// The value comes back because it is clamped on the way in, and the UI should
/// show what it got rather than what it asked for.
#[tauri::command]
pub fn set_settings<R: Runtime>(
    app: tauri::AppHandle<R>,
    settings: Settings,
) -> AppResult<Settings> {
    let path = settings_path(&app);
    settings::save_to(&path, settings)?;

    // Storing the zoom is also applying it: the level and the size of what is
    // on screen are the same fact, and letting the frontend set one without
    // the other would let them drift.
    let stored = settings.sanitised();
    apply_zoom(&app, stored);

    Ok(stored)
}

/// How the app was launched.
///
/// The frontend reads this once before anything else. Under `--example` it
/// serves its own sample diff and never calls the commands below, which is why
/// nothing here has to know about example mode.
#[tauri::command]
pub fn get_launch_options() -> LaunchOptions {
    launch::launch_options()
}

/// Describes what is open, for the header.
///
/// The first call opens the repository Diff Trek was launched in, and
/// resolves any commit or range it was launched with — a revision that does
/// not resolve fails here, so it reaches the startup error screen rather than
/// an empty diff. Once a source is open, whether that repository or one an
/// extension opened since, it is described instead: the frontend calls this
/// again when it reloads onto an extension's source.
#[tauri::command]
pub fn get_repository_info(
    state: State<'_, AppState>,
    sources: State<'_, ActiveSource>,
) -> AppResult<RepositoryInfo> {
    // Whatever is listed next comes from the source described now.
    state.clear();

    if let Some(source) = sources.current() {
        return source.info();
    }

    let target = launch_target();
    let root = repository::discover(&target.directory)?;

    let (comparison, label) = match revision::comparison_for(&root, &target.revisions)? {
        Some(resolved) => (resolved.comparison, Some(resolved.info)),
        None => (Comparison::WorkingTree, None),
    };

    let source = Arc::new(GitSource::new(root, comparison, label));
    sources.open(source.clone());
    source.info()
}

/// The AI changelog describing what is on screen, if there is one.
///
/// `None` is the ordinary case and not an error: most diffs have no changelog,
/// and one that no longer describes this comparison at all is the same as none.
/// A changelog that only partly matches *is* returned, with a summary saying
/// how much of it still applies — a developer editing the code after the notes
/// were written is normal, and losing every note over it would not be.
///
/// Changelogs are written against Git diffs, so a source that is not a
/// repository never has one.
#[tauri::command]
pub fn get_ai_changelog(sources: State<'_, ActiveSource>) -> AppResult<Option<ChangelogView>> {
    let source = sources.require()?;
    let Some(git) = source.as_any().downcast_ref::<GitSource>() else {
        return Ok(None);
    };

    Ok(changelog::load(git.root(), git.comparison()).map(ChangelogView::from))
}

#[tauri::command]
pub fn get_changed_files(
    state: State<'_, AppState>,
    sources: State<'_, ActiveSource>,
) -> AppResult<Vec<ChangedFile>> {
    // Listed and stored against one source, taken once: an extension opening
    // another meanwhile cannot pair this listing with it.
    let source = sources.require()?;
    let files = source.changed_files()?;
    state.set_files(&source, files.clone());
    Ok(files)
}

/// Loads one file's diff.
///
/// `max_bytes` lets the UI re-request a diff it previously received as
/// `truncated`, without changing the default budget for everything else.
#[tauri::command]
pub fn get_file_diff(
    state: State<'_, AppState>,
    sources: State<'_, ActiveSource>,
    path: String,
    max_bytes: Option<usize>,
) -> AppResult<FileDiff> {
    let source = sources.require()?;
    let meta = state.file(&source, &path)?;
    source.file_diff(&meta, max_bytes.unwrap_or(DEFAULT_MAX_DIFF_BYTES))
}

#[tauri::command]
pub fn get_file_contents(
    state: State<'_, AppState>,
    sources: State<'_, ActiveSource>,
    path: String,
    side: String,
) -> AppResult<String> {
    let source = sources.require()?;
    let meta = state.file(&source, &path)?;

    if meta.binary {
        return Err(AppError::new(
            ErrorKind::BinaryFile,
            format!("{path} is a binary file."),
        ));
    }

    let bytes = source.file_bytes(&meta, Side::parse(&side)?)?;
    Ok(String::from_utf8_lossy(&bytes).into_owned())
}

/// One side of a changed image, as raw bytes.
///
/// Returned as an `ipc::Response` so the bytes cross the boundary as a binary
/// body — the webview receives an `ArrayBuffer` — rather than as a JSON array
/// of numbers several times the size. Only images, by extension, and only up
/// to a size, whichever source is doing the reading.
#[tauri::command]
pub fn get_image_bytes(
    state: State<'_, AppState>,
    sources: State<'_, ActiveSource>,
    path: String,
    side: String,
) -> AppResult<tauri::ipc::Response> {
    let source = sources.require()?;
    let meta = state.file(&source, &path)?;
    let side = Side::parse(&side)?;

    let source_path = match side {
        Side::Original => meta.old_path.as_deref().unwrap_or(&meta.path),
        Side::Working => &meta.path,
    };
    repository::require_image_path(source_path)?;

    let bytes = source.file_bytes(&meta, side)?;
    repository::limit_image(source_path, bytes).map(tauri::ipc::Response::new)
}

/// What installing the `git dt` alias would do: the command, the executable it
/// would launch, and any alias already in its place. Read-only.
#[tauri::command]
pub fn get_git_alias_status() -> AppResult<AliasStatus> {
    git_alias::status(&git_alias::current_binary()?, &ConfigTarget::Global)
}

/// Installs the `git dt` alias in the user's global Git configuration,
/// pointing at this executable. Only ever called after the user confirms.
#[tauri::command]
pub fn install_git_alias() -> AppResult<AliasStatus> {
    git_alias::install(&git_alias::current_binary()?, &ConfigTarget::Global)
}
