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
import { demo } from "./demo";

type Data = typeof demo;
const $ = (id: string) => document.getElementById(id)!;

/** Escape text coming from outside (mails, Notion…) before putting it in HTML. */
const esc = (s: string | number) =>
  String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const ICON = {
  notion: '<path d="M4 4h12l4 4v12H4z"/><path d="M8 9h8M8 13h8M8 17h5"/>',
  term: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M7 9l3 3-3 3M12 15h5"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M3.5 6.5l8.5 6 8.5-6"/>',
  claude: '<path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6L5.6 18.4"/>',
  cloudSun: '<circle cx="9" cy="9" r="3.5"/><path d="M9 2.5v1.2M2.5 9h1.2M4.4 4.4l.9.9M13.6 4.4l-.9.9"/><path d="M8 20h9a4 4 0 0 0 .4-8 5 5 0 0 0-9.6 1.4A3.3 3.3 0 0 0 8 20z"/>',
};
const svg = (paths: string, size = 20, sw = 1.8) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="#8AB4F8" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
const head = (icon: string, title: string, aside = "") =>
  `<div class="head">${svg(icon)}<h2>${esc(title)}</h2>${aside}</div>`;

// ---------- cards ----------

function renderNotion(d: Data["notion"]) {
  const tasks = d.tasks.map((t) => `
    <div class="nx-pill task${t.done ? " done" : ""}">
      <span class="dot${t.done ? " hollow" : ""}"></span>
      <div style="min-width:0"><div class="title">${esc(t.title)}</div><div class="muted">${esc(t.subject)}</div></div>
    </div>`).join("");
  const pct = Math.max(0, Math.min(100, d.health.score));
  $("notion").innerHTML = `
    ${head(ICON.notion, "Notion", `<span class="aside">Aujourd'hui</span>`)}
    <div class="list">${tasks}</div>
    <div class="row2">
      <div class="nx-pill">
        <div class="muted">Prochain DS</div>
        <div class="ds-subject">${esc(d.ds.subject)}</div>
        <div class="ds-when">${esc(d.ds.when)}</div>
      </div>
      <div class="nx-pill health">
        <div class="ring" style="background:conic-gradient(#8AB4F8 0 ${pct}%, rgba(255,255,255,0.10) ${pct}% 100%)"><div>${esc(d.health.score)}</div></div>
        <div><div class="muted">Santé globale</div><div class="health-label">${esc(d.health.label)}</div></div>
      </div>
    </div>`;
}

function renderCommands(d: Data["commands"]) {
  const btns = d.map((c) => `
    <button class="nx-pill nx-btn cmd${c.wide ? " wide" : ""}" type="button"${c.enabled ? "" : " disabled"}>
      <span class="label">${c.indicator === undefined ? "" : `<span class="dot ${c.indicator ? "ok" : "off"}"></span>`}${esc(c.label)}</span>
      <span class="muted">${esc(c.subtitle)}</span>
    </button>`).join("");
  $("commands").innerHTML = `${head(ICON.term, "Commandes WezTerm")}<div class="cmds">${btns}</div>`;
}

function renderClock(c: Data["clock"]) {
  const hours = Array.from({ length: 24 }, (_, i) =>
    `<span class="${i < c.hour ? "past" : i === c.hour ? "now" : ""}"></span>`).join("");
  $("clock").innerHTML = `
    <div class="time"><span>${c.hh}</span><span class="colon">:</span><span>${c.mm}</span><span class="secs">${c.ss}</span></div>
    <div class="date">${esc(c.date)}</div>
    <div class="hours" aria-hidden="true">${hours}</div>
    <div class="scale"><span>0 h</span><span>Semaine ${c.week}</span><span>24 h</span></div>`;
}

function renderApps(d: Data["apps"]) {
  const btns = d.map((a) => `
    <button class="nx-pill nx-btn app" type="button"${a.found ? "" : " disabled"}>
      <span class="app-icon">${a.icon ? `<img src="${esc(a.icon)}" alt="">` : esc(a.name.slice(0, 2))}</span>
      <span class="app-name">${esc(a.name)}</span>
    </button>`).join("");
  $("apps").innerHTML = `<h2>Applications</h2><div class="app-grid">${btns}</div>`;
}

function renderWeather(w: Data["weather"], trams: Data["trams"]) {
  const rows = trams.departures.map((t) => `
    <div class="tram"><span class="line">${esc(t.line)}</span><span class="dest">${esc(t.dest)}</span>
      <span class="next">${esc(t.next)}</span><span class="after">${esc(t.after)}</span></div>`).join("");
  $("weather").innerHTML = `
    <div class="wx">${svg(ICON.cloudSun, 46, 1.6)}
      <div><div class="wx-temp">${esc(w.temp)}°</div><div class="wx-desc">${esc(w.desc)} · ${esc(w.min)}° / ${esc(w.max)}°</div></div>
      <div class="wx-side">${esc(w.place)}<br>Pluie ${esc(w.rain)} %</div>
    </div>
    <div class="sep"></div>
    <div class="muted">Tram · arrêt ${esc(trams.stop)}</div>
    <div class="trams">${rows}</div>`;
}

let activeBox = 1;
function renderMails(d: Data["mails"]) {
  const tabs = d.map((b, i) => `
    <button class="nx-btn tab" type="button" role="tab" aria-selected="${i === activeBox}" data-box="${i}">
      ${esc(b.name)}<span class="count">${b.items.length}</span></button>`).join("");
  const box = d[activeBox];
  const urgent = box.items.filter((m) => m.urgent).length;
  const items = box.items.map((m) => `
    <div class="nx-pill mail"><span class="dot${m.urgent ? " urgent" : ""}"></span>
      <div class="mail-body"><div class="from">${esc(m.from)}</div><div class="subject">${esc(m.subject)}</div></div></div>`).join("");
  $("mails").innerHTML = `
    ${head(ICON.mail, "Mails", `<div class="tabs" role="tablist" aria-label="Boîtes mail">${tabs}</div>`)}
    <div class="mail-list">
      <div class="counters"><span class="box">${esc(box.label)}</span>
        <span class="badge urgent">${urgent} urgent</span><span class="badge">${box.items.length - urgent} à traiter</span></div>
      ${items}
    </div>
    <div class="legend"><span><span class="dot urgent"></span>Urgent</span><span><span class="dot"></span>À traiter</span></div>`;
  $("mails").querySelectorAll<HTMLElement>(".tab").forEach((t) =>
    t.addEventListener("click", () => { activeBox = Number(t.dataset.box); renderMails(d); }));
}

function renderClaude(d: Data["claude"]) {
  const meter = (label: string, m: { pct: number; reset: string }) => `
    <div>
      <div class="meter-head"><span>${label}</span><b>${m.pct} %</b></div>
      <div class="bar"><div style="width:${Math.min(100, m.pct)}%"></div></div>
      <div class="reset">${esc(m.reset)}</div>
    </div>`;
  $("claude").innerHTML = `${head(ICON.claude, "Utilisation Claude")}${meter("Session (5 h)", d.session)}${meter("Semaine", d.week)}`;
}

function render(d: Data) {
  renderNotion(d.notion);
  renderCommands(d.commands);
  renderClock(d.clock);
  renderApps(d.apps);
  renderWeather(d.weather, d.trams);
  renderMails(d.mails);
  renderClaude(d.claude);
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

const open = () => { closing = false; play("normal"); };
async function close() {
  if (closing) return;
  closing = true;
  await play("reverse");
  if (closing) await invoke("hide"); // an `open` during the animation cancels the hide
}

// ---------- boot ----------

async function boot() {
  render(demo);
  const a = await invoke<{ wallpaper: string | null; logo: string | null }>("appearance");
  if (a.wallpaper) $("wallpaper").style.backgroundImage = `url("${convertFileSrc(a.wallpaper)}")`;
  if (a.logo) { const img = $("logo") as HTMLImageElement; img.src = convertFileSrc(a.logo); img.hidden = false; }

  await listen("nx-open", open);
  await listen("nx-close", close);
  addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
  // Launched with --toggle as first instance: the window is already visible before listeners exist.
  if (await getCurrentWindow().isVisible()) open();
}
boot();
