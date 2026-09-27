pub mod ai_changelog;
pub mod cli;
pub mod commands;
pub mod error;
pub mod extensions;
pub mod git;
pub mod git_alias;
pub mod launch;
pub mod menu;
pub mod settings;
pub mod state;

use difftrek_extension_api::source::ActiveSource;
use state::AppState;
use std::sync::Arc;
use tauri::Emitter;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // A command-line request is answered here and the process ends, before
    // Tauri has a chance to put a window on screen. `git dt --createchangelog`
    // is something an agent runs in a terminal; a window would be in the way.
    if let Some(request) = launch::cli_request() {
        std::process::exit(cli::execute(request));
    }

    // Every extension found in `extensions/` at build time; `extensions.rs` is
    // generated. Each is a Tauri plugin, so its commands and their permissions
    // are namespaced by Tauri rather than by us.
    let builder = extensions::register(tauri::Builder::default());

    builder
        .manage(AppState::default())
        // What is being compared. Empty until the repository is opened, or an
        // extension opens something else.
        .manage(ActiveSource::new(Arc::new(git::host::GitHost)))
        // Runs after the default menu has been installed, so there is something
        // to add the Settings item to.
        .setup(|app| {
            menu::install_app_items(app.handle())?;
            // Before the window is on screen, so a scaled interface never
            // appears at its natural size first.
            commands::apply_stored_zoom(app.handle());
            Ok(())
        })
        // The shell knows the item was chosen; only the webview knows what the
        // dialog is. This is the whole of the connection between them.
        .on_menu_event(|app, event| {
            if event.id() == menu::SETTINGS_ID {
                let _ = app.emit(menu::SETTINGS_EVENT, ());
            } else if event.id() == menu::GIT_ALIAS_ID {
                let _ = app.emit(menu::GIT_ALIAS_EVENT, ());
            } else if let Some(direction) = menu::zoom_direction(event.id()) {
                let _ = app.emit(menu::ZOOM_EVENT, direction);
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_launch_options,
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
