import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-500.css";
import "@fontsource/inter/latin-600.css";
import "@fontsource/inter/latin-700.css";
import "@fontsource/space-grotesk/latin-500.css";
import "@fontsource/space-grotesk/latin-600.css";
import "@fontsource/space-grotesk/latin-700.css";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { esc, examWhen, healthLabel, isoWeek, pad, tramRows, wmo, resetText, type Dep } from "./format";
import { ICON, svg, WX_ICON } from "./icons";

const $ = (id: string) => document.getElementById(id)!;


const head = (icon: string, title: string, aside = "") =>
  `<div class="head">${svg(icon)}<h2>${esc(title)}</h2>${aside}</div>`;

// ---------- cards ----------

// Last good values survive restarts (shown instantly on open, then refreshed).
const cache = {
  get<T>(k: string): T | undefined {
    try { return JSON.parse(localStorage.getItem(k) ?? "null") ?? undefined; } catch { return undefined; }
  },
  set(k: string, v: unknown) {
    try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable: memory only */ }
  },
};
/** undefined = not loaded yet, null = disabled in config, string = error message. */
type Slot<T> = T | null | undefined | string;

type NotionData = {
  tasks: { title: string; subject: string; done: boolean }[];
  exam: { title: string; date: string } | null;
  health: { score: number; days: number } | null;
};


