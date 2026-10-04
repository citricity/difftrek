//! The application menu.
//!
//! On macOS, Tauri would install `Menu::default()` when given no menu of its
//! own: the "Diff Trek" menu with About, Services, Hide and Quit, an Edit menu
//! that makes ⌘C work in the diff, and File, View, Window and Help. Its labels
//! are English and fixed, though, and Diff Trek speaks the user's language —
//! so this builds the same menu itself, every label from the shared catalogue
//! (`locales/*.json`), and builds it again when the language changes.
//!
//! The structure is the default's, item for item (see `Menu::default` in
//! `tauri/src/menu/menu.rs`), plus what the default has no way to provide.
//! `PredefinedMenuItem` covers the items whose behaviour the OS owns — about,
//! services, hide, quit, the clipboard, fullscreen — and keeps that behaviour
//! whatever the label says. Settings is not one of them, because only the app
//! knows what it should open, so it is a normal item that relays the click to
//! the webview as an event; likewise installing `git dt` and the zoom items.
//! Those events go to the window in front only (see `windows::menu_target`):
//! with three windows open, ⌘, opens one Settings dialog, not three. New
//! Window is the one item the shell answers itself, since what it makes is a
//! window, not something inside one.
//!
//! The Window and Help submenus carry Tauri's well-known ids, which is what
//! makes `set_menu` hand them to AppKit as the windows and help menus (it
//! looks them up by id), so the system's own additions still appear in them.
//!
//! The item says "Settings…", not "Preferences…": macOS 13 renamed it in the
//! Human Interface Guidelines and the system apps followed.
//!
//! Non-macOS platforms get no menu bar from Tauri at all, so this does nothing
//! there and the toolbar button is the way in.

use tauri::Runtime;

/// Identifies the item in `MenuEvent`s.
pub const SETTINGS_ID: &str = "settings";

/// Emitted to the webview when the item is chosen.
pub const SETTINGS_EVENT: &str = "settings-requested";

/// The item that installs the `git dt` alias, and the event it sends. Like
/// Settings, what it opens — a confirmation — belongs to the webview.
pub const GIT_ALIAS_ID: &str = "install-git-alias";
pub const GIT_ALIAS_EVENT: &str = "git-alias-requested";

/// File > New Window: an empty window, showing the landing screen, from which
/// an extension can open something else to compare without disturbing what
/// is already open.
pub const NEW_WINDOW_ID: &str = "new-window";

/// The View items that scale the interface, and the event carrying the choice
/// to the webview.
///
/// What crosses is a direction, not a size: the ladder of zoom levels and the
/// preference recording where on it the reader is both belong to the frontend,
/// and the shell only knows that an item was chosen.
pub const ZOOM_IN_ID: &str = "zoom-in";
pub const ZOOM_OUT_ID: &str = "zoom-out";
pub const ZOOM_RESET_ID: &str = "zoom-reset";
pub const ZOOM_EVENT: &str = "zoom-requested";

/// Which way a menu item moves the zoom, as the webview names it — or `None`
/// for an item that is not one of them.
pub fn zoom_direction(id: &tauri::menu::MenuId) -> Option<&'static str> {
    if id == ZOOM_IN_ID {
        Some("in")
    } else if id == ZOOM_OUT_ID {
        Some("out")
    } else if id == ZOOM_RESET_ID {
        Some("reset")
    } else {
        None
    }
}

