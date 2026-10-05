pub mod ai_changelog;
pub mod cli;
pub mod commands;
pub mod error;
pub mod extensions;
pub mod git;
pub mod git_alias;
pub mod launch;
pub mod locale;
pub mod menu;
pub mod settings;
pub mod state;
pub mod windows;

use difftrek_extension_api::source::ActiveSource;
use state::AppState;
use std::sync::Arc;
use tauri::Emitter;
use windows::Windows;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // A command-line request is answered here and the process ends, before
    // Tauri has a chance to put a window on screen. `git dt --createchangelog`
    // is something an agent runs in a terminal; a window would be in the way.
    if let Some(request) = launch::cli_request() {
        std::process::exit(cli::execute(request));
    }

    // One process, however many times Diff Trek is launched: a later launch
    // hands its arguments to the first and exits, and the first opens a window
    // for them (see `windows.rs`). Registered before anything else, as the
    // plugin asks, so a second launch does as little as possible before it
    // leaves. A command-line request never gets this far — it was answered
    // above, by whichever process received it.
    let builder = tauri::Builder::default().plugin(tauri_plugin_single_instance::init(
        |app, args, cwd| windows::launch_forwarded(app, args, cwd),
    ));

    // Every extension found in `extensions/` at build time; `extensions.rs` is
    // generated. Each is a Tauri plugin, so its commands and their permissions
    // are namespaced by Tauri rather than by us.
    let builder = extensions::register(builder);

    // The menu bar is built in the user's language rather than taken from
    // Tauri's English default. Tauri builds it inside `run`, before its core
    // plugins are registered — the path resolver among them — so the settings
    // file cannot be found yet: asking for it there panics ("state() called
    // before manage() for PathResolver"), and only on macOS, the one platform
    // with a menu. So it is built in the system's language here, and `setup`
    // rebuilds it in the stored one, before any window is on screen.
    #[cfg(target_os = "macos")]
    let builder = builder.menu(|app| {
        locale::apply(difftrek_extension_api::i18n::AUTO);
        menu::build(app)
    });

    builder
        .manage(AppState::default())
        // What each window is comparing. Empty until its repository is opened,
        // or an extension opens something else in it.
        .manage(ActiveSource::new(Arc::new(git::host::GitHost)))
        // How each window was launched. The first is described by this
        // process's own arguments.
        .manage({
            let windows = Windows::default();
            windows.register(windows::MAIN, launch::WindowLaunch::from_process());
            windows
        })
        .setup(|app| {
            // The first moment the settings can be read. Errors from the shell
            // speak the user's language from here on, and on macOS the menu,
            // built in the system's language, is rebuilt in the stored one if
            // that differs — before the event loop runs, so it is never seen.
            if locale::apply(&commands::stored_settings(app.handle()).language) {
                if let Err(err) = menu::rebuild(app.handle()) {
                    eprintln!("[difftrek] could not rebuild the menu: {err}");
                }
            }
            // Before the window is on screen, so a scaled interface never
            // appears at its natural size first.
            commands::apply_stored_zoom(app.handle());
            Ok(())
        })
        .on_window_event(windows::on_window_event)
        // The shell knows the item was chosen; only the webview knows what the
        // dialog is. This is the whole of the connection between them — and
        // only the window in front is told.
        .on_menu_event(|app, event| {
            if event.id() == menu::NEW_WINDOW_ID {
                if let Err(err) = windows::open_window(app, launch::WindowLaunch::empty()) {
                    eprintln!("[difftrek] could not open a new window: {err}");
                }
                return;
            }

            let Some(target) = windows::menu_target(app) else {
                return;
            };

            if let Some(item) = difftrek_extension_api::menu::app_menu_item(event.id().as_ref()) {
                let chosen = menu::ExtensionItemChosen {
                    extension: item.extension,
                    item: item.item,
                };
                let _ = app.emit_to(&target, menu::EXTENSION_ITEM_EVENT, chosen);
                return;
            }

            if event.id() == menu::SETTINGS_ID {
                let _ = app.emit_to(&target, menu::SETTINGS_EVENT, ());
            } else if event.id() == menu::GIT_ALIAS_ID {
                let _ = app.emit_to(&target, menu::GIT_ALIAS_EVENT, ());
            } else if let Some(direction) = menu::zoom_direction(event.id()) {
                let _ = app.emit_to(&target, menu::ZOOM_EVENT, direction);
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_launch_options,
            commands::get_system_locales,
            commands::get_repository_info,
            commands::get_changed_files,
            commands::get_file_diff,
            commands::get_file_contents,
            commands::get_image_bytes,
            commands::get_ai_changelog,
            commands::get_git_alias_status,
            commands::install_git_alias,
            commands::get_settings,
            commands::set_settings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Diff Trek");
}
