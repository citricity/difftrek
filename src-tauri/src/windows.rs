//! One process, any number of windows.
//!
//! Every `git dt` used to start a process of its own, and macOS gives every
//! process its own Dock icon, so a morning's reviewing left a row of identical
//! icons with no way to tell them apart. Now the first launch is the only
//! process: the single-instance plugin hands each later launch's arguments to
//! it, and it opens a window for them — or, when a window already shows that
//! repository and range, brings that one forward and reloads it. One process
//! means one Dock icon, whose right-click menu (and the Window menu) lists the
//! windows by title.
//!
//! What a window shows is per window all the way down: its launch record here,
//! its source in `ActiveSource`, its file listing in `AppState`. Closing a
//! window forgets all three. Closing the last one quits, as before.
//!
//! The matching rule is kept free of Tauri (`window_showing`) so it is tested
//! without a running app.

use crate::git::repository;
use crate::git::source::GitSource;
use crate::launch::WindowLaunch;
use crate::state::AppState;
use difftrek_extension_api::source::ActiveSource;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Mutex, MutexGuard};
use tauri::{
    AppHandle, Emitter, Manager, Runtime, WebviewWindow, WebviewWindowBuilder, WindowEvent,
};

/// The window Tauri creates from the configuration at startup.
pub const MAIN: &str = "main";

/// Sent to one window to throw its session away and load afresh, after
/// `git dt` was run again for what it already shows.
pub const RELOAD_EVENT: &str = "reload-requested";

/// How far down and right a new window opens from the one in front, in
/// logical pixels, so it does not sit exactly on top and look like nothing
/// happened.
const CASCADE: f64 = 28.0;

/// The launch record of every open window, and which one was last in front.
#[derive(Default)]
pub struct Windows {
    launches: Mutex<HashMap<String, WindowLaunch>>,
    last_focused: Mutex<Option<String>>,
    next: AtomicUsize,
}

impl Windows {
    pub fn register(&self, label: &str, launch: WindowLaunch) {
        lock(&self.launches).insert(label.to_string(), launch);
    }

    /// How `label` was launched. A window this does not know of has nothing to
    /// open, which is the safe answer: it shows the landing screen.
    pub fn launch(&self, label: &str) -> WindowLaunch {
        lock(&self.launches)
            .get(label)
            .cloned()
            .unwrap_or_else(WindowLaunch::empty)
    }

    fn launches(&self) -> Vec<(String, WindowLaunch)> {
        lock(&self.launches)
            .iter()
            .map(|(label, launch)| (label.clone(), launch.clone()))
            .collect()
    }

    fn forget(&self, label: &str) {
        lock(&self.launches).remove(label);
        let mut focused = lock(&self.last_focused);
        if focused.as_deref() == Some(label) {
            *focused = None;
        }
    }

    fn focused(&self, label: &str) {
        *lock(&self.last_focused) = Some(label.to_string());
    }

    fn last_focused(&self) -> Option<String> {
        lock(&self.last_focused).clone()
    }

    /// Labels are never reused, so an event or a late command meant for a
    /// closed window can never land in a new one.
    fn next_label(&self) -> String {
        format!("window-{}", self.next.fetch_add(1, Ordering::Relaxed) + 1)
    }
}

/// Recovering a poisoned guard is safe: the maps hold plain values, each
/// written in one step.
fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(|err| err.into_inner())
}

/// What a window is showing, as far as deciding whether a launch is for it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Showing {
    pub label: String,
    pub example: bool,
    /// The root of the Git repository open in it, if what is open is one.
    pub repository: Option<PathBuf>,
    pub revisions: Vec<String>,
}

/// What a launch asks to see.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Wanted {
    pub example: bool,
    pub repository: Option<PathBuf>,
    pub revisions: Vec<String>,
}

/// The window already showing what a launch asks for, if there is one.
///
/// Same repository root and the same revisions as typed: `git dt` and
/// `git dt main...HEAD` in one repository are two windows, as two reviews.
/// Revisions are compared as given rather than as resolved, so that running
/// `git dt main...HEAD` again after committing reloads the window onto the new
/// HEAD instead of opening a second one. A window whose repository was
/// replaced by an extension's source no longer shows it, and is not matched.
/// A launch that found no repository matches nothing: it opens a window that
/// says so.
pub fn window_showing<'a>(open: &'a [Showing], wanted: &Wanted) -> Option<&'a str> {
    open.iter()
        .find(|window| {
            if wanted.example || window.example {
                return wanted.example && window.example;
            }

            wanted.repository.is_some()
                && window.repository == wanted.repository
                && window.revisions == wanted.revisions
        })
        .map(|window| window.label.as_str())
}

