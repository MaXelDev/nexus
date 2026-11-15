# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

NEXUS : dashboard plein écran Tauri v2 pour Fedora 44 (GNOME, Wayland). Spec complète : `PROMPT-NEXUS.md` (source de vérité, ne pas la recopier ici). Avancement et décisions : `docs/PROGRESS.md` — lire en premier après un `/clear`.

## État
Étapes 1-8 faites. v0.1.0 prête, LICENSE au nom de MaXel, auteurs des commits réécrits en noreply GitHub (sauvegarde ~/nexus-backup-2026-11-15.bundle). En attente : purge de docs/PROGRESS.md de l’historique, tag, puis `gh repo create` seulement sur demande.
Installé chez l'utilisateur sans sudo : `~/.local/bin/nexus` + `~/.config/autostart/nexus.desktop` (le .rpm est dans src-tauri/target/release/bundle/rpm/).
Attention : dans le zsh de l'utilisateur, `install` est un alias de `sudo dnf install` (utiliser cp). (`src/demo.ts`).

## Stack
- Backend Rust (Tauri v2, `tauri-plugin-single-instance`, secrets via `secret-tool` (src-tauri/src/secrets.rs)).
- Frontend vanilla TypeScript + Vite (`src/main.ts` : une fonction render par carte) ; référence visuelle : `docs/maquette.html` (couleurs, rayons, flous, animations ; données = exemples).
- Polices Inter + Space Grotesk embarquées (aucun chargement réseau).

## Arborescence
- `src-tauri/` : backend Rust (un module par service : notion, gmail, imap, weather, transport, claude_usage, launcher, commands).
- `src/` : frontend.
- `scripts/setup-secrets.sh`, `scripts/check-secrets.sh` : saisie masquée / vérification OK-ERREUR des secrets.
- `config.example.toml` : config générique commentée ; la vraie config est dans `~/.config/nexus/config.toml`.
- `docs/` : maquette, PROGRESS.md, ADR.

## Économie de tokens (graphify)
- Avant de lire du code pour trouver où/comment : `graphify query "<question>"` (graphe AST du code dans `graphify-out/`, ignoré par git).
- Après chaque étape : `graphify update .` (AST seulement, gratuit). Pas d'extraction sémantique des docs (coûteuse).

## Commandes
Rust est dans `~/.cargo/bin` (ajouter au PATH si besoin).
- Dev : `npm run tauri dev` (fenêtre cachée au départ) puis `src-tauri/target/debug/nexus --toggle` pour afficher/cacher.
- Build : `npm run tauri build` (→ .rpm) ; frontend seul : `npm run build`.
- Tests : `cargo test --manifest-path src-tauri/Cargo.toml` (un test : ajouter son nom ; boîtes mail réelles : `live_mail -- --ignored --nocapture`) et `npm test` (helpers de `src/format.ts`).
- Secrets : `NEXUS_IMAP_HOST=… scripts/check-secrets.sh`.
- Aperçu navigateur avec données de démo (`src/demo.ts`) : `npm run dev` ; capture : `firefox --headless --screenshot out.png --window-size=1920,1080 http://localhost:1420/` (Playwright n'a pas de navigateur).

## Comportement clé
- Lancée cachée à l'ouverture de session ; `nexus --toggle` (raccourci GNOME créé par l'utilisateur lui-même) est relayé à l'instance existante par single-instance.
- Aucun rafraîchissement tant que la fenêtre est cachée ; cache affiché à l'ouverture puis refresh périodique tant que visible.
- Chaque service est optionnel et isolé : une erreur = état d'erreur discret sur sa carte seulement.

## Règles secrets (strictes)
- Tous les secrets dans le trousseau GNOME, attributs `service nexus key <nom>` (`notion_token`, `gmail_client_id`, `gmail_client_secret`, `gmail_refresh_token`, `zmail_user`, `zmail_password`, `grandlyon_user`, `grandlyon_password`).
- Ne jamais afficher, logger, ni écrire un secret dans un fichier du dépôt ; ne jamais demander à l'utilisateur de le coller dans la conversation. Vérifier l'existence avec `secret-tool lookup ... >/dev/null`.
- `.env` éventuel uniquement dans `~/.config/nexus/.env` (chmod 600).

## Conventions
- Open source MIT : rien de personnel en dur (chemins, apps, arrêts, coordonnées, libellés) → tout passe par `config.toml`.
- Commentaires Rust pédagogiques quand ce n'est pas évident (l'utilisateur découvre Rust).
- Commits en anglais, un par étape validée. Jamais de `git push` / `gh repo create` sans demande explicite.
- Accent fixe `#8AB4F8` (ne pas lire l'accent système).
