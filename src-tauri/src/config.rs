// User config: ~/.config/nexus/config.toml. Every field has a default, so a missing file or a
// missing section is fine; a broken file is reported on stderr and defaults are used.
use serde::Deserialize;
use std::path::PathBuf;

#[derive(Deserialize, Default)]
#[serde(default)] // missing keys take the value from `Default`
pub struct Config {
    pub appearance: Appearance,
    /// GNOME shortcut created on first start (Above_Tab = the key above Tab: ² on AZERTY, ` on QWERTY).
    /// "" = never touch the keyboard settings. Once created, edit it in GNOME Settings, not here.
    #[serde(default = "default_shortcut")]
    pub shortcut: String,
    /// Missing key = a few stock Fedora Workstation apps, so a fresh install isn't empty.
    #[serde(default = "default_apps")]
    pub apps: Vec<AppEntry>,
    pub commands: Vec<CommandEntry>,
    /// Missing section = weather hidden.
    pub weather: Option<WeatherCfg>,
    /// Missing section = departures hidden.
    pub transport: Option<TransportCfg>,
    /// Missing section = Notion card hidden.
    pub notion: Option<NotionCfg>,
    /// One tab per box; empty = mail card hidden.
    pub mail: Vec<MailCfg>,
}

fn default_shortcut() -> String {
    "<Super>Above_Tab".into()
}

fn default_apps() -> Vec<AppEntry> {
    [
        ("Firefox", "org.mozilla.firefox"), ("Fichiers", "org.gnome.Nautilus"), ("Terminal", "org.gnome.Ptyxis"),
        ("Éditeur", "org.gnome.TextEditor"), ("Agenda", "org.gnome.Calendar"), ("Calculatrice", "org.gnome.Calculator"),
        ("Logiciels", "org.gnome.Software"), ("Moniteur", "org.gnome.SystemMonitor"), ("Paramètres", "org.gnome.Settings"),
    ]
    .map(|(name, desktop)| AppEntry { name: name.into(), desktop: desktop.into() })
    .into()
}

#[derive(Deserialize)]
pub struct MailCfg {
    /// Tab name.
    pub name: String,
    /// Caption above the list (e.g. "Boîte INSA").
    #[serde(default)]
    pub label: String,
    /// Gmail label / IMAP folder holding urgent mail, and the one holding mail to deal with.
    pub urgent: String,
    pub todo: String,
    /// IMAP only: page opened when a mail is clicked (webmail).
    pub open_url: Option<String>,
    #[serde(flatten)]
    pub kind: MailKind,
}

#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum MailKind {
    /// OAuth secrets in the keyring: gmail_client_id, gmail_client_secret, gmail_refresh_token.
    Gmail,
    /// Secrets in the keyring: <secret_prefix>_user, <secret_prefix>_password.
    Imap {
        host: String,
        #[serde(default = "default_imap_port")]
        port: u16,
        secret_prefix: String,
    },
}

fn default_imap_port() -> u16 {
    993
}

#[derive(Deserialize)]
pub struct NotionCfg {
    pub tasks: NotionTasks,
    /// Missing = no health ring.
    pub health: Option<NotionHealth>,
}

/// Property names of the tasks database (Notion is case-sensitive).
#[derive(Deserialize)]
pub struct NotionTasks {
    pub database: String,
    pub title: String,
    pub subject: String,
    pub date: String,
    pub status: String,
    /// Status value meaning "done".
    pub done_value: String,
    /// Subject value marking an exam; the exam's title is shown as its subject.
    pub exam_value: String,
}

/// Average of a number/formula property over the last 7 days, on rows matching a select filter.
#[derive(Deserialize)]
pub struct NotionHealth {
    pub database: String,
    pub score: String,
    pub date: String,
    pub filter_property: String,
    pub filter_value: String,
}

#[derive(Deserialize)]
pub struct WeatherCfg {
    pub latitude: f64,
    pub longitude: f64,
    #[serde(default)]
    pub place: String,
}

