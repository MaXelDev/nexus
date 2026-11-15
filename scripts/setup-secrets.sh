#!/usr/bin/env bash
# Store NEXUS secrets in the GNOME keyring (Secret Service), attributes: service nexus key <name>.
# Usage: scripts/setup-secrets.sh            # asks for every missing secret
#        scripts/setup-secrets.sh notion_token zmail_password   # (re)sets only these
# Input is masked and never echoed, logged or written to disk.
set -euo pipefail

ALL=(notion_token gmail_client_id gmail_client_secret zmail_user zmail_password grandlyon_user grandlyon_password)
# gmail_refresh_token is obtained by scripts/gmail-auth.py, not typed by hand.

command -v secret-tool >/dev/null || { echo "secret-tool introuvable : sudo dnf install libsecret"; exit 1; }

exists() { secret-tool lookup service nexus key "$1" >/dev/null 2>&1; }

if [ $# -gt 0 ]; then keys=("$@"); force=1; else keys=("${ALL[@]}"); force=0; fi

for k in "${keys[@]}"; do
  if [ "$force" = 0 ] && exists "$k"; then echo "$k : déjà présent, ignoré"; continue; fi
  read -rsp "$k (saisie masquée, vide = passer) : " v; echo
  [ -z "$v" ] && { echo "$k : passé"; continue; }
  printf '%s' "$v" | secret-tool store --label="nexus $k" service nexus key "$k"
  unset v
  echo "$k : enregistré"
done
