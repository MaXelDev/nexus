# ADR 0001 — Tauri v2 + frontend vanilla TS (Vite)
Statut : accepté (2026-11-15)
- Contexte : dashboard plein écran, caché la plupart du temps, conso minimale, Fedora/Wayland.
- Décision : Tauri v2 (WebKitGTK système, binaire ~10 Mo, pas de Chromium embarqué). Frontend vanilla TypeScript + Vite : une seule page, la maquette est déjà du HTML/CSS, un framework n'apporterait rien.
- Conséquences : dépend de webkit2gtk4.1 ; `backdrop-filter` supporté par WebKitGTK ; pas de flou du bureau réel sous Wayland (voir ADR 0003).
