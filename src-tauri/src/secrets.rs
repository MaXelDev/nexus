// Secrets live in the GNOME keyring with attributes `service nexus key <name>` (see scripts/setup-secrets.sh).
// We call `secret-tool` rather than the `keyring` crate: that crate looks items up by a `username`
// attribute, so it would not find the items the setup script stores. The value only ever lives in memory.
use std::process::Command;

pub fn get(key: &str) -> Result<String, String> {
    let out = Command::new("secret-tool")
        .args(["lookup", "service", "nexus", "key", key])
        .output()
        .map_err(|e| format!("secret-tool : {e}"))?;
    let value = String::from_utf8(out.stdout).unwrap_or_default();
    if !out.status.success() || value.is_empty() {
        // Never include the value (or stdout) in an error message.
        return Err(format!("secret « {key} » absent ou trousseau verrouillé"));
    }
    Ok(value.trim_end_matches('\n').to_string())
}
