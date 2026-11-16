# Changelog

## [1.2.0] — 2026-11-16

- Optional Android companion app and its Cloudflare relay (`relay/`, `mobile/`, README "Android app"). The phone holds no API key, only a revocable read-only token.
- With a `[relay]` section, NEXUS PC sends the Claude quota to the relay, and `nexus --pair` shows a one-time pairing QR for 60 s.
- Every network call now times out after 15 s.

## [1.1.0] — 2026-11-15

- Installing the `.rpm` is now enough: it starts NEXUS in the open session and at every login, and NEXUS creates its GNOME shortcut (Super + the key above Tab) on first start.
- Works without a config file: stock Fedora apps in the launcher.
- The blurred background follows wallpaper changes without a restart.

## [1.0.0] — 2026-11-15

First release.

- Full-screen glass dashboard for Fedora GNOME (Wayland), hidden at login, toggled with `nexus --toggle` (bind it to a GNOME shortcut such as Super+D).
- Open/close animation; Escape closes; launching an app or command closes the dashboard.
- Cards: clock with 24-hour bar and ISO week, app launcher with theme icons, WezTerm command buttons (path-dependent buttons follow mount events), weather (Open-Meteo), TCL real-time departures (Lyon), Notion tasks / next exam / health score, Gmail and IMAP mail (read-only), Claude plan usage.
- No refresh while hidden; last values cached and shown instantly on open.
- Secrets in the GNOME keyring only (`scripts/setup-secrets.sh`, `scripts/check-secrets.sh`, `scripts/gmail-auth.py`).
- Everything personal lives in `~/.config/nexus/config.toml`; every card is optional.
