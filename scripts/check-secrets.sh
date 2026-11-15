#!/usr/bin/env bash
# Check that each NEXUS secret exists and works (one test call per API). Prints only OK / ERREUR / IGNORÉ.
# Secrets never appear in command arguments: they reach curl through stdin or /dev/fd (process substitution).
# Optional env: NEXUS_IMAP_HOST (e.g. imap.example.org), NEXUS_IMAP_PORT (default 993).
set -uo pipefail

get() { secret-tool lookup service nexus key "$1" 2>/dev/null; }
has() { get "$1" >/dev/null; }
fail=0
report() { # report <name> <ok:0|1> [detail]
  if [ "$2" = 0 ]; then echo "OK      $1"; else echo "ERREUR  $1 ${3:-}"; fail=1; fi
}
missing() { for k in "$@"; do has "$k" || { echo "ERREUR  $k absent du trousseau"; fail=1; return 0; }; done; return 1; }

# Notion: GET /v1/users/me
if ! missing notion_token; then
  code=$(get notion_token | sed 's/^/Authorization: Bearer /' | curl -s -o /dev/null -w '%{http_code}' -H @- \
    -H 'Notion-Version: 2022-06-28' https://api.notion.com/v1/users/me)
  [ "$code" = 200 ]; report "Notion" $? "(HTTP $code)"
fi

# Gmail: refresh token -> access token -> GET profile
if ! missing gmail_client_id gmail_client_secret gmail_refresh_token; then
  at=$(curl -s https://oauth2.googleapis.com/token -d grant_type=refresh_token \
    --data-urlencode "client_id@"<(get gmail_client_id) \
    --data-urlencode "client_secret@"<(get gmail_client_secret) \
    --data-urlencode "refresh_token@"<(get gmail_refresh_token) | jq -r '.access_token // empty')
  if [ -z "$at" ]; then report "Gmail" 1 "(échange du refresh token refusé)"; else
    code=$(printf 'Authorization: Bearer %s\n' "$at" | curl -s -o /dev/null -w '%{http_code}' -H @- \
      https://gmail.googleapis.com/gmail/v1/users/me/profile)
    [ "$code" = 200 ]; report "Gmail" $? "(HTTP $code)"
  fi
  unset at
fi

# netrc on /dev/fd so user/password stay out of argv. printf is a bash builtin (not visible in ps).
netrc() { printf 'machine %s login %s password %s\n' "$1" "$(get "$2")" "$(get "$3")"; }

# IMAP: LOGIN + list INBOX
if [ -z "${NEXUS_IMAP_HOST:-}" ]; then echo "IGNORÉ  IMAP (NEXUS_IMAP_HOST non défini)";
elif ! missing zmail_user zmail_password; then
  curl -s -o /dev/null --max-time 15 --netrc-file <(netrc "$NEXUS_IMAP_HOST" zmail_user zmail_password) \
    "imaps://$NEXUS_IMAP_HOST:${NEXUS_IMAP_PORT:-993}/INBOX"
  rc=$?; [ "$rc" = 0 ]; report "IMAP ($NEXUS_IMAP_HOST)" $? "(curl code $rc)"
fi

# Grand Lyon / TCL real-time dataset (HTTP Basic auth)
if ! missing grandlyon_user grandlyon_password; then
  code=$(curl -s -o /dev/null -w '%{http_code}' --netrc-file <(netrc data.grandlyon.com grandlyon_user grandlyon_password) \
    'https://data.grandlyon.com/fr/datapusher/ws/rdata/tcl_sytral.tclpassagearret/all.json?maxfeatures=1')
  [ "$code" = 200 ]; report "Grand Lyon / TCL" $? "(HTTP $code — accès au jeu temps réel demandé ?)"
fi

# Open-Meteo: no key
code=$(curl -s -o /dev/null -w '%{http_code}' 'https://api.open-meteo.com/v1/forecast?latitude=0&longitude=0&current=temperature_2m')
[ "$code" = 200 ]; report "Open-Meteo (sans clé)" $? "(HTTP $code)"

# Claude usage: token written by Claude Code itself, read-only here. Undocumented endpoint.
cred="$HOME/.claude/.credentials.json"
if [ ! -r "$cred" ]; then echo "IGNORÉ  Utilisation Claude ($cred absent)"; else
  code=$(jq -r '"Authorization: Bearer " + .claudeAiOauth.accessToken' "$cred" | curl -s -o /dev/null -w '%{http_code}' -H @- \
    -H 'anthropic-beta: oauth-2025-04-20' https://api.anthropic.com/api/oauth/usage)
  [ "$code" = 200 ]; report "Utilisation Claude" $? "(HTTP $code — relancer Claude Code si le token a expiré)"
fi

exit $fail
