#!/usr/bin/env bash
# Puts every nexus-relay secret in place. Nothing is printed, written to disk or passed as an argument.
#  1. NEXUS PC's own relay tokens (push = send the Claude quota, admin = create pairing codes):
#     generated here, kept in the GNOME keyring (relay_push_token, relay_admin_token);
#     only their SHA-256 goes to the relay.
#  2. Copied from the keyring (same accounts as NEXUS PC): NOTION_TOKEN, GRANDLYON_USER, GRANDLYON_PASSWORD.
#  3. Gmail: NEXUS PC's OAuth client, but a new refresh token limited to gmail.labels
#     (scripts/gmail-auth.py --relay): the relay can count mail, never read it.
#  4. Personal settings: scripts/relay-config.py.
# Usage: scripts/relay-setup.sh            # everything
#        scripts/relay-setup.sh tokens|copy|gmail|config   # one part
set -euo pipefail
cd "$(dirname "$0")/.."
W=(npx -y wrangler@4)
part=${1:-all}

put() { # name, value on stdin
  if (cd relay && "${W[@]}" secret put "$1" >/dev/null 2>&1); then echo "$1 : envoyé au relais"; else echo "$1 : ÉCHEC"; return 1; fi
}

if [[ $part == all || $part == tokens ]]; then
  for k in push admin; do
    key=relay_${k}_token
    if ! secret-tool lookup service nexus key "$key" >/dev/null 2>&1; then
      # 256 random bits, base64url, straight into the keyring.
      head -c 32 /dev/urandom | base64 -w0 | tr '+/' '-_' | tr -d '=' |
        secret-tool store --label="nexus $key" service nexus key "$key"
      echo "$key : créé dans le trousseau"
    fi
    secret-tool lookup service nexus key "$key" | tr -d '\n' | sha256sum | cut -d' ' -f1 | tr -d '\n' |
      put "$(tr a-z A-Z <<<"$k")_TOKEN_SHA256"
  done
fi

if [[ $part == all || $part == copy ]]; then
  for key in notion_token grandlyon_user grandlyon_password; do
    if ! secret-tool lookup service nexus key "$key" >/dev/null 2>&1; then
      echo "$key : absent du trousseau, ignoré (carte correspondante masquée)"; continue
    fi
    secret-tool lookup service nexus key "$key" | tr -d '\n' | put "$(tr a-z A-Z <<<"$key")"
  done
fi

if [[ $part == all || $part == gmail ]]; then
  scripts/gmail-auth.py --relay
fi

if [[ $part == all || $part == config ]]; then
  scripts/relay-config.py
fi

echo "Secrets présents sur le relais :"
(cd relay && "${W[@]}" secret list 2>/dev/null | grep -o '"name": *"[A-Z_0-9]*"' | cut -d'"' -f4 | sed 's/^/  /')
