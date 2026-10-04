//! Localisation for everything Rust says to the user.
//!
//! The words live in `locales/<tag>.json` at the root of the core, and the very
//! same files are what the React side imports, so one catalogue serves the
//! menu, the error messages and the interface alike. Each file is a flat map
//! from a key to a message. A message is either a string, with `{name}`
//! placeholders, or an object of plural forms keyed by CLDR category (`one`,
//! `other`), chosen by the `count` argument.
//!
//! The files are embedded at compile time, so a build cannot ship without its
//! words and nothing is read from disk at runtime.
//!
//! Which language is active is process-wide. The core sets it at startup and
//! whenever the setting changes ([`set_active`]); every catalogue — the core's
//! and each extension's own — then answers in it. A message missing from the
//! active language falls back to [`BASE`], and a key missing even there comes
//! back as the key, which is ugly enough to be noticed but never a crash.

use serde_json::{Map, Value};
use std::collections::BTreeMap;
use std::sync::{OnceLock, RwLock};

/// The language every catalogue is complete in, and the last resort.
pub const BASE: &str = "en-GB";

/// The setting's value for following the operating system.
pub const AUTO: &str = "auto";

/// A set of embedded catalogues, one per language: the core's ([`CORE`]), or
/// an extension's, layered over them with [`add_layer`]. Messages are read
/// through [`t`] and [`tf`], which see every layer.
pub struct Catalogs {
    sources: &'static [(&'static str, &'static str)],
    parsed: OnceLock<BTreeMap<String, Map<String, Value>>>,
}

impl Catalogs {
    /// Catalogues as `(tag, json)` pairs, usually from `include_str!`.
    ///
    /// Parsed on first use. A file that does not parse is reported and treated
    /// as empty, so its messages fall back to the base language — the tests
    /// are what stop one reaching a build.
    pub const fn new(sources: &'static [(&'static str, &'static str)]) -> Self {
        Self {
            sources,
            parsed: OnceLock::new(),
        }
    }

    fn parsed(&self) -> &BTreeMap<String, Map<String, Value>> {
        self.parsed.get_or_init(|| {
            self.sources
                .iter()
                .map(|(tag, json)| {
                    let map = match serde_json::from_str::<Map<String, Value>>(json) {
                        Ok(map) => map,
                        Err(err) => {
                            eprintln!("[difftrek] ignoring the {tag} catalogue: {err}");
                            Map::new()
                        }
                    };
                    (tag.to_string(), map)
                })
                .collect()
        })
    }

    /// The languages these catalogues provide, in the order given.
    pub fn tags(&self) -> Vec<&'static str> {
        self.sources.iter().map(|(tag, _)| *tag).collect()
    }

    /// A message in a given language rather than the active one, from these
    /// catalogues alone — no layers.
    pub fn format_in(&self, locale: &str, key: &str, args: &[(&str, &str)]) -> String {
        let message = [locale, BASE]
            .iter()
            .find_map(|tag| self.lookup(tag, key));
        render(message, locale, key, args)
    }

    fn lookup(&self, tag: &str, key: &str) -> Option<&Value> {
        self.parsed().get(tag).and_then(|catalogue| catalogue.get(key))
    }

    /// Every key and message in one language, for checking.
    fn catalogue(&self, tag: &str) -> Option<&Map<String, Value>> {
        self.parsed().get(tag)
    }
}

/// Fills in a message found for `key`, or falls back to the key itself.
fn render(message: Option<&Value>, locale: &str, key: &str, args: &[(&str, &str)]) -> String {
    let template = match message {
        Some(Value::String(text)) => text.as_str(),
        Some(Value::Object(forms)) => {
            let count = argument(args, "count")
                .and_then(|value| value.parse::<f64>().ok())
                .unwrap_or(0.0);
            let category = plural_category(locale, count);
            match forms.get(category).or_else(|| forms.get("other")) {
                Some(Value::String(text)) => text.as_str(),
                _ => key,
            }
        }
        _ => key,
    };

    interpolate(template, args)
}

fn argument<'a>(args: &'a [(&str, &str)], name: &str) -> Option<&'a str> {
    args.iter()
        .find(|(candidate, _)| *candidate == name)
        .map(|(_, value)| *value)
}

