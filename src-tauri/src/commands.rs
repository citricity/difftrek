//! The Tauri command surface.
//!
//! This is the core's whole frontend/backend boundary; extensions add their
//! own commands as Tauri plugins. Commands stay thin: resolve state, call the
//! open source, return domain types. No presentation logic here, and no Git
//! logic in the frontend.

use difftrek_extension_api::i18n;
use crate::ai_changelog::service::{self as changelog, ChangelogView};
use crate::error::{AppError, AppResult, ErrorKind};
use crate::git::model::{ChangedFile, FileDiff, RepositoryInfo};
use crate::git_alias::{self, AliasStatus, ConfigTarget};
use crate::git::repository::{self, Side, DEFAULT_MAX_DIFF_BYTES};
use crate::git::revision::{self, Comparison};
use crate::git::source::GitSource;
use crate::launch::LaunchOptions;
use crate::locale;
use crate::settings::{self, Settings};
use crate::state::AppState;
use crate::windows::Windows;
use difftrek_extension_api::source::{ActiveSource, Source};
use std::sync::Arc;
use tauri::{Emitter, EventTarget, Manager, Runtime, State, WebviewWindow};

/// Sent to every other window when one stores new settings, carrying what was
/// stored, so that a language or wrapping change made in one window is not
/// left unseen in the rest until they reload.
pub const SETTINGS_CHANGED_EVENT: &str = "settings-changed";

/// Where `settings.json` lives, per the platform's own conventions.
fn settings_path<R: Runtime>(app: &tauri::AppHandle<R>) -> std::path::PathBuf {
    let config_dir = app
        .path()
        .app_config_dir()
        .unwrap_or_else(|_| std::path::PathBuf::from("."));

    settings::file_path(&config_dir)
}

/// Scales the whole interface to a stored level, in every window.
///
/// Page zoom is a property of the webview rather than of the document, so it
/// is the shell that applies it: the frontend chooses a level and never
/// touches the scaling itself. The level is a setting, and settings belong to
/// the app rather than to a window, so every window takes it.
fn apply_zoom<R: Runtime>(app: &tauri::AppHandle<R>, settings: &Settings) {
    for webview in app.webview_windows().values() {
        zoom(webview, settings);
    }
}

/// A platform that will not zoom is not a reason to fail a save, so the error
/// is reported and swallowed.
fn zoom<R: Runtime>(webview: &WebviewWindow<R>, settings: &Settings) {
    if let Err(err) = webview.set_zoom(settings::zoom_factor(settings.zoom)) {
        eprintln!("[difftrek] could not set the zoom level: {err}");
    }
}

/// Applies the stored zoom during setup, before the window is first shown, so
/// that a scaled interface opens scaled rather than snapping to size a moment
/// after it appears.
pub fn apply_stored_zoom<R: Runtime>(app: &tauri::AppHandle<R>) {
    apply_zoom(app, &settings::load_from(&settings_path(app)));
}

/// The same for a window opened later.
pub fn apply_stored_zoom_to<R: Runtime>(app: &tauri::AppHandle<R>, window: &WebviewWindow<R>) {
    zoom(window, &settings::load_from(&settings_path(app)));
}

/// The settings as stored, for setup to read before the window exists.
pub fn stored_settings<R: Runtime>(app: &tauri::AppHandle<R>) -> Settings {
    settings::load_from(&settings_path(app))
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
    window: WebviewWindow<R>,
    settings: Settings,
) -> AppResult<Settings> {
    let path = settings_path(&app);
    settings::save_to(&path, &settings)?;

    // Storing the zoom is also applying it: the level and the size of what is
    // on screen are the same fact, and letting the frontend set one without
    // the other would let them drift.
    let stored = settings.sanitised();
    apply_zoom(&app, &stored);

    // The same goes for the language, which the shell speaks too: the menu
    // bar is rebuilt in it, and errors from here on are worded in it.
    if locale::apply(&stored.language) {
        if let Err(err) = crate::menu::rebuild(&app) {
            eprintln!("[difftrek] could not rebuild the menu: {err}");
        }
    }

    // Every other window hears what was stored; the one that asked already
    // has it, as this command's answer.
    let from = window.label().to_string();
    let others = |target: &EventTarget| match target {
        EventTarget::WebviewWindow { label } => *label != from,
        _ => false,
    };
    if let Err(err) = app.emit_filter(SETTINGS_CHANGED_EVENT, &stored, others) {
        eprintln!("[difftrek] could not share the new settings: {err}");
    }

    Ok(stored)
}

