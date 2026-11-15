#!/usr/bin/env bash
# Revoke a paired phone (lost, sold…): its token stops working within ~60 s (KV propagation).
# Usage: scripts/relay-revoke.sh            # list paired devices
#        scripts/relay-revoke.sh "<name>"   # revoke that device
# Needs `npx wrangler login`. Prints device names only, never a token or hash.
set -euo pipefail
cd "$(dirname "$0")/../relay"
kv() { npx -y wrangler@4 kv key "$@" --binding KV --remote 2>/dev/null; }

if [ $# -eq 0 ]; then
  echo "Appareils appairés :"
  kv list --prefix devname: | grep -o '"name": *"devname:[^"]*"' | sed 's/.*"devname:\(.*\)"/  \1/'  || true
  exit
fi

name=$1
hash=$(kv get "devname:$name" || true)
[[ $hash =~ ^[0-9a-f]{64}$ ]] || { echo "Appareil « $name » inconnu (liste : $0)"; exit 1; }
kv delete "dev:$hash" >/dev/null
kv delete "devname:$name" >/dev/null
echo "« $name » révoqué : son jeton est refusé d'ici une minute."
