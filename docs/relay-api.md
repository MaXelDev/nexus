# Contrat d'API — nexus-relay v1

Statut : proposé (2026-11-15). Cloudflare Worker, TypeScript, dossier `relay/`.

```
Téléphone ──Bearer nxd_…──▶ GET  /v1/summary ─┐
                            POST /v1/pair/claim│  nexus-relay ──▶ Notion · Gmail · insa-mail-mcp (binding) · TCL · Open-Meteo
NEXUS PC ──Bearer push──▶   POST /v1/claude-usage   (KV : jetons hachés, codes d'appairage, quota Claude)
         ──Bearer admin─▶   POST /v1/pair      ─┘
```

## Jetons

| Jeton | Détenu par | Stocké côté relais | Droits |
|---|---|---|---|
| appareil `nxd_` + 43 car. base64url (256 bits) | téléphone (Keystore) | KV `dev:<sha256>` → `{name, created_at}` | `GET /v1/summary` uniquement |
| push (256 bits) | NEXUS PC (trousseau GNOME) | secret `PUSH_TOKEN_SHA256` | `POST /v1/claude-usage` uniquement (ne lit rien) |
| admin (256 bits) | NEXUS PC (trousseau GNOME) | secret `ADMIN_TOKEN_SHA256` | `POST /v1/pair` uniquement |

- Les jetons push et admin sont générés sur le PC par `scripts/relay-setup.sh`, rangés dans le trousseau, et seul leur SHA-256 part dans `wrangler secret put` (stdin). Personne ne les voit ni ne les tape.
- Vérification : SHA-256 du jeton présenté, puis `crypto.subtle.timingSafeEqual` (push/admin) ou lecture KV par hash (appareils : la recherche par hash ne révèle rien sur le jeton).
- Refus par défaut : toute route non listée → 404 ; mauvaise méthode → 405 ; jeton absent, invalide ou du mauvais type → 401, toujours la même réponse.
- Révocation : `scripts/relay-revoke.sh <appareil>` (wrangler KV : retrouve la clé par nom, la supprime). Effet au plus 60 s après (cohérence KV).

## Endpoints

### `GET /v1/summary` — appareil
`200` toujours si le jeton est valide ; chaque section est indépendante :
- objet = données ; `null` = non configurée (carte masquée) ; `{"error": "<code>"}` = source en panne (état discret, l'appli garde son cache).

```jsonc
{
  "v": 1,
  "generated_at": "2026-11-15T16:00:00Z",
  "notion": {
    "tasks":  [{ "title": "TD 4 — Couche transport", "subject": "Réseaux", "done": false }],
    "exam":   { "title": "Électronique", "date": "2026-11-19" },      // ou null
    "health": { "score": 78, "days": 6 }                               // ou null
  },
  "weather": { "temp": 9, "code": 2, "is_day": true, "min": 5, "max": 12, "rain": 10, "place": "La Doua" },
  "board": {
    "stop": "INSA-Einstein",
    "departures": [{ "line": "T1", "direction": "Debourg", "at": "2026-11-15 17:03:30" }]  // heure locale, comme le PC
  },
  "mail": { "urgent": 2, "a_traiter": 3, "partial": false },        // partial = une des deux boîtes en panne
  "claude": {
    "session": { "pct": 42, "resets_at": "2026-11-15T19:59:59Z" },
    "week":    { "pct": 63, "resets_at": "2026-11-19T15:00:00Z" },
    "updated_at": "2026-11-15T15:58:00Z"                               // dernier envoi du PC
  },
  "links": {                                                           // cibles des boutons, depuis la config du relais
    "notion": "notion.id", "weather": "https://…",              // page web de prévisions (configurable), pas d'appli
    "mail": "com.google.android.gm",   // Gmail ne sait pas ouvrir un libellé par intent : ouvre l'appli
    "claude": "com.anthropic.claude", "wallet": "com.google.android.apps.walletnfcrel"
  }
}
```
Mêmes formes que les commandes Rust de NEXUS PC (`notion`, `weather`, `departures`, `claude_usage`) : le frontend Android réutilise `src/format.ts` tel quel.

### `POST /v1/claude-usage` — push
Corps (≤ 1 Ko) : `{"session": {"pct": n, "resets_at": s|null}, "week": {…}}`, `pct` dans [0, 1000], dates ISO ou null. Sinon `400`.
→ `204`. Écrit KV `claude` (`updated_at` ajouté par le relais). Le PC n'envoie que si la valeur a changé (quota d'écritures KV).

