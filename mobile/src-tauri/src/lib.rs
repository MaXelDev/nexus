// NEXUS Android backend. Holds the relay credentials (via the Kotlin plugin, Keystore-encrypted)
// and makes every relay call itself: the device token never reaches the webview, which only
// gets the summary JSON (docs/relay-api.md, ADR 0006).
// The plugin glue only exists on Android; `cargo test` on the PC builds without it.
#![cfg_attr(not(mobile), allow(dead_code, unused_imports))]
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use serde_json::{json, Value};
use std::sync::LazyLock;
use std::time::Duration;
use tauri::{AppHandle, Manager, Runtime};

static AGENT: LazyLock<ureq::Agent> =
    LazyLock::new(|| ureq::Agent::config_builder().timeout_global(Some(Duration::from_secs(15))).build().into());

/// What the Keystore protects: where the relay is and this phone's token.
#[derive(Serialize, Deserialize)]
struct Creds {
    relay: String,
    token: String,
}

// ---------- Kotlin plugin (gen/android/.../NexusPlugin.kt) ----------
struct Native<R: Runtime>(tauri::plugin::PluginHandle<R>);

#[cfg(mobile)]
fn native<R: Runtime, T: DeserializeOwned>(app: &AppHandle<R>, cmd: &str, args: impl Serialize) -> Result<T, String> {
    // Errors from the plugin only name the exception type, never a value.
    app.state::<Native<R>>().0.run_mobile_plugin(cmd, args).map_err(|e| e.to_string())
}
#[cfg(not(mobile))]
fn native<R: Runtime, T: DeserializeOwned>(_: &AppHandle<R>, _: &str, _: impl Serialize) -> Result<T, String> {
    Err("Android uniquement".into())
}

fn creds<R: Runtime>(app: &AppHandle<R>) -> Result<Option<Creds>, String> {
    #[derive(Deserialize)]
    struct Stored {
        value: Option<String>,
    }
    let s: Stored = native(app, "load", ())?;
    Ok(s.value.and_then(|v| serde_json::from_str(&v).ok()))
}

fn forget_local<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    native::<R, Value>(app, "clear", ()).map(|_| ())
}

// ---------- commands ----------
/// The relay summary. Error "unpaired" = no token, or the relay no longer knows it (revoked).
#[tauri::command(async)]
fn summary<R: Runtime>(app: AppHandle<R>) -> Result<Value, String> {
    let c = creds(&app)?.ok_or("unpaired")?;
    match AGENT.get(&format!("{}/v1/summary", c.relay)).header("Authorization", &format!("Bearer {}", c.token)).call() {
        Ok(mut r) => r.body_mut().read_json().map_err(|_| "relais : réponse invalide".into()),
        Err(ureq::Error::StatusCode(401)) => {
            forget_local(&app)?;
            Err("unpaired".into())
        }
        Err(ureq::Error::StatusCode(s)) => Err(format!("relais : HTTP {s}")),
        Err(_) => Err("relais injoignable".into()), // ureq errors never include request headers
    }
}

/// Relay URL of the paired relay (never the token), or null.
#[tauri::command(async)]
fn paired_relay<R: Runtime>(app: AppHandle<R>) -> Result<Option<String>, String> {
    Ok(creds(&app)?.map(|c| c.relay))
}

/// Trades the one-time code of a scanned `nexus://pair?relay=…&code=…` for this phone's token.
#[tauri::command(async)]
fn pair<R: Runtime>(app: AppHandle<R>, link: String, device: String) -> Result<String, String> {
    let (relay, code) = parse_pair_link(&link).ok_or("Ce QR n'est pas un QR d'appairage NEXUS")?;
    let mut r = AGENT
        .post(&format!("{relay}/v1/pair/claim"))
        .send_json(json!({ "code": code, "device": device.trim() }))
        .map_err(|e| match e {
            ureq::Error::StatusCode(400) => "Nom invalide : 1 à 40 lettres, chiffres, espaces ou - _ ' .".to_string(),
            ureq::Error::StatusCode(401) => "QR expiré ou déjà utilisé : affiche-en un nouveau sur le PC".into(),
            ureq::Error::StatusCode(409) => "Ce nom d'appareil est déjà pris".into(),
            ureq::Error::StatusCode(429) => "Trop d'essais : réessaie dans une minute".into(),
            _ => "Relais injoignable".into(),
        })?;
    let v: Value = r.body_mut().read_json().map_err(|_| "relais : réponse invalide")?;
    let token = v["token"].as_str().filter(|t| t.starts_with("nxd_") && t.len() == 47).ok_or("relais : réponse invalide")?;
    let blob = serde_json::to_string(&Creds { relay: relay.clone(), token: token.into() }).map_err(|e| e.to_string())?;
    native::<R, Value>(&app, "save", json!({ "value": blob }))?;
    Ok(relay)
}

