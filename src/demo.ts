// Demo data (from docs/maquette.html). Used until each card gets its real source, and for screenshots.
export const demo = {
  commands: [
    { label: "Trier le vault", subtitle: "Claude · Obsidian", enabled: true },
    { label: "gdsync", subtitle: "Synchro Google Drive", enabled: true },
    { label: "Sauvegarde Lexar", subtitle: "Clé détectée · rsync du vault", enabled: true, indicator: true },
  ],
  apps: ["Firefox", "Claude", "Notion", "FNote", "Esound", "Obsidian", "VS Code", "WezTerm", "GitHub Desktop"]
    .map((name) => ({ name, icon: null as string | null, found: true })),
  claude: {
    session: { pct: 42, reset: "Réinitialisation dans 2 h 10" },
    week: { pct: 63, reset: "Réinitialisation lundi" },
  },
};