function renderNotion(d: Slot<NotionData>) {
  const card = $("notion");
  card.hidden = d === null;
  if (!d || typeof d === "string") {
    card.innerHTML = `${head(ICON.notion, "Notion")}<div class="error">${d ? "Notion indisponible" : "Chargement…"}</div>`;
    return;
  }
  const tasks = d.tasks.map((t) => `
    <div class="nx-pill task${t.done ? " done" : ""}">
      <span class="dot${t.done ? " hollow" : ""}"></span>
      <div style="min-width:0"><div class="title">${esc(t.title)}</div><div class="muted">${esc(t.subject)}</div></div>
    </div>`).join("") || `<div class="error">Aucun devoir aujourd'hui</div>`;
  const exam = d.exam
    ? `<div class="ds-subject">${esc(d.exam.title)}</div><div class="ds-when">${esc(examWhen(d.exam.date))}</div>`
    : `<div class="ds-subject">Aucun DS prévu</div>`;
  const h = d.health;
  const pct = h ? Math.max(0, Math.min(100, h.score)) : 0;
  const health = h ? `
      <div class="nx-pill health">
        <div class="ring" style="background:conic-gradient(#8AB4F8 0 ${pct}%, rgba(255,255,255,0.10) ${pct}% 100%)"><div>${h.score}</div></div>
        <div><div class="muted">Santé globale</div><div class="health-label">${healthLabel(h.score)}</div></div>
      </div>` : "";
  card.innerHTML = `
    ${head(ICON.notion, "Notion", `<span class="aside">Aujourd'hui</span>`)}
    <div class="list">${tasks}</div>
    <div class="row2"><div class="nx-pill"><div class="muted">Prochain DS</div>${exam}</div>${health}</div>`;
}

let notion: Slot<NotionData> = cache.get<NotionData>("nx-notion");
const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
async function refreshNotion() {
  const now = new Date();
  try {
    notion = await invoke<NotionData | null>("notion", {
      today: isoDate(now),
      since: isoDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7)),
    });
    if (notion) cache.set("nx-notion", notion);
  } catch (e) {
    console.error(e);
    if (!notion || typeof notion === "string") notion = String(e);
  }
  renderNotion(notion);
}

type Cmd = { label: string; subtitle: string; enabled: boolean; indicator?: boolean | null };
function renderCommands(d: Cmd[]) {
  // An odd last button spans both columns, like "Sauvegarde Lexar" in the mockup.
  const btns = d.map((c, i) => `
    <button class="nx-pill nx-btn cmd${d.length % 2 && i === d.length - 1 ? " wide" : ""}" type="button" data-i="${i}"${c.enabled ? "" : " disabled"}>
      <span class="label">${c.indicator == null ? "" : `<span class="dot ${c.indicator ? "ok" : "off"}"></span>`}${esc(c.label)}</span>
      <span class="muted">${esc(c.subtitle)}</span>
    </button>`).join("");
  $("commands").innerHTML = `${head(ICON.term, "Commandes WezTerm")}<div class="cmds">${btns}</div>`;
}

// Clock: DOM built once, then only text/classes change each second (keeps the colon fade smooth).
function renderClock() {
  $("clock").innerHTML = `
    <div class="time"><span id="hh"></span><span class="colon" id="colon">:</span><span id="mm"></span><span class="secs" id="ss"></span></div>
    <div class="date" id="date"></div>
    <div class="hours" id="hours" aria-hidden="true">${"<span></span>".repeat(24)}</div>
    <div class="scale"><span>0 h</span><span id="week"></span><span>24 h</span></div>`;
}


const DATE_FR = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" });
function tick() {
  const n = new Date();
  $("hh").textContent = pad(n.getHours());
  $("mm").textContent = pad(n.getMinutes());
  $("ss").textContent = pad(n.getSeconds());
  $("colon").classList.toggle("off", n.getSeconds() % 2 === 1);
  $("date").textContent = DATE_FR.format(n);
  $("week").textContent = `Semaine ${isoWeek(n)}`;
  [...$("hours").children].forEach((el, i) =>
    (el.className = i < n.getHours() ? "past" : i === n.getHours() ? "now" : ""));
}

// Runs only while the window is visible: nothing ticks in the background.
let clockTimer = 0;
function startClock() {
  stopClock();
  tick();
  clockTimer = setInterval(tick, 1000);
}
const stopClock = () => clearInterval(clockTimer);

type App = { name: string; icon: string | null; found: boolean };
function renderApps(d: App[]) {
  const btns = d.map((a, i) => `
    <button class="nx-pill nx-btn app" type="button" data-i="${i}"${a.found ? "" : " disabled"}>
      <span class="app-icon">${a.icon ? `<img src="${esc(convertFileSrc(a.icon))}" alt="">` : esc(a.name.slice(0, 2))}</span>
      <span class="app-name">${esc(a.name)}</span>
    </button>`).join("");
  $("apps").innerHTML = `<h2>Applications</h2><div class="app-grid">${btns}</div>`;
}

// ---------- weather + departures ----------

type Weather = { temp: number; code: number; is_day: boolean; min: number; max: number; rain: number | null; place: string };
type Board = { stop: string; departures: Dep[] };


function renderWeather(w: Slot<Weather>, b: Slot<Board>) {
  const card = $("weather");
  card.hidden = w === null && b === null;
  let top = "";
  if (typeof w === "string") top = `<div class="error">Météo indisponible</div>`;
  else if (w) {
    const [desc, icon] = wmo(w.code, w.is_day);
    top = `<div class="wx">${svg(WX_ICON[icon], 46, 1.6)}
      <div><div class="wx-temp">${Math.round(w.temp)}°</div><div class="wx-desc">${desc} · ${Math.round(w.min)}° / ${Math.round(w.max)}°</div></div>
      <div class="wx-side">${esc(w.place)}${w.rain == null ? "" : `<br>Pluie ${w.rain} %`}</div></div>`;
  }
  let bottom = "";
  if (typeof b === "string") bottom = `<div class="error">Passages indisponibles</div>`;
  else if (b) {
    const rows = tramRows(b.departures).map((t) => `
      <div class="tram"><span class="line">${esc(t.line)}</span><span class="dest">${esc(t.dest)}</span>
        <span class="next">${esc(t.next)}</span><span class="after">${esc(t.after)}</span></div>`).join("");
    bottom = `<div class="muted">Tram · arrêt ${esc(b.stop)}</div>
      <div class="trams">${rows || `<div class="error">Aucun passage prévu</div>`}</div>`;
  }
  card.innerHTML = top + (top && bottom ? `<div class="sep"></div>` : "") + bottom;
}

let wx: Slot<Weather> = cache.get<Weather>("nx-weather");
let board: Slot<Board> = cache.get<Board>("nx-board");
let wxAt = 0;

async function refreshWeather() {
  try {
    wx = await invoke<Weather | null>("weather");
    wxAt = Date.now();
    if (wx) cache.set("nx-weather", wx);
  } catch (e) {
    console.error(e);
    if (!wx || typeof wx === "string") wx = String(e); // keep showing the last good value
  }
  renderWeather(wx, board);
}
async function refreshBoard() {
  try {
    board = await invoke<Board | null>("departures");
    if (board) cache.set("nx-board", board);
  } catch (e) {
    console.error(e);
    board = String(e); // stale departures would be misleading
  }
  renderWeather(wx, board);
}

type Mailbox = { name: string; label: string; messages: { from: string; subject: string; urgent: boolean; url: string }[] | null };
let mailboxes: Mailbox[] | undefined; // memory only: mail subjects are not written to disk
let activeBox = -1; // -1 = not chosen yet: open the first box that has urgent mail

function renderMails(d: Mailbox[] | undefined | string) {
  const card = $("mails");
  card.hidden = Array.isArray(d) && d.length === 0;
  if (!Array.isArray(d)) {
    card.innerHTML = `${head(ICON.mail, "Mails")}<div class="error">${d ? "Mails indisponibles" : "Chargement…"}</div>`;
    return;
  }
  if (activeBox < 0 || activeBox >= d.length) activeBox = Math.max(0, d.findIndex((b) => b.messages?.some((m) => m.urgent)));
  const tabs = d.map((b, i) => `
    <button class="nx-btn tab" type="button" role="tab" aria-selected="${i === activeBox}" data-box="${i}">
      ${esc(b.name)}<span class="count">${b.messages?.length ?? "!"}</span></button>`).join("");
  const box = d[activeBox];
  let body: string;
  if (!box.messages) body = `<div class="error">Boîte indisponible</div>`;
  else {
    const urgent = box.messages.filter((m) => m.urgent).length;
    const items = box.messages.map((m, i) => `
      <button class="nx-pill nx-btn mail" type="button" data-mail="${i}"${m.url ? "" : " disabled"}><span class="dot${m.urgent ? " urgent" : ""}"></span>
        <div class="mail-body"><div class="from">${esc(m.from)}</div><div class="subject">${esc(m.subject || "(sans objet)")}</div></div></button>`).join("");
    body = `<div class="counters"><span class="box">${esc(box.label)}</span>
        <span class="badge urgent">${urgent} urgent</span><span class="badge">${box.messages.length - urgent} à traiter</span></div>
      ${items || `<div class="error">Rien à traiter</div>`}`;
  }
  card.innerHTML = `
    ${head(ICON.mail, "Mails", `<div class="tabs" role="tablist" aria-label="Boîtes mail">${tabs}</div>`)}
    <div class="mail-list">${body}</div>
    <div class="legend"><span><span class="dot urgent"></span>Urgent</span><span><span class="dot"></span>À traiter</span></div>`;
}

$("mails").addEventListener("click", async (e) => {
  const el = e.target as HTMLElement;
  const tab = el.closest<HTMLElement>("[data-box]");
  if (tab) { activeBox = Number(tab.dataset.box); renderMails(mailboxes); return; }
  const m = el.closest<HTMLElement>("[data-mail]");
  const url = m && mailboxes?.[activeBox]?.messages?.[Number(m.dataset.mail)]?.url;
  if (!url) return;
  try { await invoke("open_url", { url }); close(); } catch (err) { console.error(err); }
});

async function refreshMails() {
  try {
    mailboxes = await invoke<Mailbox[]>("mails");
    renderMails(mailboxes);
  } catch (e) {
    console.error(e);
    if (!mailboxes) renderMails(String(e));
  }
}

type Usage = { session: { pct: number; resets_at: string | null }; week: { pct: number; resets_at: string | null } };
let usage: Slot<Usage> = cache.get<Usage>("nx-claude");


function renderClaude(d: Slot<Usage>) {
  const card = $("claude");
  card.hidden = d === null;
  if (!d || typeof d === "string") {
    card.innerHTML = `${head(ICON.claude, "Utilisation Claude")}<div class="error">${d ? "Indisponible" : "Chargement…"}</div>`;
    return;
  }
  const meter = (label: string, m: Usage["session"]) => `
    <div>
      <div class="meter-head"><span>${label}</span><b>${Math.round(m.pct)} %</b></div>
      <div class="bar"><div style="width:${Math.min(100, Math.max(0, m.pct))}%"></div></div>
      <div class="reset">${esc(resetText(m.resets_at))}</div>
    </div>`;
  card.innerHTML = `${head(ICON.claude, "Utilisation Claude")}${meter("Session (5 h)", d.session)}${meter("Semaine", d.week)}`;
}

async function refreshClaude() {
  try {
    usage = await invoke<Usage | null>("claude_usage");
    if (usage) cache.set("nx-claude", usage);
  } catch (e) {
    console.error(e);
    usage = String(e); // an old percentage would be misleading
  }
  renderClaude(usage);
}

/** First paint: cached values where we have them, "loading" elsewhere. */
function render() {
  renderNotion(notion);
  renderCommands([]);
  renderClock();
  renderApps([]);
  renderWeather(wx, board);
  renderMails(mailboxes);
  renderClaude(usage);
}
// ---------- open / close animation ----------

const EASE = "cubic-bezier(.16,1,.3,1)";
const FROM: Record<string, string> = {
  left: "translateX(-120vw) scale(.96)",
  right: "translateX(120vw) scale(.96)",
  top: "translateY(-110vh)",
  bottom: "translateY(110vh)",
};
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
let closing = false;

function play(direction: "normal" | "reverse") {
  const k = reduced ? 0 : 1;
  const slides = [...document.querySelectorAll<HTMLElement>("[data-from]")].map((el) =>
    el.animate([{ transform: FROM[el.dataset.from!], opacity: 0 }, { transform: "none", opacity: 1 }],
      { duration: 800 * k, delay: Number(el.dataset.delay) * 1000 * k, easing: EASE, fill: "both", direction }));
  const fades = [...document.querySelectorAll<HTMLElement>("[data-fade]")].map((el) =>
    el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 500 * k, easing: "ease", fill: "both", direction }));
  return Promise.all([...slides, ...fades].map((a) => a.finished));
}

const refreshCommands = () => invoke<Cmd[]>("command_states").then(renderCommands, console.error);

// Periodic refreshes, only while visible.
let timers: number[] = [];
const WEATHER_EVERY = 30 * 60_000;
const BOARD_EVERY = 30_000;
const NOTION_EVERY = 5 * 60_000;
const MAIL_EVERY = 2 * 60_000;
const CLAUDE_EVERY = 5 * 60_000;

/** Wallpaper and logo, re-read on every open so a wallpaper change shows up without a restart. */
async function applyAppearance() {
  const a = await invoke<{ wallpaper: string | null; logo: string | null }>("appearance");
  $("wallpaper").style.backgroundImage = a.wallpaper ? `url("${convertFileSrc(a.wallpaper)}")` : "";
  const img = $("logo") as HTMLImageElement;
  if (a.logo) img.src = convertFileSrc(a.logo);
  img.hidden = !a.logo;
}

function open() {
  closing = false;
  applyAppearance().catch(console.error);
  startClock();
  refreshCommands();
  renderWeather(wx, board);
  if (Date.now() - wxAt > WEATHER_EVERY) refreshWeather();
  refreshBoard();
  refreshNotion();
  refreshMails();
  refreshClaude();
  timers.forEach(clearInterval);
  timers = [setInterval(refreshWeather, WEATHER_EVERY), setInterval(refreshBoard, BOARD_EVERY), setInterval(refreshNotion, NOTION_EVERY), setInterval(refreshMails, MAIL_EVERY), setInterval(refreshClaude, CLAUDE_EVERY)];
  play("normal");
}
// ---------- pairing (`nexus --pair`) ----------
let pairTimer = 0;
let pairRun = 0; // only the latest `nexus --pair` drives the panel
function endPair() {
  clearInterval(pairTimer);
  $("pair").hidden = true;
  $("pair-qr").innerHTML = ""; // the code is useless after 60 s, but don't keep it around
}
async function startPair() {
  const run = ++pairRun;
  endPair();
  $("pair").hidden = false;
  $("pair-msg").textContent = "Demande d'un code au relais…";
  try {
    const p = await invoke<{ svg: string; expires_in: number }>("pair");
    if (run !== pairRun) return;
    $("pair-qr").innerHTML = p.svg; // SVG built by the backend's QR encoder, no outside markup
    let left = p.expires_in;
    const tick = () => {
      if (left <= 0) return endPair();
      $("pair-msg").textContent = `Scanne ce code avec NEXUS sur ton téléphone · ${left--} s`;
    };
    tick();
    pairTimer = window.setInterval(tick, 1000);
  } catch (err) {
    if (run !== pairRun) return;
    $("pair-msg").textContent = `Appairage impossible : ${err}`;
    pairTimer = window.setTimeout(endPair, 8000);
  }
}

async function close() {
  pairRun++; // a pending pairing request must not reopen the panel
  endPair();
  if (closing) return;
  closing = true;
  await play("reverse");
  if (!closing) return; // an `open` during the animation cancels the hide
  stopClock();
  timers.forEach(clearInterval);
  timers = [];
  await invoke("hide");
}

/** Clicks on [data-i] buttons inside `id` call `cmd` with that index, then close the dashboard. */
function onPick(id: string, cmd: string) {
  $(id).addEventListener("click", async (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-i]");
    if (!b || b.disabled) return;
    try {
      await invoke(cmd, { index: Number(b.dataset.i) });
      close();
    } catch (err) {
      console.error(err);
    }
  });
}

// ---------- boot ----------

async function boot() {
  render();
  if (!("__TAURI_INTERNALS__" in window)) return preview();
  await applyAppearance();

  invoke<App[]>("apps").then(renderApps, console.error); // shortcut: resolved once at start, restart NEXUS after changing [[apps]]
  onPick("apps", "launch_app");
  onPick("commands", "run_command");
  await listen("nx-mounts", refreshCommands);
  await listen("nx-open", open);
  await listen("nx-close", close);
  await listen("nx-pair", startPair);
  // Escape closes the pairing panel first, then the dashboard.
  addEventListener("keydown", (e) => { if (e.key === "Escape") ($("pair").hidden ? close() : endPair()); });
  if (await invoke<boolean>("take_pair_request")) startPair();
  // Launched with --toggle as first instance: the window is already visible before listeners exist.
  if (await getCurrentWindow().isVisible()) open();
}
/** Browser preview (no Tauri): demo data, for development and README screenshots. */
async function preview() {
  const { demo, demoBackground } = await import("./demo");
  $("wallpaper").style.background = demoBackground;
  $("wallpaper").style.filter = "none";
  ({ notion, weather: wx, board, mails: mailboxes, claude: usage } = demo);
  render();
  renderApps(demo.apps);
  renderCommands(demo.commands);
  startClock();
}

boot();
