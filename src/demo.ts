// Demo data for browser preview (`npm run dev` opened outside Tauri) and README screenshots.
// Never real data. Loaded lazily, so it is not part of the app bundle's main chunk.
import { pad } from "./format";

const local = (minutes: number) => {
  const d = new Date(Date.now() + minutes * 60_000);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};
const inDays = (n: number) => {
  const d = new Date(Date.now() + n * 864e5);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const at = (h: number) => new Date(Date.now() + h * 3600_000).toISOString();

export const demo = {
  notion: {
    tasks: [
      { title: "TD 4 — Couche transport", subject: "Réseaux", done: false },
      { title: "Exercices transformée de Fourier", subject: "Signaux", done: false },
      { title: "Lire le chapitre 3", subject: "Anglais", done: true },
    ],
    exam: { title: "Électronique", date: inDays(4) },
    health: { score: 78, days: 6 },
  },
  commands: [
    { label: "Sort notes", subtitle: "Claude · Obsidian", enabled: true },
    { label: "Sync Drive", subtitle: "rclone bisync", enabled: true },
    { label: "USB backup", subtitle: "Key detected · rsync", enabled: true, indicator: true },
  ],
  apps: ["Firefox", "Files", "Notes", "Music", "Calendar", "Obsidian", "VS Code", "Terminal", "Settings"]
    .map((name) => ({ name, icon: null, found: true })),
  weather: { temp: 9, code: 2, is_day: true, min: 5, max: 12, rain: 10, place: "Lyon" },
  board: {
    stop: "INSA-Einstein",
    departures: [
      { line: "T1", direction: "Debourg", at: local(3.5) },
      { line: "T1", direction: "Debourg", at: local(11.5) },
      { line: "T1", direction: "IUT Feyssine", at: local(6.5) },
      { line: "T1", direction: "IUT Feyssine", at: local(14.5) },
      { line: "T4", direction: "Hôpital Feyzin Vénissieux", at: local(2.5) },
      { line: "T4", direction: "Hôpital Feyzin Vénissieux", at: local(9.5) },
      { line: "T4", direction: "La Doua – Gaston Berger", at: local(5.5) },
      { line: "T4", direction: "La Doua – Gaston Berger", at: local(12.5) },
    ],
  },
  mails: [
    { name: "Gmail", label: "Gmail inbox", messages: [
      { from: "GitHub", subject: "Your weekly digest", urgent: false, url: "https://example.org" },
      { from: "Bank", subject: "Statement available", urgent: false, url: "https://example.org" },
    ] },
    { name: "School", label: "School inbox", messages: [
      { from: "Registrar", subject: "Exam registration closes Tuesday", urgent: true, url: "https://example.org" },
      { from: "Telecom dept.", subject: "Exchange wishes: last call", urgent: true, url: "https://example.org" },
      { from: "Networks prof.", subject: "Lab 5 handout", urgent: false, url: "https://example.org" },
    ] },
  ],
  claude: { session: { pct: 42, resets_at: at(2.17) }, week: { pct: 63, resets_at: at(60) } },
};

/** Stand-in for the blurred wallpaper (same gradient as docs/maquette.html). */
export const demoBackground =
  "radial-gradient(circle at 18% 22%, #3a5fa8 0%, transparent 42%), radial-gradient(circle at 82% 30%, #6b3f8f 0%, transparent 40%), radial-gradient(circle at 60% 85%, #1f7a74 0%, transparent 45%), #0b0f1a";
