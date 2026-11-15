// Next departures. Only provider so far: TCL (Lyon) real-time dataset on data.grandlyon.com,
// HTTP Basic auth with the account stored in the keyring (grandlyon_user / grandlyon_password).
// To add another network: write a `fetch_<provider>` returning Vec<Departure> and match on `provider`.
use crate::config::TransportCfg;
use crate::secrets;
use base64::Engine;
use serde::{Deserialize, Serialize};

#[derive(Serialize)]
pub struct Departure {
    line: String,
    direction: String,
    /// Local time "YYYY-MM-DD HH:MM:SS"; the frontend turns it into "N min".
    at: String,
}

#[derive(Deserialize)]
struct TclResp {
    values: Vec<TclRow>,
}
#[derive(Deserialize)]
struct TclRow {
    ligne: String,
    direction: String,
    heurepassage: String,
}

#[derive(Serialize)]
pub struct Board {
    stop: String,
    departures: Vec<Departure>,
}

pub fn fetch(cfg: &TransportCfg) -> Result<Board, String> {
    let departures = match cfg.provider.as_str() {
        "tcl" => fetch_tcl(cfg)?,
        other => return Err(format!("transport : fournisseur « {other} » inconnu")),
    };
    Ok(Board { stop: cfg.stop_name.clone(), departures })
}

fn fetch_tcl(cfg: &TransportCfg) -> Result<Vec<Departure>, String> {
    let creds = format!("{}:{}", secrets::get("grandlyon_user")?, secrets::get("grandlyon_password")?);
    let auth = format!("Basic {}", base64::engine::general_purpose::STANDARD.encode(creds));
    let mut out = Vec::new();
    for id in &cfg.stop_ids {
        let url = format!(
            "https://data.grandlyon.com/fr/datapusher/ws/rdata/tcl_sytral.tclpassagearret/all.json?field=id&value={id}&maxfeatures=100"
        );
        let r: TclResp = ureq::get(&url)
            .header("Authorization", &auth)
            .call()
            .and_then(|mut r| r.body_mut().read_json())
            .map_err(|e| format!("TCL : {e}"))?; // ureq errors never contain request headers
        out.extend(
            r.values
                .into_iter()
                .filter(|v| cfg.lines.is_empty() || cfg.lines.contains(&v.ligne))
                .map(|v| Departure { line: v.ligne, direction: v.direction, at: v.heurepassage }),
        );
    }
    Ok(out)
}