/// The whole menu bar, in the active language.
///
/// Only macOS installs it, but it compiles everywhere — the constructors are
/// cross-platform — so a Linux build or CI run still type-checks it.
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
pub fn build<R: Runtime>(app: &tauri::AppHandle<R>) -> tauri::Result<tauri::menu::Menu<R>> {
    use difftrek_extension_api::i18n::{t, tf};
    use tauri::menu::{
        AboutMetadata, Menu, MenuItem, PredefinedMenuItem, Submenu, HELP_SUBMENU_ID,
        WINDOW_SUBMENU_ID,
    };

    let package = app.package_info();
    let config = app.config();
    let name = package.name.clone();
    let named = |key: &str| tf(key, &[("app", &name)]);

    let about = AboutMetadata {
        name: Some(name.clone()),
        version: Some(package.version.to_string()),
        copyright: config.bundle.copyright.clone(),
        authors: config.bundle.publisher.clone().map(|publisher| vec![publisher]),
        ..Default::default()
    };

    let settings = MenuItem::with_id(
        app,
        SETTINGS_ID,
        t("menu.settings"),
        true,
        Some("CmdOrCtrl+,"),
    )?;

    // No shortcut: installing a command is a once-ever action.
    let git_alias = MenuItem::with_id(
        app,
        GIT_ALIAS_ID,
        tf("menu.installGitAlias", &[("command", "git dt")]),
        true,
        None::<&str>,
    )?;

    // Settings straight after About and its separator, which is where macOS
    // puts it and where the muscle memory expects it. The command item follows
    // it in the same group, as VS Code's "Install 'code' command" sits with
    // its app-level items.
    let application = Submenu::with_items(
        app,
        &name,
        true,
        &[
            &PredefinedMenuItem::about(app, Some(&named("menu.about")), Some(about))?,
            &PredefinedMenuItem::separator(app)?,
            &settings,
            &git_alias,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::services(app, Some(&t("menu.services")))?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::hide(app, Some(&named("menu.hide")))?,
            &PredefinedMenuItem::hide_others(app, Some(&t("menu.hideOthers")))?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::quit(app, Some(&named("menu.quit")))?,
        ],
    )?;

    let new_window = MenuItem::with_id(
        app,
        NEW_WINDOW_ID,
        t("menu.newWindow"),
        true,
        Some("CmdOrCtrl+N"),
    )?;

    let file = Submenu::with_items(
        app,
        t("menu.file"),
        true,
        &[
            &new_window,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::close_window(app, Some(&t("menu.closeWindow")))?,
        ],
    )?;

    let edit = Submenu::with_items(
        app,
        t("menu.edit"),
        true,
        &[
            &PredefinedMenuItem::undo(app, Some(&t("menu.undo")))?,
            &PredefinedMenuItem::redo(app, Some(&t("menu.redo")))?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::cut(app, Some(&t("menu.cut")))?,
            &PredefinedMenuItem::copy(app, Some(&t("menu.copy")))?,
            &PredefinedMenuItem::paste(app, Some(&t("menu.paste")))?,
            &PredefinedMenuItem::select_all(app, Some(&t("menu.selectAll")))?,
        ],
    )?;

    // Zoom In, Zoom Out and Actual Size, above Fullscreen with a separator
    // under them: the grouping a browser's View menu has.
    //
    // None of this is what makes the keystrokes work: the webview handles them
    // itself, which is the only way they can work on the platforms that get no
    // menu at all, and the only way ⌘⇧+ can work anywhere, since a menu key
    // equivalent matches one keystroke and that is a different one. The items
    // are here so the commands can be found without knowing them, and so macOS
    // shows the shortcut beside the name. ⌘= rather than ⌘+, because = is the
    // key actually under the finger: shifting it is what makes a +, and the
    // webview picks that up itself.
    let view = Submenu::with_items(
        app,
        t("menu.view"),
        true,
        &[
            &zoom_item(app, ZOOM_IN_ID, &t("menu.zoomIn"), "CmdOrCtrl+Equal")?,
            &zoom_item(app, ZOOM_OUT_ID, &t("menu.zoomOut"), "CmdOrCtrl+Minus")?,
            &zoom_item(app, ZOOM_RESET_ID, &t("menu.actualSize"), "CmdOrCtrl+Digit0")?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::fullscreen(app, Some(&t("menu.fullScreen")))?,
        ],
    )?;

    let window = Submenu::with_id_and_items(
        app,
        WINDOW_SUBMENU_ID,
        t("menu.window"),
        true,
        &[
            &PredefinedMenuItem::minimize(app, Some(&t("menu.minimise")))?,
            &PredefinedMenuItem::maximize(app, Some(&t("menu.zoomWindow")))?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::close_window(app, Some(&t("menu.closeWindow")))?,
        ],
    )?;

    let help = Submenu::with_id_and_items(app, HELP_SUBMENU_ID, t("menu.help"), true, &[])?;

    Menu::with_items(app, &[&application, &file, &edit, &view, &window, &help])
}

/// Replaces the menu bar with one in the language now active.
#[cfg(target_os = "macos")]
pub fn rebuild<R: Runtime>(app: &tauri::AppHandle<R>) -> tauri::Result<()> {
    app.set_menu(build(app)?)?;
    Ok(())
}

#[cfg(not(target_os = "macos"))]
pub fn rebuild<R: Runtime>(_app: &tauri::AppHandle<R>) -> tauri::Result<()> {
    Ok(())
}

/// A zoom item, preferring its accelerator but not insisting on it.
///
/// An accelerator is a string parsed at runtime, and one the menu library will
/// not parse must not be what stops Diff Trek starting: without it the item
/// still works from the menu, and the webview still sees the keystroke.
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
fn zoom_item<R: Runtime>(
    app: &tauri::AppHandle<R>,
    id: &str,
    text: &str,
    accelerator: &str,
) -> tauri::Result<tauri::menu::MenuItem<R>> {
    use tauri::menu::MenuItem;

    match MenuItem::with_id(app, id, text, true, Some(accelerator)) {
        Ok(item) => Ok(item),
        Err(err) => {
            eprintln!("[difftrek] ignoring unusable accelerator {accelerator}: {err}");
            MenuItem::with_id(app, id, text, true, None::<&str>)
        }
    }
}