/// Replaces each `{name}` with its argument. Unknown names are left as they
/// are, so a mistake shows up on screen rather than silently vanishing.
pub fn interpolate(template: &str, args: &[(&str, &str)]) -> String {
    let mut out = String::with_capacity(template.len());
    let mut rest = template;

    while let Some(open) = rest.find('{') {
        out.push_str(&rest[..open]);
        let after = &rest[open + 1..];
        match after.find('}') {
            Some(close) => {
                let name = &after[..close];
                match argument(args, name) {
                    Some(value) => out.push_str(value),
                    None => {
                        out.push('{');
                        out.push_str(name);
                        out.push('}');
                    }
                }
                rest = &after[close + 1..];
            }
            None => {
                out.push_str(&rest[open..]);
                rest = "";
            }
        }
    }

    out.push_str(rest);
    out
}

/// The CLDR plural category for a count, for the languages Diff Trek ships.
///
/// Intl.PluralRules does this on the React side; Rust has no equivalent in
/// the standard library and only needs `one` and `other` for these languages.
/// French counts zero as singular, the others do not. A language not listed
/// gets the English rule, the commonest shape.
pub fn plural_category(locale: &str, count: f64) -> &'static str {
    let language = locale.split('-').next().unwrap_or(locale);
    let one = match language {
        "fr" => (0.0..2.0).contains(&count),
        _ => count == 1.0,
    };
    if one {
        "one"
    } else {
        "other"
    }
}

static ACTIVE: RwLock<String> = RwLock::new(String::new());

/// The language messages are produced in.
pub fn active() -> String {
    let current = ACTIVE.read().map(|tag| tag.clone()).unwrap_or_default();
    if current.is_empty() {
        BASE.to_string()
    } else {
        current
    }
}

/// Makes `locale` the language every catalogue answers in. Returns whether it
/// changed, so a caller can rebuild what was built in the old one.
pub fn set_active(locale: &str) -> bool {
    match ACTIVE.write() {
        Ok(mut current) if current.as_str() != locale => {
            *current = locale.to_string();
            true
        }
        _ => false,
    }
}

/// Turns what an operating system reports into a BCP 47 tag: `en_GB.UTF-8`
/// becomes `en-GB`. `C` and `POSIX` mean no preference and come back `None`.
pub fn normalise(raw: &str) -> Option<String> {
    let tag = raw
        .split(['.', '@'])
        .next()
        .unwrap_or("")
        .trim()
        .replace('_', "-");

    if tag.is_empty() || tag.eq_ignore_ascii_case("c") || tag.eq_ignore_ascii_case("posix") {
        return None;
    }

    let mut parts = tag.split('-');
    let language = parts.next()?.to_ascii_lowercase();
    if !(2..=3).contains(&language.len()) || !language.chars().all(|c| c.is_ascii_alphabetic()) {
        return None;
    }

    let rest: Vec<String> = parts
        .filter(|part| !part.is_empty())
        .map(|part| match part.len() {
            2 => part.to_ascii_uppercase(),
            4 => {
                let mut chars = part.chars();
                let first = chars.next().map(|c| c.to_ascii_uppercase());
                first
                    .into_iter()
                    .chain(chars.map(|c| c.to_ascii_lowercase()))
                    .collect()
            }
            _ => part.to_string(),
        })
        .collect();

    Some(std::iter::once(language).chain(rest).collect::<Vec<_>>().join("-"))
}

/// The language to show, from the setting and the operating system's
/// preferred languages, in order.
///
/// An explicit choice wins when it is one of `supported`; anything else —
/// `auto`, or a language this build no longer ships — follows the system. Each
/// system language is tried in turn, first exactly and then by its language
/// alone, so `de-AT` finds `de` and `en-AU` finds the first English listed
/// (British, which Australia spells like). Failing all of that, the base.
///
/// Mirrored by `resolveLocale` in `src/i18n/resolve.ts`; the two are tested
/// against the same cases and must agree, or the menu and the window would
/// speak different languages.
pub fn resolve(preference: &str, system: &[String], supported: &[&str]) -> String {
    if preference != AUTO {
        if let Some(found) = exact(preference, supported) {
            return found.to_string();
        }
    }

    for candidate in system.iter().filter_map(|raw| normalise(raw)) {
        if let Some(found) = exact(&candidate, supported) {
            return found.to_string();
        }
        let language = candidate.split('-').next().unwrap_or(&candidate);
        if let Some(found) = supported
            .iter()
            .find(|tag| tag.split('-').next() == Some(language))
        {
            return found.to_string();
        }
    }

    BASE.to_string()
}

