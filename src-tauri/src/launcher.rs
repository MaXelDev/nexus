// App launcher: resolves each configured desktop id to its .desktop file and real icon.
use crate::config::{expand_home, AppEntry};
use gtk::prelude::IconThemeExt;
use std::path::{Path, PathBuf};
use std::process::Command;

#[derive(serde::Serialize)]
pub struct App {
    name: String,
    pub icon: Option<PathBuf>,
    found: bool,
}

/// Where .desktop files live: user dir first, then system and Flatpak exports.
fn app_dirs() -> Vec<PathBuf> {
    let mut dirs = vec![expand_home("~/.local/share/applications")];
    let sys = std::env::var("XDG_DATA_DIRS").unwrap_or_else(|_| "/usr/local/share:/usr/share".into());
    dirs.extend(sys.split(':').filter(|d| !d.is_empty()).map(|d| Path::new(d).join("applications")));
    // Not always in XDG_DATA_DIRS when launched outside a full session (e.g. from a terminal).
    dirs.push(expand_home("~/.local/share/flatpak/exports/share/applications"));
    dirs.push("/var/lib/flatpak/exports/share/applications".into());
    dirs
}

fn desktop_file(id: &str) -> Option<PathBuf> {
    app_dirs().into_iter().map(|d| d.join(format!("{id}.desktop"))).find(|p| p.is_file())
}

/// `Icon=` is either an absolute path (sometimes without extension) or a theme icon name.
/// Must run on the GTK main thread (sync Tauri commands do).
fn icon_path(icon: &str) -> Option<PathBuf> {
    let p = Path::new(icon);
    if p.is_absolute() {
        return std::iter::once(p.to_path_buf())
            .chain(["png", "svg"].iter().map(|e| p.with_extension(e)))
            .find(|c| c.is_file());
    }
    let theme = gtk::IconTheme::default()?; // the user's active icon theme
    theme.lookup_icon(icon, 64, gtk::IconLookupFlags::FORCE_SIZE)?.filename()
}

fn read_icon_key(desktop: &Path) -> Option<String> {
    let text = std::fs::read_to_string(desktop).ok()?;
    text.lines().find_map(|l| l.strip_prefix("Icon=")).map(|s| s.trim().to_string())
}

pub fn resolve(entries: &[AppEntry]) -> Vec<App> {
    entries
        .iter()
        .map(|e| {
            let file = desktop_file(&e.desktop);
            if file.is_none() {
                eprintln!("nexus: app « {} » introuvable ({}.desktop)", e.name, e.desktop);
            }
            let icon = file.as_deref().and_then(read_icon_key).and_then(|i| icon_path(&i));
            App { name: e.name.clone(), icon, found: file.is_some() }
        })
        .collect()
}

pub fn launch(entry: &AppEntry) -> Result<(), String> {
    let mut child = Command::new("gtk-launch").arg(&entry.desktop).spawn().map_err(|e| e.to_string())?;
    // Reap the short-lived gtk-launch process so it doesn't stay as a zombie.
    std::thread::spawn(move || child.wait());
    Ok(())
}
