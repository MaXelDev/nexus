#!/usr/bin/env bash
# Signed release APK of NEXUS Android → dist/nexus-android-v<version>.apk + its SHA-256.
# The key stays in ~/.config/nexus/android/ (mode 600), its password in the GNOME keyring
# (service nexus key android_keystore_password): passed to Gradle through the environment only.
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/android-env.sh
export NEXUS_KEYSTORE="$HOME/.config/nexus/android/nexus-release.p12"
[ -r "$NEXUS_KEYSTORE" ] || { echo "Clé de signature absente : $NEXUS_KEYSTORE" >&2; exit 1; }
NEXUS_KEYSTORE_PASSWORD="$(secret-tool lookup service nexus key android_keystore_password)" \
  || { echo "Mot de passe de la clé absent du trousseau" >&2; exit 1; }
export NEXUS_KEYSTORE_PASSWORD

version=$(python3 -c 'import json;print(json.load(open("mobile/src-tauri/tauri.conf.json"))["version"])')
(cd mobile && npx tauri android build --apk --target aarch64)
unset NEXUS_KEYSTORE_PASSWORD

apk=mobile/src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release.apk
mkdir -p dist
out="dist/nexus-android-v$version.apk"
cp "$apk" "$out"
"$ANDROID_HOME"/build-tools/*/apksigner verify --print-certs "$out" | grep -E "Signer #1 certificate (DN|SHA-256)"
sha256sum "$out"