/// Every open window, described for `window_showing`.
fn showing<R: Runtime>(app: &AppHandle<R>) -> Vec<Showing> {
    let sources = app.state::<ActiveSource>();

    app.state::<Windows>()
        .launches()
        .into_iter()
        .map(|(label, launch)| {
            let repository = sources.current(&label).and_then(|source| {
                source
                    .as_any()
                    .downcast_ref::<GitSource>()
                    .map(|git| git.root().to_path_buf())
            });

            Showing {
                example: launch.options.example,
                revisions: launch
                    .target
                    .map(|target| target.revisions)
                    .unwrap_or_default(),
                repository,
                label,
            }
        })
        .collect()
}

/// A launch handed over by another process: `git dt` run again.
///
/// Called on the async runtime, never the main thread, so finding the
/// repository (a Git call) holds nothing up.
pub fn launch_forwarded<R: Runtime>(app: &AppHandle<R>, args: Vec<String>, cwd: String) {
    let launch = WindowLaunch::from_forwarded(&args, &cwd);

    let wanted = Wanted {
        example: launch.options.example,
        repository: launch
            .target
            .as_ref()
            .and_then(|target| repository::discover(&target.directory).ok()),
        revisions: launch
            .target
            .as_ref()
            .map(|target| target.revisions.clone())
            .unwrap_or_default(),
    };

    let open = showing(app);
    let existing = window_showing(&open, &wanted).map(str::to_string);

    let result = match existing.and_then(|label| app.get_webview_window(&label)) {
        Some(window) => reload(app, &window, launch),
        None => open_window(app, launch).map(|_| ()),
    };

    if let Err(err) = result {
        eprintln!("[difftrek] could not open a window for {args:?}: {err}");
    }
}

/// Brings `window` forward and has it load afresh.
///
/// Its source is forgotten first, so the reload opens the launch target again
/// rather than describing what it had: a range is resolved anew, and a
/// working tree is listed anew.
fn reload<R: Runtime>(
    app: &AppHandle<R>,
    window: &WebviewWindow<R>,
    launch: WindowLaunch,
) -> tauri::Result<()> {
    let label = window.label();
    app.state::<Windows>().register(label, launch);
    app.state::<ActiveSource>().close(label);
    app.state::<AppState>().clear(label);

    window.unminimize()?;
    window.show()?;
    window.set_focus()?;
    app.emit_to(label, RELOAD_EVENT, ())
}

/// Opens a new window for `launch`, cascaded from the one in front.
pub fn open_window<R: Runtime>(
    app: &AppHandle<R>,
    launch: WindowLaunch,
) -> tauri::Result<WebviewWindow<R>> {
    let windows = app.state::<Windows>();
    let label = windows.next_label();

    // Registered before the window exists, so its first command finds it.
    windows.register(&label, launch);

    // The configured window — size, minimum size, title — under a new label,
    // so the Pro build's own configuration carries over too.
    let mut config = app
        .config()
        .app
        .windows
        .first()
        .cloned()
        .unwrap_or_default();
    config.label = label.clone();

    let mut builder = WebviewWindowBuilder::from_config(app, &config)?;
    if let Some((x, y)) = cascade_from(app) {
        builder = builder.position(x, y);
    }

    match builder.build() {
        Ok(window) => {
            crate::commands::apply_stored_zoom_to(app, &window);
            Ok(window)
        }
        Err(err) => {
            windows.forget(&label);
            Err(err)
        }
    }
}

/// Where a new window goes: a step down and right of the one in front.
fn cascade_from<R: Runtime>(app: &AppHandle<R>) -> Option<(f64, f64)> {
    let front = app.get_webview_window(&menu_target(app)?)?;
    let position = front.outer_position().ok()?;
    let scale = front.scale_factor().ok()?;
    let logical = position.to_logical::<f64>(scale);
    Some((logical.x + CASCADE, logical.y + CASCADE))
}

