// Creates the GNOME custom shortcut that runs `nexus --toggle`, once, so installing the package is
// enough. Wayland apps can't grab global keys themselves; GNOME Shell runs the command for us.
// Written through GSettings (same store as Settings → Keyboard), so the user can change it there.
use gio::prelude::*;

const MEDIA_KEYS: &str = "org.gnome.settings-daemon.plugins.media-keys";
const CUSTOM: &str = "org.gnome.settings-daemon.plugins.media-keys.custom-keybinding";
const WM: &str = "org.gnome.desktop.wm.keybindings";
const PATH: &str = "/org/gnome/settings-daemon/plugins/media-keys/custom-keybindings/nexus/";

fn strv(s: &gio::Settings, key: &str) -> Vec<String> {
    s.strv(key).iter().map(|x| x.to_string()).collect()
}

fn set_strv(s: &gio::Settings, key: &str, v: &[String]) {
    let refs: Vec<&str> = v.iter().map(String::as_str).collect();
    let _ = s.set_strv(key, refs.as_slice());
}

pub fn ensure(binding: &str) {
    if binding.is_empty() {
        return;
    }
    // Not GNOME (schemas missing): gio::Settings::new would abort, so bail out first.
    let Some(src) = gio::SettingsSchemaSource::default() else { return };
    if [MEDIA_KEYS, CUSTOM, WM].iter().any(|id| src.lookup(id, true).is_none()) {
        return;
    }
    let media = gio::Settings::new(MEDIA_KEYS);
    let mut list = strv(&media, "custom-keybindings");
    if list.iter().any(|p| p == PATH) {
        return; // already created (maybe edited by the user since): leave it alone
    }
    let entry = gio::Settings::with_path(CUSTOM, PATH);
    let _ = entry.set_string("name", "NEXUS");
    let _ = entry.set_string("command", "nexus --toggle");
    let _ = entry.set_string("binding", binding);
    list.push(PATH.into());
    set_strv(&media, "custom-keybindings", &list);

    // GNOME's own bindings win over custom ones, so free the key if a default uses it
    // (Super+Above_Tab = "switch windows of an app", Super+D = "show desktop"). Alt variants stay.
    let wm = gio::Settings::new(WM);
    let shifted = format!("<Shift>{binding}");
    for key in ["switch-group", "switch-group-backward", "show-desktop"] {
        let v = strv(&wm, key);
        let kept: Vec<String> = v.iter().filter(|b| **b != binding && **b != shifted).cloned().collect();
        if kept.len() != v.len() {
            set_strv(&wm, key, &kept);
        }
    }
    gio::Settings::sync();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn creates_the_shortcut_once_and_frees_the_key() {
        // In-memory GSettings: the real desktop settings are never touched.
        std::env::set_var("GSETTINGS_BACKEND", "memory");
        if gio::SettingsSchemaSource::default().and_then(|s| s.lookup(CUSTOM, true)).is_none() {
            return; // no GNOME schemas on this machine
        }
        ensure("<Super>Above_Tab");
        let entry = gio::Settings::with_path(CUSTOM, PATH);
        assert_eq!(entry.string("binding"), "<Super>Above_Tab");
        assert!(strv(&gio::Settings::new(MEDIA_KEYS), "custom-keybindings").contains(&PATH.to_string()));
        let wm = gio::Settings::new(WM);
        assert_eq!(strv(&wm, "switch-group"), ["<Alt>Above_Tab"]);
        assert_eq!(strv(&wm, "switch-group-backward"), ["<Shift><Alt>Above_Tab"]);

        let _ = entry.set_string("binding", "<Super>F12"); // user changed it in Settings
        ensure("<Super>Above_Tab");
        assert_eq!(entry.string("binding"), "<Super>F12");
    }
}
