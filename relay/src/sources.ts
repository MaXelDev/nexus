// One function per data source. Same output shapes as NEXUS PC's Rust commands, so the phone
// reuses src/format.ts. Each throws a short message (service + HTTP status, never a body).
import type { Config, Env } from "./index.ts";

async function getJson(service: string, url: string, init?: RequestInit): Promise<any> {
  const r = await fetch(url, init);
  if (!r.ok) throw new Error(`${service}: ${r.status}`);
  return r.json();
}

// ---------- weather (Open-Meteo, no key) ----------
export async function weather(c: NonNullable<Config["weather"]>) {
  const v = await getJson("open-meteo",
    `https://api.open-meteo.com/v1/forecast?latitude=${c.latitude}&longitude=${c.longitude}` +
    "&current=temperature_2m,weather_code,is_day&daily=temperature_2m_min,temperature_2m_max," +
    "precipitation_probability_max&timezone=auto&forecast_days=1");
  return {
    temp: v.current.temperature_2m, code: v.current.weather_code, is_day: v.current.is_day === 1,
    min: v.daily.temperature_2m_min[0], max: v.daily.temperature_2m_max[0],
    rain: v.daily.precipitation_probability_max[0] ?? null, place: c.place ?? "",
  };
}

// ---------- departures (Lyon TCL, data.grandlyon.com, Basic auth) ----------
export async function board(c: NonNullable<Config["transport"]>, env: Env) {
  if (c.provider !== "tcl") throw new Error(`transport: provider ${c.provider}`);
  const auth = "Basic " + btoa(`${env.GRANDLYON_USER}:${env.GRANDLYON_PASSWORD}`);
  const departures = [];
  const stops = await Promise.all(c.stop_ids.map((id) => getJson("tcl",
    `https://data.grandlyon.com/fr/datapusher/ws/rdata/tcl_sytral.tclpassagearret/all.json?field=id&value=${id}&maxfeatures=100`,
    { headers: { Authorization: auth } })));
  for (const v of stops) {
    for (const r of v.values ?? []) {
      if (!c.lines?.length || c.lines.includes(r.ligne)) departures.push({ line: r.ligne, direction: r.direction, at: r.heurepassage });
    }
  }
  return { stop: c.stop_name ?? "", departures };
}

// ---------- Notion (tasks due today, next exam, 7-day health average) ----------
async function query(env: Env, db: string, body: unknown): Promise<any[]> {
  const v = await getJson("notion", `https://api.notion.com/v1/databases/${db}/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.NOTION_TOKEN}`, "Notion-Version": "2022-06-28", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return v.results ?? [];
}

export function text(page: any, prop: string): string {
  const p = page?.properties?.[prop] ?? {};
  const parts = p.title ?? p.rich_text;
  if (Array.isArray(parts)) return parts.map((t: any) => t.plain_text ?? "").join("");
  return p.select?.name ?? p.status?.name ?? "";
}

export async function notion(c: NonNullable<Config["notion"]>, env: Env, today: string, since: string) {
  const t = c.tasks;
  const pages = await query(env, t.database, { filter: { and: [
    { property: t.date, date: { equals: today } },
    { property: t.subject, select: { does_not_equal: t.exam_value } },
  ] } });
  const tasks = pages
    .map((p) => ({ title: text(p, t.title), subject: text(p, t.subject), done: text(p, t.status) === t.done_value }))
    .sort((a, b) => Number(a.done) - Number(b.done));

  const [e] = await query(env, t.database, {
    filter: { and: [
      { property: t.subject, select: { equals: t.exam_value } },
      { property: t.date, date: { on_or_after: today } },
      { property: t.status, status: { does_not_equal: t.done_value } },
    ] },
    sorts: [{ property: t.date, direction: "ascending" }],
    page_size: 1,
  });
  const exam = e ? { title: text(e, t.title), date: e.properties[t.date]?.date?.start ?? "" } : null;

  let health = null;
  if (c.health) {
    const h = c.health;
    const rows = await query(env, h.database, { filter: { and: [
      { property: h.filter_property, select: { equals: h.filter_value } },
      { property: h.date, date: { on_or_after: since } },
    ] }, page_size: 100 });
    const scores = rows
      .map((p) => p.properties?.[h.score]?.formula?.number ?? p.properties?.[h.score]?.number)
      .filter((n): n is number => typeof n === "number");
    if (scores.length) health = { score: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length), days: scores.length };
  }
  return { tasks, exam, health };
}

// ---------- mail counts: Gmail labels (scope gmail.labels) + INSA via service binding ----------
let gmailAccess: { token: string; until: number } | null = null;

async function gmailToken(env: Env): Promise<string> {
  if (gmailAccess && gmailAccess.until > Date.now()) return gmailAccess.token;
  const v = await getJson("google-oauth", "https://oauth2.googleapis.com/token", {
    method: "POST",
    body: new URLSearchParams({
      grant_type: "refresh_token", client_id: env.GMAIL_CLIENT_ID,
      client_secret: env.GMAIL_CLIENT_SECRET, refresh_token: env.GMAIL_REFRESH_TOKEN,
    }),
  });
  gmailAccess = { token: v.access_token, until: Date.now() + (v.expires_in - 60) * 1000 };
  return v.access_token;
}

export async function gmailCounts(c: NonNullable<Config["gmail"]>, env: Env) {
  const api = "https://gmail.googleapis.com/gmail/v1/users/me/labels";
  const headers = { Authorization: `Bearer ${await gmailToken(env)}` };
  const { labels = [] } = await getJson("gmail", api, { headers });
  const count = async (name: string) => {
    const l = labels.find((x: any) => x.name === name);
    if (!l) throw new Error("gmail: label not found");
    return (await getJson("gmail", `${api}/${l.id}`, { headers })).messagesTotal as number;
  };
  const [urgent, a_traiter] = await Promise.all([count(c.urgent), count(c.todo)]);
  return { urgent, a_traiter };
}

/** Sum of the configured boxes. One box down = `partial`; all down = error. */
export async function mail(cfg: Config, env: Env) {
  const jobs: Promise<{ urgent: number; a_traiter: number }>[] = [];
  if (cfg.gmail) jobs.push(gmailCounts(cfg.gmail, env));
  if (env.INSA_MAIL) jobs.push(env.INSA_MAIL.counts());
  if (!jobs.length) return null;
  const res = await Promise.allSettled(jobs);
  const ok = res.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
  // Only the service name: an IMAP error text could echo server details.
  res.forEach((r, i) => r.status === "rejected" && console.log(`mail: box ${i} down`));
  if (!ok.length) throw new Error("mail: all boxes down");
  return {
    urgent: ok.reduce((n, x) => n + x.urgent, 0),
    a_traiter: ok.reduce((n, x) => n + x.a_traiter, 0),
    partial: ok.length < res.length,
  };
}