### `POST /v1/pair` — admin
Corps vide → `201 {"code": "<22 car. base64url, 128 bits>", "expires_in": 60}`.
KV `pair:<sha256(code)>` avec TTL 60 s. Le PC affiche le QR `nexus://pair?relay=<url>&code=<code>`.

### `POST /v1/pair/claim` — sans jeton
Corps : `{"code": "…", "device": "Pixel de Max"}` (nom 1-40 car., lettres, chiffres, espace, `-_'.`).
→ `201 {"token": "nxd_…", "device": "…"}` ; le code est supprimé. Code inconnu, expiré ou déjà utilisé → `401` (pas de distinction). Nom déjà pris → `409`.
Le jeton n'apparaît qu'une fois, dans cette réponse.

## Mails INSA (service binding)
`wrangler.toml` : `[[services]] binding = "INSA_MAIL", service = "insa-mail-mcp", entrypoint = "MailCounts"`. Appel : `await env.INSA_MAIL.counts()` → `{ urgent, a_traiter }`. Aucune autre méthode exposée par cet entrypoint.

## Erreurs
Corps `{"error": "<code>"}` : `bad_request` 400, `unauthorized` 401, `not_found` 404, `method_not_allowed` 405, `conflict` 409, `too_large` 413, `rate_limited` 429 (+ `Retry-After`), `internal` 500. Jamais de détail amont (message Notion, Gmail…) dans la réponse.

## En-têtes
Toutes les réponses : `Content-Type: application/json`, `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`. Aucun en-tête CORS ; `OPTIONS` → 405.

## Limitation de débit (binding Rate Limiting, par clé)
| Route | Clé | Limite |
|---|---|---|
| `/v1/summary` | hash du jeton | 30 / min |
| `/v1/pair/claim` | IP | 5 / min |
| `/v1/pair` | IP | 5 / min |
| `/v1/claude-usage` | IP | 12 / min |

## Cache (mémoire de l'isolat, par section, partagé entre appareils)
| Section | Durée |
|---|---|
| trams | 30 s |
| mails | 2 min |
| Notion | 5 min |
| météo | 15 min |
| Claude | lu dans KV (pas de cache) |

La Cache API ne fait rien sur `*.workers.dev` (seulement sur un domaine perso), et KV est limité à 1 000 écritures/jour : le cache est donc une `Map` en mémoire de l'isolat, au mieux (un isolat froid refait les appels). Une erreur amont n'est pas mise en cache. Ordre de grandeur : 1 téléphone, ~50 ouvertures/jour → < 300 appels amont/jour même sans cache, très en dessous du gratuit (100 000 requêtes Worker/jour). Si tu as un domaine sur Cloudflare, on passe à la Cache API.

## Logs
Uniquement méthode, route, statut, durée, et pour une panne amont `notion: 401`-style (service + statut). Jamais d'en-tête, de corps, de jeton, d'IP, de nom d'appareil, de titre de tâche ni de compteur.

## Configuration (non secrète mais personnelle)
`wrangler.toml` du dépôt reste générique. Arrêts, coordonnées, ids Notion, libellés et dossiers mail, liens Android viennent du secret `NEXUS_CONFIG` (JSON), généré depuis `~/.config/nexus/config.toml` (sections existantes + une section `[android]`) par `scripts/relay-config.sh`.

## Secrets du relais (`wrangler secret put`, saisis par l'utilisateur)
`NOTION_TOKEN` (intégration « NEXUS Mobile », lecture), `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN` (obtenu par script, envoyé directement à wrangler), `GRANDLYON_USER`, `GRANDLYON_PASSWORD` ; plus `PUSH_TOKEN_SHA256`, `ADMIN_TOKEN_SHA256`, `NEXUS_CONFIG` (posés par script).