fn exact<'a>(tag: &str, supported: &[&'a str]) -> Option<&'a str> {
    supported
        .iter()
        .find(|candidate| candidate.eq_ignore_ascii_case(tag))
        .copied()
}

/// Whether a stored setting is worth keeping: `auto`, or something shaped like
/// a language tag. Whether it is one this build ships is `resolve`'s business,
/// so a file written by a newer version keeps its choice.
pub fn is_preference(value: &str) -> bool {
    value == AUTO || (value.len() <= 35 && normalise(value).as_deref() == Some(value))
}

/// The core's own catalogues, from `locales/` at the root of the repository.
///
/// Every file there must be listed here; a test checks that none is missed.
pub static CORE: Catalogs = Catalogs::new(&[
    ("en-GB", include_str!("../../../locales/en-GB.json")),
    ("en-US", include_str!("../../../locales/en-US.json")),
    ("de", include_str!("../../../locales/de.json")),
    ("es", include_str!("../../../locales/es.json")),
    ("fr", include_str!("../../../locales/fr.json")),
]);

/// Catalogues layered over the core's, most recently added first.
///
/// An extension adds its own here when it registers (see
/// [`add_layer`]). They are an additional layer, not a separate dictionary:
/// a message is looked up in every layer before the core, so an extension can
/// add words and also reword the core's, and one `t` serves both.
static LAYERS: RwLock<Vec<&'static Catalogs>> = RwLock::new(Vec::new());

/// Layers an extension's catalogues over the core's. Adding the same
/// catalogues twice is harmless, so an extension can make sure of its layer
/// from wherever it first needs a message — its tests included.
pub fn add_layer(catalogs: &'static Catalogs) {
    if let Ok(mut layers) = LAYERS.write() {
        if !layers.iter().any(|layer| std::ptr::eq(*layer, catalogs)) {
            layers.push(catalogs);
        }
    }
}

/// A message in a given language, through every layer and then the core.
///
/// The language comes first and the layer second: a message the active
/// language has anywhere beats the base language's, so a key an extension
/// rewords only in English never pulls English into a German interface.
pub fn format_layered(locale: &str, key: &str, args: &[(&str, &str)]) -> String {
    let layers = LAYERS.read().map(|layers| layers.clone()).unwrap_or_default();

    let message = [locale, BASE].iter().find_map(|tag| {
        layers
            .iter()
            .rev()
            .copied()
            .chain(std::iter::once(&CORE))
            .find_map(|catalogs| catalogs.lookup(tag, key))
    });

    render(message, locale, key, args)
}

/// The languages the interface can be shown in: the core's. An extension's
/// catalogue in some other language would leave everything around it in the
/// base language, so it does not make one.
pub fn supported() -> Vec<&'static str> {
    CORE.tags()
}

/// A message in the active language.
pub fn t(key: &str) -> String {
    tf(key, &[])
}

/// A message in the active language, with arguments.
pub fn tf(key: &str, args: &[(&str, &str)]) -> String {
    format_layered(&active(), key, args)
}

