# ADR 0005 — Appairage du téléphone par QR
Statut : accepté (2026-11-15)

## Contexte
Le téléphone a besoin d'un jeton de lecture, sans qu'aucun jeton ne soit jamais affiché, copié ni tapé. NEXUS PC doit aussi envoyer le quota Claude sans pouvoir lire le résumé.

## Options
**A. Jeton saisi à la main / copié.** Interdit par la spec (jeton affiché).
**B. QR contenant directement le jeton.** Le jeton serait visible à l'écran et dans toute capture.
**C. QR contenant un code à usage unique (128 bits, 60 s) échangé par le téléphone contre son jeton.** Ce qui est affiché ne vaut plus rien après 60 s ou après usage.

## Décision
C.
1. `nexus --pair` : NEXUS PC appelle `POST /v1/pair` avec son **jeton admin** (trousseau GNOME) → code aléatoire 128 bits ; KV `pair:<sha256(code)>`, TTL 60 s.
2. Le PC affiche le QR `nexus://pair?relay=<url>&code=<code>` (l'URL du relais n'est donc jamais dans l'APK).
3. L'appli scanne et appelle `POST /v1/pair/claim {code, device}` → le relais génère `nxd_…` (256 bits), stocke **seulement son SHA-256** en KV `dev:<hash>` avec le nom de l'appareil, supprime le code, renvoie le jeton une seule fois.
4. Révocation : `scripts/relay-revoke.sh <appareil>` (wrangler KV) ; le bouton « oublier ce téléphone » efface aussi le jeton local.

Trois jetons, trois droits : appareil = lire le résumé ; push (PC) = écrire le quota ; admin (PC) = créer un code. Push et admin sont générés sur le PC par script ; seuls leurs SHA-256 partent dans `wrangler secret put`.

## Options écartées sur le détail
- Code court à 6 chiffres : force brute possible en 60 s ; le QR n'a pas besoin d'être tapé, donc 128 bits.
- Durable Object pour un usage unique strict : KV peut, en théorie, laisser un code utilisable deux fois pendant ≤ 60 s sur deux points de présence différents. Risque accepté : code de 128 bits, affiché 60 s sur ton propre écran, et une réclamation crée un appareil nommé visible et révocable.

## Conséquences
- Plus facile : appairer un nouveau téléphone = afficher un QR.
- Plus difficile : le PC détient le jeton admin ; qui contrôle ta session peut appairer un appareil (mais il a déjà tous tes secrets PC).
- Affichage : `nexus --pair` ouvre le dashboard avec un panneau QR et un compte à rebours de 60 s ; le panneau disparaît seul à l'expiration (ou Échap). Rien n'est affiché en dehors d'un appairage.
