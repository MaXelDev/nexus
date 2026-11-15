#!/usr/bin/env python3
"""Send the relay its personal (non-secret) settings as the NEXUS_CONFIG secret.

Built from ~/.config/nexus/config.toml, so the repo's relay/wrangler.toml stays generic:
[weather], [transport], [notion] as for NEXUS PC, the Gmail labels of the first
`kind = "gmail"` [[mail]] box, and an optional [android] section (button targets).
Re-run after changing the config. Usage: scripts/relay-config.py [--dry-run]
"""
import json, os, subprocess, sys, tomllib

path = os.path.expanduser("~/.config/nexus/config.toml")
with open(path, "rb") as f:
    cfg = tomllib.load(f)

gmail = next((m for m in cfg.get("mail", []) if m.get("kind") == "gmail"), None)
android = cfg.get("android", {})
out = {
    "tz": android.get("timezone", "Europe/Paris"),
    "weather": cfg.get("weather"),
    "transport": cfg.get("transport"),
    "notion": cfg.get("notion"),
    "gmail": {"urgent": gmail["urgent"], "todo": gmail["todo"]} if gmail else None,
    "links": {
        "notion": android.get("notion", "notion.id"),
        "weather": android.get("weather_url", "https://open-meteo.com/"),
        "mail": android.get("mail", "com.google.android.gm"),
        "claude": android.get("claude", "com.anthropic.claude"),
        "wallet": android.get("wallet", "com.google.android.apps.walletnfcrel"),
    },
}
if out["weather"] and "place" in android:
    out["weather"] = {**out["weather"], "place": android["place"]}

data = json.dumps(out, ensure_ascii=False, separators=(",", ":"))
if "--dry-run" in sys.argv:
    # Shape only: keys and value types, never the values themselves.
    shape = lambda v: {k: shape(x) for k, x in v.items()} if isinstance(v, dict) else type(v).__name__
    print(json.dumps(shape(out), indent=2))
    sys.exit()

relay = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "relay")
r = subprocess.run(["npx", "-y", "wrangler@4", "secret", "put", "NEXUS_CONFIG"], cwd=relay, input=data,
                   text=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
print("NEXUS_CONFIG : " + ("envoyé au relais" if r.returncode == 0 else "ÉCHEC (wrangler login ?)"))
sys.exit(r.returncode)
