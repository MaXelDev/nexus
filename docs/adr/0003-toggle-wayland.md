# ADR 0003 — Toggle et flou sous Wayland
Statut : accepté (2026-11-15)
- Contexte : une app Wayland ne peut ni capturer un raccourci global, ni flouter le bureau derrière elle.
- Décision : raccourci personnalisé GNOME (configuré par l'utilisateur) qui lance `nexus --toggle` ; `tauri-plugin-single-instance` relaie l'argument à l'instance déjà lancée. Flou : fond d'écran courant (gsettings `picture-uri-dark`/`picture-uri`) affiché flouté et assombri ; option config pour une vraie transparence (Blur My Shell).
- Conséquences : pas de dépendance à une extension GNOME ; le flou de secours ne montre pas les fenêtres derrière.
