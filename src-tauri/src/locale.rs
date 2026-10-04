//! Which language the shell speaks.
//!
//! The words themselves live in `locales/*.json`, shared with the webview, and
//! the machinery in `difftrek_extension_api::i18n`. What belongs here is the
//! part that needs the machine: asking the operating system which languages
//! its user prefers.

use difftrek_extension_api::i18n;

/// The operating system's preferred languages, most preferred first, as it
/// reports them. Empty when it will not say, which resolves to the base.
pub fn system_locales() -> Vec<String> {
    sys_locale::get_locales().collect()
}

/// Makes the language a setting resolves to the active one. Returns whether
/// it changed, so whatever was built in the old one can be rebuilt.
pub fn apply(preference: &str) -> bool {
    let locale = i18n::resolve(preference, &system_locales(), &i18n::supported());
    i18n::set_active(&locale)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Every language the catalogues ship is declared to macOS, so the system
    /// draws its own parts of the app in it too.
    #[test]
    fn info_plist_declares_every_language() {
        let plist = include_str!("../Info.plist");
        for tag in i18n::supported() {
            // macOS names US English plain `en`.
            let bundle = if tag == "en-US" { "en" } else { tag };
            assert!(
                plist.contains(&format!("<string>{bundle}</string>")),
                "Info.plist does not declare {tag}"
            );
        }
    }
}
