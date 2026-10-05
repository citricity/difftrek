//! Items an extension adds to the application menu.
//!
//! The menu bar belongs to the core, which builds it — and rebuilds it when
//! the language changes — from its own items plus whatever extensions have
//! asked for here. An extension asks once, while registering, before the menu
//! is first built:
//!
//! ```ignore
//! menu::add_app_menu_item("licence", "enter", "licence.menu.enter");
//! ```
//!
//! The label is a message key rather than text, so the item speaks whatever
//! language the menu is rebuilt in. Choosing the item sends the window in
//! front an `extension-menu-item` event naming the extension and the item;
//! the extension's React half hears it through `host.onMenuItem`.
//!
//! Only macOS has a menu bar, so an extension must not make an item the only
//! way to reach something: offer it on a landing panel too.

use std::sync::RwLock;

/// One item, as the core needs it to build the menu.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AppMenuItem {
    /// The extension's id, which is also its Tauri plugin name.
    pub extension: String,
    /// The item's name within the extension: what `host.onMenuItem` is given.
    pub item: String,
    /// The message key for its label, looked up when the menu is built.
    pub label_key: String,
}

impl AppMenuItem {
    /// The menu id: namespaced, so no extension's item can collide with the
    /// core's ids or another extension's.
    pub fn menu_id(&self) -> String {
        format!("{MENU_ID_PREFIX}{}:{}", self.extension, self.item)
    }
}

/// What every extension item's menu id begins with.
pub const MENU_ID_PREFIX: &str = "extension:";

static ITEMS: RwLock<Vec<AppMenuItem>> = RwLock::new(Vec::new());

/// Adds an item to the application menu, after the core's own app-level items
/// (Settings, Install 'git dt' Command). Items appear in the order they were
/// added; adding the same item twice keeps the first.
pub fn add_app_menu_item(extension: &str, item: &str, label_key: &str) {
    let added = AppMenuItem {
        extension: extension.to_string(),
        item: item.to_string(),
        label_key: label_key.to_string(),
    };

    let mut items = ITEMS.write().unwrap_or_else(|err| err.into_inner());
    if !items
        .iter()
        .any(|existing| existing.menu_id() == added.menu_id())
    {
        items.push(added);
    }
}

/// Every item added so far, in order.
pub fn app_menu_items() -> Vec<AppMenuItem> {
    ITEMS.read().unwrap_or_else(|err| err.into_inner()).clone()
}

/// The item a menu id names, if it is an extension's.
pub fn app_menu_item(menu_id: &str) -> Option<AppMenuItem> {
    if !menu_id.starts_with(MENU_ID_PREFIX) {
        return None;
    }
    app_menu_items()
        .into_iter()
        .find(|item| item.menu_id() == menu_id)
}

#[cfg(test)]
mod tests {
    use super::*;

    // The registry is process-wide, so each test uses names of its own.

    #[test]
    fn an_added_item_is_found_by_its_menu_id() {
        add_app_menu_item("test-a", "enter", "testA.enter");

        let item = app_menu_item("extension:test-a:enter").expect("found");
        assert_eq!(item.extension, "test-a");
        assert_eq!(item.item, "enter");
        assert_eq!(item.label_key, "testA.enter");
    }

    #[test]
    fn adding_the_same_item_twice_keeps_one() {
        add_app_menu_item("test-b", "enter", "testB.first");
        add_app_menu_item("test-b", "enter", "testB.second");

        let matching: Vec<_> = app_menu_items()
            .into_iter()
            .filter(|item| item.extension == "test-b")
            .collect();
        assert_eq!(matching.len(), 1);
        assert_eq!(matching[0].label_key, "testB.first");
    }

    #[test]
    fn core_ids_are_never_mistaken_for_an_extensions() {
        add_app_menu_item("test-c", "settings", "testC.settings");

        assert_eq!(app_menu_item("settings"), None);
        assert_eq!(app_menu_item("extension:test-c:other"), None);
    }
}
