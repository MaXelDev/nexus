# ADR 0002 — Secrets dans le trousseau GNOME
Statut : accepté (2026-11-15)
- Décision : Secret Service (trousseau GNOME), attributs `service nexus key <nom>` ; `secret-tool` côté scripts, crate `keyring` côté Rust. Aucun secret dans un fichier ni dans le dépôt.
- Scripts : `scripts/setup-secrets.sh` (saisie masquée), `scripts/gmail-auth.py` (OAuth loopback + PKCE, refresh token stocké directement), `scripts/check-secrets.sh` (OK/ERREUR). Les secrets passent à curl par stdin ou /dev/fd, jamais en argument (visibles dans `ps`).
- Exception : le token Claude est lu (lecture seule) dans `~/.claude/.credentials.json`, géré par Claude Code lui-même.
- Conséquence : si le trousseau est verrouillé, les cartes concernées affichent une erreur.