/// "Forget this phone": revokes the token on the relay (best effort), then deletes it here.
#[tauri::command(async)]
fn forget<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    if let Some(c) = creds(&app)? {
        // Offline? The local copy still goes; scripts/relay-revoke.sh can finish the job on the PC.
        let _ = AGENT.delete(&format!("{}/v1/device", c.relay)).header("Authorization", &format!("Bearer {}", c.token)).call();
    }
    forget_local(&app)
}

/// Opens `camera`, an https page, or an app by package name (targets come from the relay config).
#[tauri::command(async)]
fn open<R: Runtime>(app: AppHandle<R>, target: String) -> Result<(), String> {
    if !valid_target(&target) {
        return Err("cible invalide".into());
    }
    native::<R, Value>(&app, "open", json!({ "target": target })).map(|_| ())
}

/// True once the phone is unlocked: settings (forget, pair) are never reachable from the lock screen.
#[tauri::command(async)]
fn unlock<R: Runtime>(app: AppHandle<R>) -> Result<bool, String> {
    #[derive(Deserialize)]
    struct Unlocked {
        ok: bool,
    }
    native::<R, Unlocked>(&app, "unlock", ()).map(|u| u.ok)
}

#[tauri::command(async)]
fn secure<R: Runtime>(app: AppHandle<R>, on: bool) -> Result<(), String> {
    native::<R, Value>(&app, "secure", json!({ "on": on })).map(|_| ())
}

// ---------- checks ----------
/// `nexus://pair?relay=https://…&code=<22 base64url>` → (relay without trailing /, code).
fn parse_pair_link(link: &str) -> Option<(String, String)> {
    let u = url::Url::parse(link).ok()?;
    if u.scheme() != "nexus" || u.host_str() != Some("pair") {
        return None;
    }
    let get = |k: &str| u.query_pairs().find(|(n, _)| n == k).map(|(_, v)| v.into_owned());
    let relay = url::Url::parse(&get("relay")?).ok()?;
    let code = get("code")?;
    let ok_relay = relay.scheme() == "https" && relay.host_str().is_some() && relay.username().is_empty()
        && relay.password().is_none() && relay.query().is_none() && relay.fragment().is_none();
    let ok_code = code.len() == 22 && code.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_');
    (ok_relay && ok_code).then(|| (relay.as_str().trim_end_matches('/').to_string(), code))
}

fn valid_target(t: &str) -> bool {
    let package = |s: &str| {
        s.len() <= 100 && s.split('.').count() >= 2
            && s.split('.').all(|p| p.chars().next().is_some_and(|c| c.is_ascii_alphabetic()) && p.chars().all(|c| c.is_ascii_alphanumeric() || c == '_'))
    };
    t == "camera" || (t.starts_with("https://") && url::Url::parse(t).is_ok()) || package(t)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let native = tauri::plugin::Builder::<tauri::Wry>::new("nexus")
        .setup(|app, api| {
            #[cfg(target_os = "android")]
            app.manage(Native(api.register_android_plugin("io.github.nexus.mobile", "NexusPlugin")?));
            let _ = (app, api);
            Ok(())
        })
        .build();
    let builder = tauri::Builder::default().plugin(native);
    #[cfg(mobile)]
    let builder = builder.plugin(tauri_plugin_barcode_scanner::init());
    builder
        .invoke_handler(tauri::generate_handler![summary, paired_relay, pair, forget, open, secure, unlock])
        .run(tauri::generate_context!())
        .expect("error while running NEXUS");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pair_link() {
        let code = "abcdefghijklmnopqrstuv";
        assert_eq!(
            parse_pair_link(&format!("nexus://pair?relay=https%3A%2F%2Fr.example.dev%2F&code={code}")),
            Some(("https://r.example.dev".into(), code.into()))
        );
        for bad in [
            format!("nexus://pair?relay=http%3A%2F%2Fr.example.dev&code={code}"), // no clear text
            format!("nexus://pair?relay=https%3A%2F%2Fu%3Ap%40r.example.dev&code={code}"), // no credentials
            format!("https://pair?relay=https%3A%2F%2Fr.example.dev&code={code}"),
            "nexus://pair?relay=https%3A%2F%2Fr.example.dev&code=short".into(),
            format!("nexus://other?relay=https%3A%2F%2Fr.example.dev&code={code}"),
        ] {
            assert_eq!(parse_pair_link(&bad), None, "{bad}");
        }
    }

    #[test]
    fn open_targets() {
        for ok in ["camera", "notion.id", "com.google.android.gm", "https://meteofrance.com/x"] {
            assert!(valid_target(ok), "{ok}");
        }
        for bad in ["", "intent://x", "http://x.fr", "javascript:alert(1)", "com", "com..gm", "1com.x"] {
            assert!(!valid_target(bad), "{bad}");
        }
    }
}