#[derive(Deserialize)]
pub struct TransportCfg {
    #[serde(default = "default_provider")]
    pub provider: String,
    #[serde(default)]
    pub stop_name: String,
    /// Provider stop ids (TCL: one id per direction/platform).
    pub stop_ids: Vec<u32>,
    /// Keep only these lines; empty = all.
    #[serde(default)]
    pub lines: Vec<String>,
}

fn default_provider() -> String {
    "tcl".into()
}

/// One launcher tile. `desktop` is the .desktop file name without extension (e.g. "org.mozilla.firefox").
#[derive(Deserialize, Clone)]
pub struct AppEntry {
    pub name: String,
    pub desktop: String,
}

#[derive(Deserialize, Clone)]
pub struct CommandEntry {
    pub label: String,
    #[serde(default)]
    pub subtitle: String,
    /// Run by the user's shell in interactive mode (aliases available).
    pub command: String,
    /// Working directory, `~` expanded. Defaults to home.
    pub cwd: Option<String>,
    /// Button is enabled only while this path exists (e.g. a mounted USB key).
    pub requires_path: Option<String>,
    /// Subtitle shown while `requires_path` is missing.
    pub subtitle_unavailable: Option<String>,
}

#[derive(Deserialize)]
#[serde(default)]
pub struct Appearance {
    /// Draw the blurred current wallpaper behind the cards (Wayland can't blur what's behind a window).
    pub wallpaper_blur: bool,
    /// Image shown faintly in the centre. `~` is expanded.
    pub logo: Option<String>,
}

impl Default for Appearance {
    fn default() -> Self {
        Self { wallpaper_blur: true, logo: Some("~/.config/nexus/logo.jpg".into()) }
    }
}

pub fn dir() -> PathBuf {
    expand_home("~/.config/nexus")
}

pub fn expand_home(p: impl AsRef<str>) -> PathBuf {
    let p = p.as_ref();
    match (p.strip_prefix("~/"), std::env::var_os("HOME")) {
        (Some(rest), Some(home)) => PathBuf::from(home).join(rest),
        _ => PathBuf::from(p),
    }
}

pub fn load() -> Config {
    let path = dir().join("config.toml");
    // An empty document goes through serde, so field-level defaults (apps, shortcut) apply.
    let defaults = || toml::from_str::<Config>("").expect("empty config parses");
    let Ok(text) = std::fs::read_to_string(&path) else { return defaults() };
    toml::from_str(&text).unwrap_or_else(|e| {
        eprintln!("nexus: {} invalide, valeurs par défaut utilisées : {e}", path.display());
        defaults()
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn partial_file_keeps_defaults() {
        let c: Config = toml::from_str("[appearance]\nwallpaper_blur = false\n").unwrap();
        assert!(!c.appearance.wallpaper_blur);
        assert_eq!((c.apps.len(), c.shortcut.as_str()), (9, "<Super>Above_Tab")); // fresh-install defaults
        let c: Config = toml::from_str("apps = []\nshortcut = \"\"").unwrap();
        assert!(c.apps.is_empty() && c.shortcut.is_empty());
        assert!(c.appearance.logo.is_some());
        assert!(c.apps.is_empty());
    }

    #[test]
    fn example_config_parses() {
        let c: Config = toml::from_str(include_str!("../../config.example.toml")).unwrap();
        assert_eq!((c.apps.len(), c.shortcut.as_str()), (3, "<Super>Above_Tab"));
        assert!(c.commands.iter().any(|x| x.requires_path.is_some()));
        assert!(c.weather.is_some());
        assert!(c.notion.is_some_and(|n| n.health.is_some()));
        assert!(matches!(c.mail.as_slice(), [MailCfg { kind: MailKind::Gmail, .. }, MailCfg { kind: MailKind::Imap { port: 993, .. }, .. }]));
    }
}