/// Checks a set of catalogues the way the core's are checked, for an
/// extension's tests to call on its own: each parses, uses only keys the base
/// has, keeps every placeholder the base uses, and — unless it is a regional
/// variant of the base's own language — leaves nothing untranslated.
///
/// `directory` is where the files live, so a file nobody embedded is caught.
/// A layer is checked against its own base and the core's together, since a
/// key it rewords is one the core defines; its languages must be the core's.
pub fn check_catalogues(catalogs: &Catalogs, directory: &std::path::Path) -> Result<(), String> {
    let layer = !std::ptr::eq(catalogs, &CORE);
    let mut problems = Vec::new();

    let mut on_disk: Vec<String> = std::fs::read_dir(directory)
        .map_err(|err| format!("{}: {err}", directory.display()))?
        .filter_map(|entry| entry.ok())
        .filter_map(|entry| {
            let name = entry.file_name().to_string_lossy().into_owned();
            name.strip_suffix(".json").map(str::to_string)
        })
        .collect();
    on_disk.sort();
    let mut embedded: Vec<String> = catalogs.tags().iter().map(|t| t.to_string()).collect();
    embedded.sort();
    if on_disk != embedded {
        problems.push(format!("files {on_disk:?} but embedded {embedded:?}"));
    }

    let parsed: BTreeMap<String, Map<String, Value>> = catalogs
        .sources
        .iter()
        .map(|(tag, json)| match serde_json::from_str(json) {
            Ok(map) => (tag.to_string(), map),
            Err(err) => {
                problems.push(format!("{tag}: {err}"));
                (tag.to_string(), Map::new())
            }
        })
        .collect();

    let Some(own_base) = parsed.get(BASE) else {
        return Err(format!("no {BASE} catalogue"));
    };

    // What a key may be checked against: this set's base, and for a layer the
    // core's base beneath it.
    let mut base = if layer {
        CORE.catalogue(BASE).cloned().unwrap_or_default()
    } else {
        Map::new()
    };
    for (key, value) in own_base {
        base.insert(key.clone(), value.clone());
    }

    if layer {
        let core_tags = CORE.tags();
        for tag in parsed.keys() {
            if !core_tags.contains(&tag.as_str()) {
                problems.push(format!("{tag}: the core has no {tag} catalogue to layer over"));
            }
        }
    }
    let base_language = BASE.split('-').next().unwrap_or(BASE);

    for (tag, catalogue) in &parsed {
        if tag == BASE {
            for (key, value) in own_base {
                if !valid_message(value) {
                    problems.push(format!("{tag}: {key} is neither a string nor plural forms"));
                }
            }
            continue;
        }

        let partial = tag.split('-').next() == Some(base_language);

        for (key, value) in catalogue {
            let Some(original) = base.get(key) else {
                problems.push(format!("{tag}: {key} is not in any {BASE} catalogue"));
                continue;
            };
            if !valid_message(value) {
                problems.push(format!("{tag}: {key} is neither a string nor plural forms"));
            }
            if placeholders(value) != placeholders(original) {
                problems.push(format!(
                    "{tag}: {key} has placeholders {:?}, {BASE} has {:?}",
                    placeholders(value),
                    placeholders(original)
                ));
            }
        }

        if !partial {
            for key in own_base.keys() {
                if !catalogue.contains_key(key) {
                    problems.push(format!("{tag}: {key} is missing"));
                }
            }
        }
    }

    if problems.is_empty() {
        Ok(())
    } else {
        Err(problems.join("\n"))
    }
}

fn valid_message(value: &Value) -> bool {
    match value {
        Value::String(_) => true,
        Value::Object(forms) => {
            forms.contains_key("other") && forms.values().all(|form| form.is_string())
        }
        _ => false,
    }
}

/// The placeholder names a message uses, across all its plural forms.
fn placeholders(value: &Value) -> std::collections::BTreeSet<String> {
    let texts: Vec<&str> = match value {
        Value::String(text) => vec![text.as_str()],
        Value::Object(forms) => forms.values().filter_map(Value::as_str).collect(),
        _ => vec![],
    };

    let mut names = std::collections::BTreeSet::new();
    for text in texts {
        let mut rest = text;
        while let Some(open) = rest.find('{') {
            let after = &rest[open + 1..];
            let Some(close) = after.find('}') else { break };
            names.insert(after[..close].to_string());
            rest = &after[close + 1..];
        }
    }
    names
}

#[cfg(test)]
mod tests {
    use super::*;

    fn system(tags: &[&str]) -> Vec<String> {
        tags.iter().map(|tag| tag.to_string()).collect()
    }

    const SUPPORTED: &[&str] = &["en-GB", "en-US", "de", "es", "fr"];

    #[test]
    fn the_core_catalogues_are_complete_and_consistent() {
        let directory = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../locales");
        if let Err(problems) = check_catalogues(&CORE, &directory) {
            panic!("{problems}");
        }
    }

    #[test]
    fn interpolates_named_arguments_and_keeps_unknown_ones() {
        assert_eq!(interpolate("{a} and {b}", &[("a", "x"), ("b", "y")]), "x and y");
        assert_eq!(interpolate("{missing} here", &[]), "{missing} here");
        assert_eq!(interpolate("open { only", &[]), "open { only");
    }

