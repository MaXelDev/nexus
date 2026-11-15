// NEXUS backend. The window starts hidden; `nexus --toggle` (bound to a GNOME custom shortcut)
// shows or hides it. Wayland apps cannot grab global shortcuts, hence this indirection.
mod claude_usage;
mod commands;
mod config;
mod http;
mod launcher;
mod mail;
mod notion;
mod relay;
mod secrets;
mod shortcut;
mod transport;
mod weather;

use std::path::PathBuf;
use std::process::Command;
use gio::prelude::VolumeMonitorExt;
use tauri::{AppHandle, Emitter, Manager, WebviewWindow};

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

/// Let the webview read exactly this file through the asset protocol (the static scope is empty,
/// so nothing else in $HOME — keys, tokens — is ever reachable from the page).
/// Returns the symlink-free path to load: Tauri's scope check rejects file symlinks,
/// which icon themes use a lot (vscode.svg -> visual-studio-code.svg).
fn expose(app: &AppHandle, path: PathBuf) -> PathBuf {
    let real = path.canonicalize().unwrap_or(path);
    let _ = app.asset_protocol_scope().allow_file(&real);
    real
}

#[tauri::command]
fn appearance(app: AppHandle) -> Appearance {
    let cfg = config::load();
    Appearance {
        wallpaper: if cfg.appearance.wallpaper_blur { current_wallpaper() } else { None }.map(|p| expose(&app, p)),
        logo: cfg.appearance.logo.map(config::expand_home).filter(|p| p.is_file()).map(|p| expose(&app, p)),
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

#[tauri::command]
fn apps(app: AppHandle) -> Vec<launcher::App> {
    let mut apps = launcher::resolve(&config::load().apps);
    for a in &mut apps {
        a.icon = a.icon.take().map(|p| expose(&app, p));
    }
    apps
}

#[tauri::command]
fn launch_app(index: usize) -> Result<(), String> {
    let cfg = config::load();
    launcher::launch(cfg.apps.get(index).ok_or("app inconnue")?)
}

#[tauri::command]
fn command_states() -> Vec<commands::CommandState> {
    commands::states(&config::load().commands)
}

#[tauri::command]
fn run_command(index: usize) -> Result<(), String> {
    let cfg = config::load();
    commands::run(cfg.commands.get(index).ok_or("commande inconnue")?)
}

// Network fetches are blocking (ureq): run them off the main thread so the UI never stalls.
// `None` = card section disabled in the config.
#[tauri::command]
async fn weather() -> Result<Option<weather::Weather>, String> {
    tauri::async_runtime::spawn_blocking(|| config::load().weather.as_ref().map(weather::fetch).transpose())
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn departures() -> Result<Option<transport::Board>, String> {
    tauri::async_runtime::spawn_blocking(|| config::load().transport.as_ref().map(transport::fetch).transpose())
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn notion(today: String, since: String) -> Result<Option<notion::Notion>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        config::load().notion.as_ref().map(|c| notion::fetch(c, &today, &since)).transpose()
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn mails() -> Result<Vec<mail::Mailbox>, String> {
    tauri::async_runtime::spawn_blocking(|| mail::fetch_all(&config::load().mail)).await.map_err(|e| e.to_string())
}

/// Open a mail in the browser. Only https links: the URL comes from mail data.
#[tauri::command]
fn open_url(url: String) -> Result<(), String> {
    if !url.starts_with("https://") {
        return Err("lien refusé".into());
    }
    let mut child = Command::new("xdg-open").arg(url).spawn().map_err(|e| e.to_string())?;
    std::thread::spawn(move || child.wait());
    Ok(())
}

#[tauri::command]
async fn claude_usage() -> Result<Option<claude_usage::Usage>, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let usage = claude_usage::fetch().transpose()?;
        // Forward to the relay for the phone, on its own thread: the PC card never waits for it.
        if let (Some(u), Some(r)) = (&usage, config::load().relay) {
            let body = serde_json::to_string(u).map_err(|e| e.to_string())?;
            std::thread::spawn(move || {
                if let Err(e) = relay::push_usage(&r, body) {
                    eprintln!("nexus: {e}");
                }
            });
        }
        Ok(usage)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Set by `nexus --pair` when it starts the first instance, before the page can listen.
static PAIR_PENDING: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

#[tauri::command]
fn take_pair_request() -> bool {
    PAIR_PENDING.swap(false, std::sync::atomic::Ordering::Relaxed)
}

/// One-time pairing code from the relay, as a QR. Called by the page on `nexus --pair`.
#[tauri::command]
async fn pair() -> Result<relay::PairQr, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let r = config::load().relay.ok_or("section [relay] absente de la config")?;
        relay::pair(&r)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// `nexus --pair`: show the dashboard and ask the page to display a pairing QR.
fn request_pair(win: &WebviewWindow) {
    if !win.is_visible().unwrap_or(false) {
        toggle(win);
    }
    let _ = win.emit("nx-pair", ());
}

/// Tell the frontend when a drive is (un)mounted, so path-dependent buttons update without polling.
fn watch_mounts(app: &AppHandle) {
    let monitor = gio::VolumeMonitor::get();
    let (a, b) = (app.clone(), app.clone());
    monitor.connect_mount_added(move |_, _| { let _ = a.emit("nx-mounts", ()); });
    monitor.connect_mount_removed(move |_, _| { let _ = b.emit("nx-mounts", ()); });
    // The monitor must outlive this function for the signals to keep firing.
    std::mem::forget(monitor);
}

fn main() {
    tauri::Builder::default()
        // Must be the first plugin: a second `nexus` process exits immediately and its argv lands here.
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            if let Some(win) = app.get_webview_window("main") {
                if argv.iter().any(|a| a == "--pair") {
                    request_pair(&win);
                } else if argv.iter().any(|a| a == "--toggle") {
                    toggle(&win);
                }
            }
        }))
        .invoke_handler(tauri::generate_handler![hide, appearance, apps, launch_app, command_states, run_command, weather, departures, notion, mails, open_url, claude_usage, pair, take_pair_request])
        .setup(|app| {
            watch_mounts(app.handle());
            shortcut::ensure(&config::load().shortcut);
            // First launch with --toggle (no instance running yet): show right away.
            if std::env::args().any(|a| a == "--pair") {
                PAIR_PENDING.store(true, std::sync::atomic::Ordering::Relaxed);
            }
            if std::env::args().any(|a| a == "--toggle" || a == "--pair") {
                if let Some(win) = app.get_webview_window("main") {
                    toggle(&win);
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running NEXUS");
}
