// Mail card: messages carrying an "urgent" or "to do" label (Gmail) / sitting in those folders (IMAP).
// Read-only everywhere: Gmail scope gmail.readonly, IMAP mailboxes opened with EXAMINE and headers
// fetched with RFC822.HEADER (= BODY.PEEK[HEADER]), so nothing is marked as read.
use crate::config::{MailCfg, MailKind};
use crate::secrets;
use serde::Serialize;
use serde_json::Value;

const MAX_PER_GROUP: usize = 10;

#[derive(Serialize)]
pub struct Message {
    from: String,
    subject: String,
    urgent: bool,
    /// Opened in the browser on click.
    url: String,
}

#[derive(Serialize)]
pub struct Mailbox {
    name: String,
    label: String,
    /// None = this box failed; the other boxes still show.
    messages: Option<Vec<Message>>,
}

pub fn fetch_all(boxes: &[MailCfg]) -> Vec<Mailbox> {
    boxes
        .iter()
        .map(|b| {
            let r = match &b.kind {
                MailKind::Gmail => gmail(b),
                MailKind::Imap { host, port, secret_prefix } => imap_box(b, host, *port, secret_prefix),
            };
            if let Err(e) = &r {
                eprintln!("nexus: {} : {e}", b.name);
            }
            Mailbox { name: b.name.clone(), label: b.label.clone(), messages: r.ok() }
        })
        .collect()
}

/// "Jane Doe <jane@x.org>" -> "Jane Doe" (falls back to the address).
fn display_name(from: &str) -> String {
    match mailparse::addrparse(from).ok().and_then(|l| l.first().cloned()) {
        Some(mailparse::MailAddr::Single(i)) => i.display_name.unwrap_or(i.addr),
        Some(mailparse::MailAddr::Group(g)) => g.group_name,
        None => from.to_string(),
    }
}

// ---------- Gmail ----------

fn gmail_token() -> Result<String, String> {
    let form = [
        ("grant_type", "refresh_token".to_string()),
        ("client_id", secrets::get("gmail_client_id")?),
        ("client_secret", secrets::get("gmail_client_secret")?),
        ("refresh_token", secrets::get("gmail_refresh_token")?),
    ];
    let v: Value = ureq::post("https://oauth2.googleapis.com/token")
        .send_form(form.iter().map(|(k, v)| (*k, v.as_str())))
        .and_then(|mut r| r.body_mut().read_json())
        .map_err(|e| format!("jeton Gmail refusé : {e}"))?;
    v["access_token"].as_str().map(String::from).ok_or_else(|| "jeton Gmail absent".into())
}

fn gmail_get(token: &str, url: &str) -> Result<Value, String> {
    ureq::get(url)
        .header("Authorization", &format!("Bearer {token}"))
        .call()
        .and_then(|mut r| r.body_mut().read_json())
        .map_err(|e| format!("Gmail : {e}"))
}

fn gmail(b: &MailCfg) -> Result<Vec<Message>, String> {
    let token = gmail_token()?;
    let api = "https://gmail.googleapis.com/gmail/v1/users/me";
    // Label names -> ids.
    let labels = gmail_get(&token, &format!("{api}/labels"))?;
    let id_of = |name: &str| {
        labels["labels"].as_array().and_then(|l| l.iter().find(|x| x["name"] == name)).and_then(|x| x["id"].as_str())
            .map(String::from).ok_or_else(|| format!("libellé Gmail « {name} » introuvable"))
    };
    let mut out = Vec::new();
    for (name, urgent) in [(&b.urgent, true), (&b.todo, false)] {
        let list = gmail_get(&token, &format!("{api}/messages?labelIds={}&maxResults={MAX_PER_GROUP}", id_of(name)?))?;
        for m in list["messages"].as_array().into_iter().flatten() {
            let id = m["id"].as_str().unwrap_or_default();
            let msg = gmail_get(&token, &format!(
                "{api}/messages/{id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject"))?;
            let header = |h: &str| {
                msg["payload"]["headers"].as_array().and_then(|hs| hs.iter().find(|x| x["name"] == h))
                    .and_then(|x| x["value"].as_str()).unwrap_or_default().to_string()
            };
            out.push(Message {
                from: display_name(&header("From")),
                subject: header("Subject"),
                urgent,
                url: format!("https://mail.google.com/mail/u/0/#all/{}", msg["threadId"].as_str().unwrap_or(id)),
            });
        }
    }
    Ok(out)
}

// ---------- IMAP ----------

fn imap_box(b: &MailCfg, host: &str, port: u16, prefix: &str) -> Result<Vec<Message>, String> {
    let user = secrets::get(&format!("{prefix}_user"))?;
    let pass = secrets::get(&format!("{prefix}_password"))?;
    let tls = native_tls::TlsConnector::new().map_err(|e| e.to_string())?;
    let client = imap::connect((host, port), host, &tls).map_err(|e| format!("IMAP {host} : {e}"))?;
    // Login errors carry the server's reply only, never the password.
    let mut s = client.login(user, pass).map_err(|(e, _)| format!("connexion IMAP refusée : {e}"))?;
    let mut out = Vec::new();
    for (folder, urgent) in [(&b.urgent, true), (&b.todo, false)] {
        let mb = s.examine(folder).map_err(|e| format!("dossier « {folder} » : {e}"))?;
        if mb.exists == 0 {
            continue;
        }
        let first = mb.exists.saturating_sub(MAX_PER_GROUP as u32 - 1).max(1);
        let fetches = s.fetch(format!("{first}:*"), "RFC822.HEADER").map_err(|e| e.to_string())?;
        for f in fetches.iter().rev() {
            let Some(raw) = f.header() else { continue };
            let Ok((headers, _)) = mailparse::parse_headers(raw) else { continue };
            use mailparse::MailHeaderMap;
            out.push(Message {
                from: display_name(&headers.get_first_value("From").unwrap_or_default()),
                subject: headers.get_first_value("Subject").unwrap_or_default(),
                urgent,
                url: b.open_url.clone().unwrap_or_default(),
            });
        }
    }
    let _ = s.logout();
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn display_names() {
        assert_eq!(display_name("Scolarité INSA <scol@insa-lyon.fr>"), "Scolarité INSA");
        assert_eq!(display_name("\"Doe, Jane\" <j@x.org>"), "Doe, Jane");
        assert_eq!(display_name("j@x.org"), "j@x.org");
    }

    #[test]
    fn decodes_encoded_words() {
        let raw = b"From: =?UTF-8?B?RMOpcC4gVMOpbMOpY29t?= <a@b.c>\r\nSubject: =?UTF-8?Q?V=C5=93ux_d=E2=80=99=C3=A9change?=\r\n\r\n";
        let (h, _) = mailparse::parse_headers(raw).unwrap();
        use mailparse::MailHeaderMap;
        assert_eq!(display_name(&h.get_first_value("From").unwrap()), "Dép. Télécom");
        assert_eq!(h.get_first_value("Subject").unwrap(), "Vœux d’échange");
    }
}

#[cfg(test)]
mod live {
    /// Real accounts, prints only counts. `cargo test live_mail -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn live_mail() {
        for b in super::fetch_all(&crate::config::load().mail) {
            match b.messages {
                Some(m) => println!("{}: {} urgent, {} à traiter", b.name, m.iter().filter(|x| x.urgent).count(), m.iter().filter(|x| !x.urgent).count()),
                None => println!("{}: ERREUR", b.name),
            }
        }
    }
}
