// Command buttons: each opens a new WezTerm window running the command in an interactive
// shell (so zsh aliases work), then stays on that shell to show the result.
use crate::config::{expand_home, CommandEntry};
use std::path::Path;
use std::process::Command;

#[derive(serde::Serialize)]
pub struct CommandState {
    label: String,
    subtitle: String,
    enabled: bool,
    /// Some(..) only for commands that depend on a path (e.g. a USB key): drives the green/grey dot.
    indicator: Option<bool>,
}

fn available(c: &CommandEntry) -> bool {
    c.requires_path.as_ref().is_none_or(|p| expand_home(p).exists())
}

pub fn states(entries: &[CommandEntry]) -> Vec<CommandState> {
    entries
        .iter()
        .map(|c| {
            let ok = available(c);
            let subtitle = match (&c.subtitle_unavailable, ok) {
                (Some(s), false) => s.clone(),
                _ => c.subtitle.clone(),
            };
            CommandState { label: c.label.clone(), subtitle, enabled: ok, indicator: c.requires_path.as_ref().map(|_| ok) }
        })
        .collect()
}

pub fn run(c: &CommandEntry) -> Result<(), String> {
    if !available(c) {
        return Err(format!("« {} » indisponible", c.label));
    }
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".into());
    let cwd = expand_home(c.cwd.as_deref().unwrap_or("~"));
    let cwd = if Path::new(&cwd).is_dir() { cwd } else { expand_home("~") };
    // Args are passed as a list, so the command string is never re-split by us; only the
    // user's own shell interprets it, exactly as if typed in a terminal.
    let mut child = Command::new("wezterm")
        .args(["start", "--cwd"])
        .arg(&cwd)
        .args(["--", &shell, "-ic", &format!("{}; exec {shell}", c.command)])
        .spawn()
        .map_err(|e| format!("wezterm : {e}"))?;
    std::thread::spawn(move || child.wait());
    Ok(())
}
