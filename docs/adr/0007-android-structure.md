# ADR 0007 — Structure de l'appli Android (Tauri v2)
Statut : proposé (2026-11-15)

## Contexte
La spec demande Tauri v2 cible Android « dans le même projet », en réutilisant le CSS et les composants du PC. Le backend PC est lié au bureau (GTK, GIO, `secret-tool`, `gtk-launch`, IMAP direct) ; le mobile n'a besoin que d'un appel HTTPS au relais, du Keystore et d'intents.

## Options
**A. Même crate, `#[cfg(target_os = "android")]` partout.** Un seul `tauri.conf.json`, mais gtk/gio/imap/native-tls à exclure de la compilation Android, fenêtre plein écran/transparente/always-on-top sans sens sur mobile, deux frontends dans une même config. Complexité élevée, risque de casser le PC.
**B. Deuxième app Tauri dans le dépôt : `mobile/` (crate + `tauri.conf.json` + `index.html` propres), qui importe le partagé depuis `src/`.** Le PC ne bouge pas ; dépendances mobiles minimales.
**C. Kotlin natif / PWA.** Hors spec (Tauri demandé) ; une PWA ne peut ni utiliser le Keystore ni lancer des intents.

## Décision
B. `mobile/` avec identifiant `io.github.nexus.mobile`, minSdk 26 (Android 8, AES-GCM Keystore stable), testé sur Samsung S22 / Android 16, frontend vanilla TS + Vite comme le PC.
- Partagé, importé depuis `src/` : `format.ts` (tramRows, examWhen, healthLabel, wmo, esc), les polices @fontsource, les jetons de couleur/verre et les icônes au trait (extraits de `docs/maquette-android.html`, identiques au PC).
- Rust mobile : une commande `summary()` (HTTPS via `ureq` + rustls, pas d'OpenSSL à compiler pour Android) qui lit le jeton via le plugin Keystore et appelle le relais. **Le jeton ne passe jamais dans la webview.**
- Petit plugin Kotlin `mobile/plugins/nexus-android` : Keystore (ADR 0006), lancement d'applis/intents, `FLAG_SECURE`.
- QR : plugin officiel `@tauri-apps/plugin-barcode-scanner`.

## Conséquences
- Plus facile : PC intact ; APK léger ; données factices = `src/demo.ts` réutilisé.
- Plus difficile : deux `tauri.conf.json` à faire évoluer ensemble (version, CSP).
- À revoir : si un vrai blocage Tauri Android apparaît (WebView ancienne, plugin), je te l'explique avant tout changement de techno.