/// The operating system's preferred languages, most preferred first.
///
/// The webview's own `navigator.languages` is not a substitute: on macOS it
/// reports the languages the app bundle declares, not the user's.
#[tauri::command]
pub fn get_system_locales() -> Vec<String> {
    locale::system_locales()
}

/// How the calling window was launched.
///
/// The frontend reads this once before anything else. Under `--example` it
/// serves its own sample diff and never calls the commands below, which is why
/// nothing here has to know about example mode. Each window answers for
/// itself: `git dt --example` run while a repository is open opens the sample
/// beside it.
#[tauri::command]
pub fn get_launch_options(window: WebviewWindow, windows: State<'_, Windows>) -> LaunchOptions {
    windows.launch(window.label()).options
}

/// Describes what is open in the calling window, for the header.
///
/// The first call opens the repository the window was launched on, and
/// resolves any commit or range it was launched with — a revision that does
/// not resolve fails here, so it reaches the startup error screen rather than
/// an empty diff. Once a source is open, whether that repository or one an
/// extension opened since, it is described instead: the frontend calls this
/// again when it reloads onto an extension's source.
#[tauri::command]
pub fn get_repository_info(
    window: WebviewWindow,
    windows: State<'_, Windows>,
    state: State<'_, AppState>,
    sources: State<'_, ActiveSource>,
) -> AppResult<RepositoryInfo> {
    let window = window.label();

    // Whatever is listed next comes from the source described now.
    state.clear(window);

    if let Some(source) = sources.current(window) {
        return source.info();
    }

    // A window opened empty, from File > New Window, has nowhere to look.
    // It says so, which is the landing screen, where an extension may offer
    // something else to open.
    let Some(target) = windows.launch(window).target else {
        return Err(AppError::not_a_repository());
    };
    let root = repository::discover(&target.directory)?;

    let (comparison, label) = match revision::comparison_for(&root, &target.revisions)? {
        Some(resolved) => (resolved.comparison, Some(resolved.info)),
        None => (Comparison::WorkingTree, None),
    };

    let source = Arc::new(GitSource::new(root, comparison, label));
    sources.open(window, source.clone());
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
pub fn get_ai_changelog(
    window: WebviewWindow,
    sources: State<'_, ActiveSource>,
) -> AppResult<Option<ChangelogView>> {
    let source = sources.require(window.label())?;
    let Some(git) = source.as_any().downcast_ref::<GitSource>() else {
        return Ok(None);
    };

    Ok(changelog::load(git.root(), git.comparison()).map(ChangelogView::from))
}

#[tauri::command]
pub fn get_changed_files(
    window: WebviewWindow,
    state: State<'_, AppState>,
    sources: State<'_, ActiveSource>,
) -> AppResult<Vec<ChangedFile>> {
    // Listed and stored against one source, taken once: an extension opening
    // another meanwhile cannot pair this listing with it.
    let label = window.label();
    let source = sources.require(label)?;
    let files = source.changed_files()?;
    state.set_files(label, &source, files.clone());
    Ok(files)
}

/// Loads one file's diff.
///
/// `max_bytes` lets the UI re-request a diff it previously received as
/// `truncated`, without changing the default budget for everything else.
#[tauri::command]
pub fn get_file_diff(
    window: WebviewWindow,
    state: State<'_, AppState>,
    sources: State<'_, ActiveSource>,
    path: String,
    max_bytes: Option<usize>,
) -> AppResult<FileDiff> {
    let label = window.label();
    let source = sources.require(label)?;
    let meta = state.file(label, &source, &path)?;
    source.file_diff(&meta, max_bytes.unwrap_or(DEFAULT_MAX_DIFF_BYTES))
}

#[tauri::command]
pub fn get_file_contents(
    window: WebviewWindow,
    state: State<'_, AppState>,
    sources: State<'_, ActiveSource>,
    path: String,
    side: String,
) -> AppResult<String> {
    let label = window.label();
    let source = sources.require(label)?;
    let meta = state.file(label, &source, &path)?;

    if meta.binary {
        return Err(AppError::new(
            ErrorKind::BinaryFile,
            i18n::tf("error.binaryFile", &[("path", &path)]),
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
    window: WebviewWindow,
    state: State<'_, AppState>,
    sources: State<'_, ActiveSource>,
    path: String,
    side: String,
) -> AppResult<tauri::ipc::Response> {
    let label = window.label();
    let source = sources.require(label)?;
    let meta = state.file(label, &source, &path)?;
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
