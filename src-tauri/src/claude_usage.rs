// Claude plan usage (5-hour session + 7-day week), same source as the `claude-code-usage` skill:
// the OAuth token Claude Code keeps in ~/.claude/.credentials.json, sent to an undocumented endpoint.
// Read-only: we never refresh or rewrite the token (that would fight Claude Code over it), so an
// expired token just means "unavailable" until Claude Code is used again.
use serde::Serialize;
use serde_json::Value;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Serialize)]
pub struct Window {
    pct: f64,
    resets_at: Option<String>,
}

#[derive(Serialize)]
pub struct Usage {
    session: Window,
    week: Window,
}

fn credentials_path() -> PathBuf {
    let dir = std::env::var_os("CLAUDE_CONFIG_DIR").map(PathBuf::from).unwrap_or_else(|| crate::config::expand_home("~/.claude"));
    dir.join(".credentials.json")
}

/// None = Claude Code not installed / never logged in: the card is hidden.
pub fn fetch() -> Option<Result<Usage, String>> {
    let text = std::fs::read_to_string(credentials_path()).ok()?;
    Some(fetch_with(&text))
}

fn fetch_with(credentials: &str) -> Result<Usage, String> {
    let creds: Value = serde_json::from_str(credentials).map_err(|_| "identifiants Claude illisibles")?;
    let oauth = &creds["claudeAiOauth"];
    let token = oauth["accessToken"].as_str().ok_or("jeton Claude absent")?;
    let now_ms = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as f64).unwrap_or(0.0);
    if oauth["expiresAt"].as_f64().is_some_and(|exp| exp < now_ms) {
        return Err("jeton Claude expiré (relancer Claude Code)".into());
    }
    let v: Value = ureq::get("https://api.anthropic.com/api/oauth/usage")
        .header("Authorization", &format!("Bearer {token}"))
        .header("anthropic-beta", "oauth-2025-04-20")
        .call()
        .and_then(|mut r| r.body_mut().read_json())
        .map_err(|e| format!("API d'usage Claude : {e}"))?;
    parse(&v)
}

fn parse(v: &Value) -> Result<Usage, String> {
    let window = |k: &str| -> Result<Window, String> {
        let w = &v[k];
        Ok(Window {
            pct: w["utilization"].as_f64().ok_or_else(|| format!("champ {k} absent (format de l'API changé ?)"))?,
            resets_at: w["resets_at"].as_str().map(String::from),
        })
    };
    Ok(Usage { session: window("five_hour")?, week: window("seven_day")? })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn parses_windows() {
        let u = parse(&json!({
            "five_hour": { "utilization": 11.0, "resets_at": "2026-11-15T19:59:59+00:00" },
            "seven_day": { "utilization": 59.0, "resets_at": null },
        })).unwrap();
        assert_eq!((u.session.pct, u.week.pct), (11.0, 59.0));
        assert!(u.week.resets_at.is_none());
        assert!(parse(&json!({ "five_hour": {} })).is_err());
    }

    #[test]
    fn expired_token_is_an_error_without_network() {
        let e = fetch_with(r#"{"claudeAiOauth":{"accessToken":"x","expiresAt":1}}"#).err().unwrap();
        assert!(e.contains("expiré"));
    }
}