    #[test]
    fn chooses_plural_categories() {
        assert_eq!(plural_category("en-GB", 1.0), "one");
        assert_eq!(plural_category("en-GB", 0.0), "other");
        assert_eq!(plural_category("de", 2.0), "other");
        assert_eq!(plural_category("fr", 0.0), "one");
        assert_eq!(plural_category("fr", 1.0), "one");
        assert_eq!(plural_category("fr", 2.0), "other");
    }

    #[test]
    fn normalises_what_operating_systems_report() {
        assert_eq!(normalise("en_GB.UTF-8").as_deref(), Some("en-GB"));
        assert_eq!(normalise("de-de").as_deref(), Some("de-DE"));
        assert_eq!(normalise("zh-hant-tw").as_deref(), Some("zh-Hant-TW"));
        assert_eq!(normalise("sr_RS@latin").as_deref(), Some("sr-RS"));
        assert_eq!(normalise("C"), None);
        assert_eq!(normalise("POSIX"), None);
        assert_eq!(normalise(""), None);
    }

    // These cases are repeated in `src/i18n/resolve.test.ts`. Change both.
    #[test]
    fn resolves_the_language_to_show() {
        let cases: &[(&str, &[&str], &str)] = &[
            ("auto", &["en-US"], "en-US"),
            ("auto", &["en-GB"], "en-GB"),
            ("auto", &["en-AU"], "en-GB"),
            ("auto", &["de-AT", "en-US"], "de"),
            ("auto", &["it-IT", "fr-CA"], "fr"),
            ("auto", &["it-IT"], "en-GB"),
            ("auto", &[], "en-GB"),
            ("auto", &["es_ES.UTF-8"], "es"),
            ("en-US", &["de-DE"], "en-US"),
            ("de", &["en-US"], "de"),
            ("en-us", &[], "en-US"),
            ("it", &["fr-FR"], "fr"),
            ("it", &[], "en-GB"),
        ];

        for (preference, from, expected) in cases {
            assert_eq!(
                resolve(preference, &system(from), SUPPORTED),
                *expected,
                "{preference} with {from:?}"
            );
        }
    }

    #[test]
    fn keeps_preferences_shaped_like_tags() {
        assert!(is_preference("auto"));
        assert!(is_preference("de"));
        assert!(is_preference("en-US"));
        assert!(is_preference("it"));
        assert!(!is_preference("en_us"));
        assert!(!is_preference("not a language"));
        assert!(!is_preference(""));
    }

    #[test]
    fn layers_go_over_the_core_language_first() {
        static LAYER: Catalogs = Catalogs::new(&[
            ("en-GB", r#"{"test.layerOnly": "layer", "status.modified": "Reworded"}"#),
        ]);
        add_layer(&LAYER);
        add_layer(&LAYER);

        assert_eq!(format_layered("en-GB", "test.layerOnly", &[]), "layer");
        assert_eq!(format_layered("de", "test.layerOnly", &[]), "layer");
        // The layer rewords the core's English...
        assert_eq!(format_layered("en-GB", "status.modified", &[]), "Reworded");
        // ...but German the core has beats English the layer has.
        assert_eq!(format_layered("de", "status.modified", &[]), "Geändert");
        assert_eq!(LAYERS.read().unwrap().len(), 1);
    }

    #[test]
    fn falls_back_to_the_base_and_then_the_key() {
        let catalogs = Catalogs::new(&[
            ("en-GB", r#"{"a": "colour", "b": "both", "n": {"one": "{count} file", "other": "{count} files"}}"#),
            ("en-US", r#"{"a": "color"}"#),
        ]);

        assert_eq!(catalogs.format_in("en-US", "a", &[]), "color");
        assert_eq!(catalogs.format_in("en-US", "b", &[]), "both");
        assert_eq!(catalogs.format_in("de", "a", &[]), "colour");
        assert_eq!(catalogs.format_in("en-GB", "nope", &[]), "nope");
        assert_eq!(catalogs.format_in("en-GB", "n", &[("count", "1")]), "1 file");
        assert_eq!(catalogs.format_in("en-GB", "n", &[("count", "3")]), "3 files");
    }
}
