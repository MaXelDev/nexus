// Pure formatting helpers (no DOM, no Tauri): unit-tested in format.test.ts.

export type WxIcon = "sun" | "moon" | "cloudSun" | "cloud" | "fog" | "rain" | "snow" | "storm";

/** Escape text coming from outside (mails, Notion…) before putting it in HTML. */
export const esc = (s: string | number) =>
  String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export const EXAM_DAY = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "short" });
/** "jeudi 19 nov. · J-4" style countdown, from a Notion date ("YYYY-MM-DD" or full ISO). */
export function examWhen(date: string, now = new Date()) {
  const d = new Date(date.length === 10 ? `${date}T00:00` : date);
  const days = Math.round((new Date(d).setHours(0, 0, 0, 0) - new Date(now).setHours(0, 0, 0, 0)) / 864e5);
  const label = EXAM_DAY.format(d).replace(".", "");
  return `${label[0].toUpperCase()}${label.slice(1)} · ${days === 0 ? "aujourd'hui" : `J-${days}`}`;
}
// Same thresholds as the Notion health dashboard.
export const healthLabel = (s: number) => (s >= 80 ? "Bonne forme" : s >= 60 ? "Correct" : "À surveiller");

/** ISO 8601 week number (weeks start Monday; week 1 contains the first Thursday). */
export function isoWeek(d: Date) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  return Math.ceil(((t.getTime() - Date.UTC(t.getUTCFullYear(), 0, 1)) / 864e5 + 1) / 7);
}

export const pad = (n: number) => String(n).padStart(2, "0");

export type Dep = { line: string; direction: string; at: string };

/** WMO weather code (Open-Meteo) → French label + icon. */
export function wmo(code: number, day: boolean): [string, WxIcon] {
  if (code === 0) return day ? ["Ensoleillé", "sun"] : ["Ciel dégagé", "moon"];
  if (code <= 2) return ["Éclaircies", day ? "cloudSun" : "moon"];
  if (code === 3) return ["Couvert", "cloud"];
  if (code <= 48) return ["Brouillard", "fog"];
  if (code <= 57) return ["Bruine", "rain"];
  if (code <= 67) return ["Pluie", "rain"];
  if (code <= 77) return ["Neige", "snow"];
  if (code <= 82) return ["Averses", "rain"];
  if (code <= 86) return ["Averses de neige", "snow"];
  return ["Orage", "storm"];
}

/** Group departures by line + direction, keep the next two, as "N min" (or "17h35" beyond an hour). */
export function tramRows(deps: Dep[], now = Date.now()) {
  const fmt = (t: number) => {
    const m = Math.floor((t - now) / 60000);
    const d = new Date(t);
    return m < 1 ? "Proche" : m < 60 ? `${m} min` : `${d.getHours()}h${pad(d.getMinutes())}`;
  };
  const groups = new Map<string, number[]>();
  for (const d of deps) {
    const t = new Date(d.at.replace(" ", "T")).getTime(); // local time, as the API gives it
    if (Number.isNaN(t) || t < now - 30_000) continue;
    const k = `${d.line}\u0000${d.direction}`;
    groups.set(k, [...(groups.get(k) ?? []), t]);
  }
  return [...groups]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, ts]) => {
      ts.sort((a, b) => a - b);
      const [line, dest] = k.split("\u0000");
      return { line, dest, next: fmt(ts[0]), after: ts[1] ? fmt(ts[1]) : "" };
    });
}

export const WEEKDAY = new Intl.DateTimeFormat("fr-FR", { weekday: "long" });
/** "Réinitialisation dans 2 h 10" under a day, "Réinitialisation lundi à 15 h" beyond. */
export function resetText(iso: string | null, now = Date.now()) {
  if (!iso) return "";
  const t = new Date(iso);
  const min = Math.max(0, Math.round((t.getTime() - now) / 60000));
  if (min < 60) return `Réinitialisation dans ${min} min`;
  if (min < 24 * 60) return `Réinitialisation dans ${Math.floor(min / 60)} h ${pad(min % 60)}`;
  return `Réinitialisation ${WEEKDAY.format(t)} à ${t.getHours()} h`;
}

/** Age of a piece of data, French: "à l'instant", "il y a 5 min", "il y a 3 h", "il y a 2 j". */
export function ago(iso: string, now = Date.now()) {
  const m = Math.floor((now - Date.parse(iso)) / 60000);
  if (!(m >= 1)) return "à l'instant";
  if (m < 60) return `il y a ${m} min`;
  return m < 1440 ? `il y a ${Math.floor(m / 60)} h` : `il y a ${Math.floor(m / 1440)} j`;
}
