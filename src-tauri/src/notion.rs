// Notion card: today's tasks, next exam, average health score.
// Official API, internal integration token in the keyring (`notion_token`); the databases
// must be shared with the integration. Property names come from the config.
use crate::config::NotionCfg;
use crate::secrets;
use serde::Serialize;
use serde_json::{json, Value};

#[derive(Serialize)]
pub struct Task {
    title: String,
    subject: String,
    done: bool,
}

#[derive(Serialize)]
pub struct Exam {
    title: String,
    date: String,
}

#[derive(Serialize)]
pub struct Health {
    /// Average score over the window, rounded.
    score: u32,
    days: usize,
}

#[derive(Serialize)]
pub struct Notion {
    tasks: Vec<Task>,
    exam: Option<Exam>,
    health: Option<Health>,
}

fn query(token: &str, db: &str, body: Value) -> Result<Vec<Value>, String> {
    let mut r = crate::http::AGENT.post(&format!("https://api.notion.com/v1/databases/{db}/query"))
        .header("Authorization", &format!("Bearer {token}"))
        .header("Notion-Version", "2022-06-28")
        .send_json(body)
        .map_err(|e| format!("Notion : {e}"))?;
    let v: Value = r.body_mut().read_json().map_err(|e| format!("Notion : {e}"))?;
    Ok(v["results"].as_array().cloned().unwrap_or_default())
}

/// Plain text of a title / rich_text property, or the name of a select / status.
fn text(page: &Value, prop: &str) -> String {
    let p = &page["properties"][prop];
    if let Some(parts) = p["title"].as_array().or(p["rich_text"].as_array()) {
        return parts.iter().filter_map(|t| t["plain_text"].as_str()).collect();
    }
    p["select"]["name"].as_str().or(p["status"]["name"].as_str()).unwrap_or_default().to_string()
}

/// Accepts only YYYY-MM-DD (dates come from the frontend).
fn check_date(d: &str) -> Result<&str, String> {
    let ok = d.len() == 10 && d.bytes().enumerate().all(|(i, b)| if i == 4 || i == 7 { b == b'-' } else { b.is_ascii_digit() });
    ok.then_some(d).ok_or_else(|| format!("date invalide : {d}"))
}

/// `today` and `since` are local dates from the frontend, which knows the user's timezone.
pub fn fetch(cfg: &NotionCfg, today: &str, since: &str) -> Result<Notion, String> {
    let (today, since) = (check_date(today)?, check_date(since)?);
    let token = secrets::get("notion_token")?;
    let t = &cfg.tasks;

    let pages = query(&token, &t.database, json!({
        "filter": { "and": [
            { "property": t.date, "date": { "equals": today } },
            { "property": t.subject, "select": { "does_not_equal": t.exam_value } },
        ]},
    }))?;
    let mut tasks: Vec<Task> = pages
        .iter()
        .map(|p| Task { title: text(p, &t.title), subject: text(p, &t.subject), done: text(p, &t.status) == t.done_value })
        .collect();
    tasks.sort_by_key(|x| x.done); // done tasks last

    let exam = query(&token, &t.database, json!({
        "filter": { "and": [
            { "property": t.subject, "select": { "equals": t.exam_value } },
            { "property": t.date, "date": { "on_or_after": today } },
            { "property": t.status, "status": { "does_not_equal": t.done_value } },
        ]},
        "sorts": [{ "property": t.date, "direction": "ascending" }],
        "page_size": 1,
    }))?
    .first()
    .map(|p| Exam {
        title: text(p, &t.title),
        date: p["properties"][&t.date]["date"]["start"].as_str().unwrap_or_default().to_string(),
    });

    let health = match &cfg.health {
        None => None,
        Some(h) => {
            let pages = query(&token, &h.database, json!({
                "filter": { "and": [
                    { "property": h.filter_property, "select": { "equals": h.filter_value } },
                    { "property": h.date, "date": { "on_or_after": since } },
                ]},
                "page_size": 100,
            }))?;
            let scores: Vec<f64> = pages
                .iter()
                .filter_map(|p| {
                    let f = &p["properties"][&h.score]["formula"];
                    f["number"].as_f64().or(p["properties"][&h.score]["number"].as_f64())
                })
                .collect();
            (!scores.is_empty()).then(|| Health {
                score: (scores.iter().sum::<f64>() / scores.len() as f64).round() as u32,
                days: scores.len(),
            })
        }
    };

    Ok(Notion { tasks, exam, health })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_title_select_status() {
        let p = json!({ "properties": {
            "T": { "title": [{ "plain_text": "TD " }, { "plain_text": "4" }] },
            "S": { "select": { "name": "NRP" } },
            "St": { "status": { "name": "Terminé" } },
        }});
        assert_eq!(text(&p, "T"), "TD 4");
        assert_eq!(text(&p, "S"), "NRP");
        assert_eq!(text(&p, "St"), "Terminé");
        assert_eq!(text(&p, "missing"), "");
    }

    #[test]
    fn date_check() {
        assert!(check_date("2026-11-15").is_ok());
        assert!(check_date("2026-11-1").is_err());
        assert!(check_date("2026/11/15").is_err());
    }
}