/// The window a menu choice is meant for: the one last in front, or failing
/// that any window at all.
///
/// Remembered from focus events rather than asked of each window, because by
/// the time a menu item fires the answer to "which is focused" can be none of
/// them — every window minimised, say, with the menu bar still there.
pub fn menu_target<R: Runtime>(app: &AppHandle<R>) -> Option<String> {
    let open = app.webview_windows();
    app.state::<Windows>()
        .last_focused()
        .filter(|label| open.contains_key(label))
        .or_else(|| open.keys().next().cloned())
}

/// Keeps the records in step with the windows themselves.
pub fn on_window_event<R: Runtime>(window: &tauri::Window<R>, event: &WindowEvent) {
    let app = window.app_handle();
    let label = window.label();

    match event {
        WindowEvent::Focused(true) => app.state::<Windows>().focused(label),
        WindowEvent::Destroyed => {
            app.state::<Windows>().forget(label);
            app.state::<ActiveSource>().close(label);
            app.state::<AppState>().clear(label);
        }
        _ => {}
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn repository(label: &str, root: &str, revisions: &[&str]) -> Showing {
        Showing {
            label: label.to_string(),
            example: false,
            repository: Some(PathBuf::from(root)),
            revisions: revisions.iter().map(|value| value.to_string()).collect(),
        }
    }

    fn wanted(root: Option<&str>, revisions: &[&str]) -> Wanted {
        Wanted {
            example: false,
            repository: root.map(PathBuf::from),
            revisions: revisions.iter().map(|value| value.to_string()).collect(),
        }
    }

    #[test]
    fn the_same_repository_and_range_is_the_same_window() {
        let open = [
            repository("main", "/repos/alpha", &[]),
            repository("window-1", "/repos/alpha", &["main...HEAD"]),
        ];

        assert_eq!(
            window_showing(&open, &wanted(Some("/repos/alpha"), &["main...HEAD"])),
            Some("window-1")
        );
        assert_eq!(
            window_showing(&open, &wanted(Some("/repos/alpha"), &[])),
            Some("main")
        );
    }

    #[test]
    fn another_range_or_repository_is_another_window() {
        let open = [repository("main", "/repos/alpha", &[])];

        assert_eq!(
            window_showing(&open, &wanted(Some("/repos/alpha"), &["HEAD"])),
            None
        );
        assert_eq!(
            window_showing(&open, &wanted(Some("/repos/beta"), &[])),
            None
        );
    }

    #[test]
    fn a_launch_that_found_no_repository_matches_nothing() {
        // Two windows that both failed to find a repository are not the same
        // review; each says so in its own window.
        let open = [Showing {
            label: "main".into(),
            example: false,
            repository: None,
            revisions: Vec::new(),
        }];

        assert_eq!(window_showing(&open, &wanted(None, &[])), None);
    }

    #[test]
    fn a_window_an_extension_took_over_is_not_matched() {
        // Its repository was replaced by two folders, so `repository` is gone,
        // although it was launched on the very same target.
        let open = [Showing {
            label: "main".into(),
            example: false,
            repository: None,
            revisions: Vec::new(),
        }];

        assert_eq!(
            window_showing(&open, &wanted(Some("/repos/alpha"), &[])),
            None
        );
    }

    #[test]
    fn the_example_matches_only_the_example() {
        let mut example = repository("window-1", "/repos/alpha", &[]);
        example.example = true;
        let open = [repository("main", "/repos/alpha", &[]), example];

        let mut wants_example = wanted(Some("/repos/alpha"), &[]);
        wants_example.example = true;

        assert_eq!(window_showing(&open, &wants_example), Some("window-1"));
        assert_eq!(
            window_showing(&open, &wanted(Some("/repos/alpha"), &[])),
            Some("main")
        );
    }

    #[test]
    fn labels_are_never_reused() {
        let windows = Windows::default();
        let first = windows.next_label();
        windows.register(&first, WindowLaunch::empty());
        windows.forget(&first);

        assert_ne!(windows.next_label(), first);
    }

    #[test]
    fn an_unknown_window_has_nothing_to_open() {
        assert_eq!(Windows::default().launch("window-9"), WindowLaunch::empty());
    }

    #[test]
    fn closing_the_window_in_front_forgets_it_was_in_front() {
        let windows = Windows::default();
        windows.focused("window-1");
        windows.forget("window-1");

        assert_eq!(windows.last_focused(), None);
    }
}
