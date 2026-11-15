// User config: ~/.config/nexus/config.toml. Every field has a default, so a missing file or a
// missing section is fine; a broken file is reported on stderr and defaults are used.
use serde::Deserialize;
use std::path::PathBuf;

#[derive(Deserialize, Default)]
#[serde(default)] // missing keys take the value from `Default`
pub struct Config {
    pub appearance: Appearance,
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
    let Ok(text) = std::fs::read_to_string(&path) else { return Config::default() };
    toml::from_str(&text).unwrap_or_else(|e| {
        eprintln!("nexus: {} invalide, valeurs par défaut utilisées : {e}", path.display());
        Config::default()
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn partial_file_keeps_defaults() {
        let c: Config = toml::from_str("[appearance]\nwallpaper_blur = false\n").unwrap();
        assert!(!c.appearance.wallpaper_blur);
        assert!(c.appearance.logo.is_some());
    }
}
