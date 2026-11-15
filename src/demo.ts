// Demo data (from docs/maquette.html). Used until each card gets its real source, and for screenshots.
export const demo = {
  notion: {
    tasks: [
      { title: "TD 4 — Couche transport", subject: "Réseaux", done: false },
      { title: "Exercices transformée de Fourier", subject: "Signaux", done: false },
      { title: "Lire le chapitre 3", subject: "Anglais", done: true },
    ],
    ds: { subject: "Électronique", when: "Jeudi 19 nov · J-4" },
    health: { score: 78, label: "Bonne forme" },
  },
  commands: [
    { label: "Trier le vault", subtitle: "Claude · Obsidian", enabled: true },
    { label: "gdsync", subtitle: "Synchro Google Drive", enabled: true },
    { label: "Sauvegarde Lexar", subtitle: "Clé détectée · rsync du vault", enabled: true, indicator: true },
  ],
  apps: ["Firefox", "Claude", "Notion", "FNote", "Esound", "Obsidian", "VS Code", "WezTerm", "GitHub Desktop"]
    .map((name) => ({ name, icon: null as string | null, found: true })),
  weather: { temp: 9, desc: "Éclaircies", min: 5, max: 12, rain: 10, place: "Campus de la Doua" },
  trams: {
    stop: "INSA-Einstein",
    departures: [
      { line: "T1", dest: "Debourg", next: "3 min", after: "11 min" },
      { line: "T1", dest: "IUT Feyssine", next: "6 min", after: "14 min" },
      { line: "T4", dest: "Hôpital Feyzin Vénissieux", next: "2 min", after: "9 min" },
      { line: "T4", dest: "La Doua – Gaston Berger", next: "5 min", after: "12 min" },
    ],
  },
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
