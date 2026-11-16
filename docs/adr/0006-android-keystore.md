# ADR 0006 — Jeton du téléphone dans l'Android Keystore
Statut : accepté (2026-11-15)

## Contexte
Le seul secret du téléphone est le jeton `nxd_…`. Il doit être chiffré par une clé matérielle non exportable, ne jamais partir en sauvegarde, et ne jamais être visible (écran, logs, webview).

## Options
**A. `tauri-plugin-keystore` (Impierce).** Dernière version 2.1.0-alpha.2 (2026-09) : alpha, API 28+, suppose une biométrie configurée (déverrouillage à chaque lecture : inutile pour un jeton en lecture seule ouvert 50 fois/jour).
**B. `tauri-plugin-biometry` (Choochmeque).** 0.3.0-rc, centré biométrie aussi.
**C. `tauri-plugin-stronghold`.** Coffre chiffré par mot de passe, pas le Keystore.
**D. Petit plugin Kotlin maison (~80 lignes).** `KeyGenerator` AES-256 dans `AndroidKeyStore`, GCM, `setIsStrongBoxBacked(true)` avec repli TEE si StrongBox absent ; seul `iv + texte chiffré` est écrit dans le stockage privé (`SharedPreferences` en mode privé).

## Décision
D : pas de plugin maintenu qui fasse exactement ça sans biométrie ni statut alpha.
- API du plugin vers Rust uniquement : `save(token)`, `load() -> token?`, `clear()`. Le jeton reste côté Rust, qui fait l'appel HTTPS ; la webview ne reçoit que le JSON du résumé.
- Manifest : `android:allowBackup="false"`, `dataExtractionRules` et `fullBackupContent` qui excluent tout, `usesCleartextTraffic="false"` + network security config sans clair, permissions `INTERNET` et `CAMERA` seulement (les `<queries>` pour lancer Notion/Gmail/Claude/Wallet ne sont pas des permissions).
- `FLAG_SECURE` sur l'écran de réglages ; aucun log du jeton ni des réponses.
- Si la clé Keystore disparaît (réinitialisation des données, changement de verrouillage selon le constructeur), le déchiffrement échoue → l'appli efface le jeton et redemande l'appairage.

Appareil cible : Samsung S22, One UI 8 (Android 16) ; minSdk 26, targetSdk 36. StrongBox utilisé s'il est présent, repli TEE sinon.

## Mise en œuvre (étapes 6 à 8)
- Plugin : `mobile/src-tauri/gen/android/app/src/main/java/io/github/nexus/mobile/NexusPlugin.kt` (`save`, `load`, `clear`, `open`, `secure`), enregistré par `mobile/src-tauri/src/lib.rs`. Aucune capability ne l'accorde à la webview : `invoke("plugin:nexus|load")` depuis la page est refusé (vérifié sur l'appareil).
- Le Keystore chiffre `{relay, token}` en JSON ; `SharedPreferences` ne contient que `iv + texte chiffré` en base64.
- Ouvrir une appli : `getLaunchIntentForPackage` (intent explicite, comme un lanceur) + `<queries>` sur les intents `MAIN/LAUNCHER`. Sans `<queries>`, Android 11+ cache les applis installées par l'utilisateur (Notion, Claude) ; un intent implicite rate les activités sans catégorie `DEFAULT` (Notion). Appli absente → sa page Play Store.
- Permissions finales : `INTERNET`, `CAMERA`, et `ACCESS_NETWORK_STATE` exigée par ML Kit (lecteur de QR). `VIBRATE` (commande du scanner jamais appelée) est retirée du manifeste fusionné. La télémétrie de ML Kit reste : la retirer le faisait planter.
- Release minifiée (R8) : règles `-keep` pour ML Kit dans `proguard-rules.pro`, sinon plantage à la première image de la caméra. La permission caméra est demandée avant le scan (le plugin échoue sinon).
- Network security config : HTTPS seulement et CA système seulement en release ; le build debug autorise le clair pour `tauri android dev`.

## Conséquences
- Plus facile : aucune dépendance alpha ; ouverture instantanée sans biométrie.
- Plus difficile : code Kotlin à maintenir et à tester sur l'appareil réel.
- À revoir : passer à un plugin maintenu s'il en sort un stable sans biométrie obligatoire.
