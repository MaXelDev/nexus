# ADR 0004 — Relais Cloudflare pour le mobile
Statut : accepté (2026-11-15)

## Contexte
Le téléphone doit afficher Notion, météo, trams, compteurs de mails et quota Claude sans contenir aucune clé : l'APK doit pouvoir être publié tel quel, et un téléphone perdu ne doit rien exposer d'autre qu'un accès en lecture au résumé, révocable.

## Options
**A. Le téléphone appelle chaque API avec ses propres secrets (Keystore).** Pas de serveur, mais mot de passe INSA, token Notion, OAuth Gmail et Grand Lyon sur le téléphone : refusé par la spec.
**B. Le PC sert de relais (tunnel vers NEXUS PC).** Secrets déjà sur le PC, mais rien quand le PC est éteint, et un port exposé sur le poste.
**C. Cloudflare Worker `nexus-relay` (gratuit), avec ses propres accès.** Toujours joignable, secrets dans Cloudflare (`wrangler secret`), un seul jeton de lecture sur le téléphone.

## Décision
C, comme demandé. Le Worker agrège tout en une réponse `GET /v1/summary` (contrat : `docs/relay-api.md`).
- **Accès** (choix de l'utilisateur, 2026-11-15 : réutiliser ceux du PC, copiés du trousseau par `scripts/relay-setup.sh`) : même token Notion et même compte Grand Lyon que le PC ; même client OAuth Google, mais un **refresh token distinct limité à `gmail.labels`** : non sensible, aucun accès aux messages ni à leurs en-têtes, et `users.labels.get` donne `messagesTotal`/`threadsTotal`. (`gmail.metadata` serait « restreint » et verrait les en-têtes.)
- L'appli Google est déjà « En production » (pas d'expiration des refresh tokens à 7 jours) ; le client OAuth du relais y est ajouté.
- **IMAP INSA** : pas de connexion IMAP dans le relais, ni de mot de passe INSA. Le Worker existant `insa-mail-mcp` expose un point d'entrée RPC séparé `MailCounts` avec une seule méthode `counts()` (IMAP `STATUS … (MESSAGES)` sur `EVE/Urgent` et `EVE/A traiter`). Le relais le lie par service binding avec `entrypoint = "MailCounts"` : il ne voit que cette méthode, jamais le `fetch` MCP (déplacement, drapeaux). Une méthode RPC n'a pas d'URL : elle est injoignable depuis Internet par construction.
- **Quota Claude** : poussé par NEXUS PC (jeton push séparé), stocké en KV ; le relais ne touche jamais au token Claude.
- **Config perso** (ids Notion, arrêts, coordonnées, libellés, liens) hors dépôt : secret `NEXUS_CONFIG` généré depuis `~/.config/nexus/config.toml`.
- Stockage : KV (jetons hachés, codes d'appairage, quota). Cache en mémoire d'isolat (la Cache API est inactive sur `workers.dev`).

## Conséquences
- Plus facile : téléphone sans secret ; perte du téléphone = une commande de révocation.
- Plus difficile : un service en ligne à maintenir ; révoquer le token Notion ou l'accès Google coupe aussi le PC (il faudra régénérer et remettre les deux).
- À revoir : domaine perso (Cache API) si un jour tu en ajoutes un ; le relais vit sur `workers.dev` (URL jamais dans le dépôt ni l'APK, seulement dans le QR).
