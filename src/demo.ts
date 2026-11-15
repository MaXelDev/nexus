// Demo data (from docs/maquette.html). Used until each card gets its real source, and for screenshots.
export const demo = {
  commands: [
    { label: "Trier le vault", subtitle: "Claude · Obsidian", enabled: true },
    { label: "gdsync", subtitle: "Synchro Google Drive", enabled: true },
    { label: "Sauvegarde Lexar", subtitle: "Clé détectée · rsync du vault", enabled: true, indicator: true },
  ],
  apps: ["Firefox", "Claude", "Notion", "FNote", "Esound", "Obsidian", "VS Code", "WezTerm", "GitHub Desktop"]
    .map((name) => ({ name, icon: null as string | null, found: true })),
  mails: [
    { name: "Gmail", label: "Boîte Gmail", items: [
      { from: "GitHub", subject: "Your weekly digest", urgent: false },
      { from: "Banque", subject: "Relevé disponible", urgent: true },
    ] },
    { name: "Zmail", label: "Boîte INSA", items: [
      { from: "Scolarité INSA", subject: "Inscription aux examens avant mardi", urgent: true },
      { from: "Dép. Télécom", subject: "Vœux d’échange : dernier délai", urgent: true },
      { from: "Prof. Réseaux", subject: "Support du TP 5", urgent: false },
    ] },
  ],
  claude: {
    session: { pct: 42, reset: "Réinitialisation dans 2 h 10" },
    week: { pct: 63, reset: "Réinitialisation lundi" },
  },
};
