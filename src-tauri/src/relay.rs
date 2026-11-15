// NEXUS PC → nexus-relay (docs/relay-api.md): pushes the Claude quota for the phone, and creates
// pairing codes shown as a QR. Uses the PC's own tokens from the keyring (relay_push_token,
// relay_admin_token, created by scripts/relay-setup.sh); they never reach the webview.
use crate::config::RelayCfg;
use crate::secrets;
use serde::Serialize;
use std::sync::Mutex;

fn base(cfg: &RelayCfg) -> Result<&str, String> {
    let url = cfg.url.trim_end_matches('/');
    url.starts_with("https://").then_some(url).ok_or_else(|| "relais : l'URL doit être en https".into())
}

/// Last quota sent: only changes are pushed (the relay's KV allows 1,000 writes/day).
static LAST_PUSH: Mutex<Option<String>> = Mutex::new(None);

/// `body` = the usage as JSON.
pub fn push_usage(cfg: &RelayCfg, body: String) -> Result<(), String> {
    if LAST_PUSH.lock().unwrap().as_deref() == Some(body.as_str()) {
        return Ok(());
    }
    let token = secrets::get("relay_push_token")?;
    crate::http::AGENT.post(&format!("{}/v1/claude-usage", base(cfg)?))
        .header("Authorization", &format!("Bearer {token}"))
        .header("Content-Type", "application/json")
        .send(&body)
        .map_err(|e| format!("relais : {e}"))?; // ureq errors never include request headers
    *LAST_PUSH.lock().unwrap() = Some(body);
    Ok(())
}

#[derive(Serialize)]
pub struct PairQr {
    /// QR code as an SVG document, built here from the relay URL and the one-time code.
    svg: String,
    expires_in: u64,
}

pub fn pair(cfg: &RelayCfg) -> Result<PairQr, String> {
    let url = base(cfg)?;
    let token = secrets::get("relay_admin_token")?;
    let v: serde_json::Value = crate::http::AGENT.post(&format!("{url}/v1/pair"))
        .header("Authorization", &format!("Bearer {token}"))
        .send_empty()
        .and_then(|mut r| r.body_mut().read_json())
        .map_err(|e| format!("relais : {e}"))?;
    let code = v["code"].as_str().filter(|c| c.len() == 22).ok_or("relais : réponse d'appairage invalide")?;
    let link = qr_link(url, code);
    let svg = qrcode::QrCode::new(link.as_bytes())
        .map_err(|e| e.to_string())?
        .render::<qrcode::render::svg::Color>()
        .min_dimensions(260, 260)
        .dark_color(qrcode::render::svg::Color("#0b0f1a"))
        .light_color(qrcode::render::svg::Color("#f2f4f8"))
        .build();
    Ok(PairQr { svg, expires_in: v["expires_in"].as_u64().unwrap_or(60) })
}

/// What the phone scans: the relay URL travels in the QR, so it's never baked into the APK.
fn qr_link(relay: &str, code: &str) -> String {
    let q: String = url::form_urlencoded::Serializer::new(String::new()).append_pair("relay", relay).append_pair("code", code).finish();
    format!("nexus://pair?{q}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn link_and_url_checks() {
        assert_eq!(qr_link("https://r.example.dev", "abc"), "nexus://pair?relay=https%3A%2F%2Fr.example.dev&code=abc");
        assert!(base(&RelayCfg { url: "http://r.example.dev".into() }).is_err());
        assert_eq!(base(&RelayCfg { url: "https://r.example.dev/".into() }).unwrap(), "https://r.example.dev");
    }
}
