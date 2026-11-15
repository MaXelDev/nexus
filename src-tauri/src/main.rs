// NEXUS backend. The window starts hidden; `nexus --toggle` (bound to a GNOME custom shortcut)
// shows or hides it. Wayland apps cannot grab global shortcuts, hence this indirection.
mod config;

use std::path::PathBuf;
use std::process::Command;
use tauri::{Emitter, Manager, WebviewWindow};

/// Show + play the opening animation, or ask the frontend to play the closing one.
/// The frontend calls `hide` once its closing animation is done.
fn toggle(win: &WebviewWindow) {
    if win.is_visible().unwrap_or(false) {
        let _ = win.emit("nx-close", ());
    } else {
        let _ = win.show();
        let _ = win.set_focus();
        let _ = win.emit("nx-open", ());
    }
}

#[tauri::command]
fn hide(window: WebviewWindow) {
    let _ = window.hide();
}

/// What the frontend needs to draw the background. Paths are local files, loaded via the asset protocol.
#[derive(serde::Serialize)]
struct Appearance {
    wallpaper: Option<PathBuf>,
    logo: Option<PathBuf>,
}

#[tauri::command]
fn appearance() -> Appearance {
    let cfg = config::load();
    Appearance {
        wallpaper: if cfg.appearance.wallpaper_blur { current_wallpaper() } else { None },
        logo: cfg.appearance.logo.map(config::expand_home).filter(|p| p.is_file()),
    }
}

/// Current GNOME wallpaper (dark variant first). `gsettings` prints e.g. `'file:///home/x/a%20b.png'`.
fn current_wallpaper() -> Option<PathBuf> {
    ["picture-uri-dark", "picture-uri"].iter().find_map(|key| {
        let out = Command::new("gsettings")
            .args(["get", "org.gnome.desktop.background", key])
            .output()
            .ok()?;
        let uri = String::from_utf8(out.stdout).ok()?;
        // `Url::to_file_path` also decodes %20 and friends.
        let path = url::Url::parse(uri.trim().trim_matches('\'')).ok()?.to_file_path().ok()?;
        // shortcut: GNOME slideshow wallpapers (.xml) are skipped, the plain dark background is used instead.
        let is_image = matches!(
            path.extension().and_then(|e| e.to_str()).map(str::to_lowercase).as_deref(),
            Some("png" | "jpg" | "jpeg" | "webp")
        );
        (is_image && path.is_file()).then_some(path)
    })
}

fn main() {
    tauri::Builder::default()
        // Must be the first plugin: a second `nexus` process exits immediately and its argv lands here.
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            if argv.iter().any(|a| a == "--toggle") {
                if let Some(win) = app.get_webview_window("main") {
                    toggle(&win);
                }
            }
        }))
        .invoke_handler(tauri::generate_handler![hide, appearance])
        .setup(|app| {
            // First launch with --toggle (no instance running yet): show right away.
            if std::env::args().any(|a| a == "--toggle") {
                if let Some(win) = app.get_webview_window("main") {
                    toggle(&win);
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running NEXUS");
}
