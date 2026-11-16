// NEXUS Android: one screen, laid out as docs/maquette-android.html. Data = the relay's
// GET /v1/summary (docs/relay-api.md); same shapes as NEXUS PC, so src/format.ts is reused as is.
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-500.css";
import "@fontsource/inter/latin-600.css";
import "@fontsource/inter/latin-700.css";
import "@fontsource/space-grotesk/latin-500.css";
import "@fontsource/space-grotesk/latin-600.css";
import "./style.css";
import { invoke } from "@tauri-apps/api/core";
import { cancel, checkPermissions, Format, requestPermissions, scan } from "@tauri-apps/plugin-barcode-scanner";
import { ago, esc, examWhen, healthLabel, pad, tramRows, wmo, type Dep } from "../../src/format";
import { ICON, svg, WX_ICON } from "../../src/icons";

type Err = { error: string };
type Quota = { pct: number; resets_at: string | null };
type Summary = {
  generated_at: string;
  notion: { tasks: { title: string; subject: string; done: boolean }[]; exam: { title: string; date: string } | null; health: { score: number; days: number } | null } | Err | null;
  weather: { temp: number; code: number; is_day: boolean; min: number; max: number; rain: number | null; place: string } | Err | null;
  board: { stop: string; departures: Dep[] } | Err | null;
  mail: { urgent: number; a_traiter: number; partial: boolean } | Err | null;
  claude: { session: Quota; week: Quota; updated_at: string } | null;
  links: Record<string, string>;
};

const $ = (id: string) => document.getElementById(id)!;
const isErr = (v: unknown): v is Err => !!v && typeof v === "object" && "error" in v;
let data: Summary | null = null;
let failedAt: number | null = null;
let unpaired = false;
let stale: string[] = []; // sections showing their last good value because the source is down

// ---------- render ----------
function renderNotion(n: Summary["notion"]) {
  const card = $("notion");
  card.hidden = n === null;
  const head = `<div class="head">${svg(ICON.notion, 17)}<h2>Notion</h2><span class="aside">Aujourd'hui</span></div>`;
  if (!n || isErr(n)) return void (card.innerHTML = `${head}<div class="error">Notion indisponible</div>`);
  const tasks = n.tasks.length
    ? n.tasks.map((t) => `<div class="nx-pill task${t.done ? " done" : ""}"><span class="dot"></span>
        <div><div class="title">${esc(t.title)}</div><div class="muted">${esc(t.subject)}</div></div></div>`).join("")
    : `<div class="nx-pill task"><div class="muted">Rien de prévu aujourd'hui</div></div>`;
  const exam = n.exam
    ? `<div class="nx-pill exam"><div class="muted">Prochain DS</div><div class="name">${esc(n.exam.title)}</div>
        <div class="when">${esc(shortDay(examWhen(n.exam.date)))}</div></div>`
    : `<div class="nx-pill exam"><div class="muted">Prochain DS</div><div class="name">Aucun</div></div>`;
  const h = n.health && { ...n.health, score: Math.round(Number(n.health.score)) || 0 }; // numbers only in the markup
  const health = h
    ? `<div class="nx-pill health"><div class="ring" style="background:conic-gradient(#8AB4F8 0 ${h.score}%, rgba(255,255,255,0.10) ${h.score}% 100%)">
        <div>${h.score}</div></div><div><div class="muted">Santé</div><div class="label">${healthLabel(h.score)}</div></div></div>`
    : "";
  card.innerHTML = `${head}${tasks}<div class="duo">${exam}${health}</div>`;
}

/** "Jeudi 19 nov · J-4" → "Jeu. 19 nov · J-4" (the phone is narrower than the PC card). */
const shortDay = (s: string) => s.replace(/^(\p{L}{3})\p{L}+/u, "$1.");

function renderWeather(w: Summary["weather"]) {
  const card = $("weather");
  card.hidden = w === null;
  if (!w || isErr(w)) return void (card.innerHTML = `${svg(ICON.cloudSun, 30, 1.6)}<div class="error">Météo indisponible</div>`);
  const [label, icon] = wmo(w.code, w.is_day);
  const rain = w.rain === null ? "" : ` · pluie ${Math.round(Number(w.rain))} %`;
  card.innerHTML = `${svg(WX_ICON[icon], 30, 1.6)}<div class="temp">${Math.round(w.temp)}°</div>
    <div class="wx">${label}<br><span class="muted">${Math.round(w.min)}° / ${Math.round(w.max)}°${rain}</span></div>
    <span class="aside">${esc(w.place)}</span>`;
}

/** Half-width tiles: "La Doua – Gaston Berger" → "Gaston Berger", "Hôpital …" → "Hôp. …". */
const shortDest = (d: string) => d.split(" – ").pop()!.replace(/^Hôpital\b/, "Hôp.");

function renderTrams(b: Summary["board"]) {
  const card = $("trams");
  card.hidden = b === null;
  if (!b || isErr(b)) return void (card.innerHTML = `<div class="muted">Tram</div><div class="error">Passages indisponibles</div>`);
  const rows = tramRows(b.departures).slice(0, 4); // 2 × 2: one tile per line and direction
  const tiles = rows.map((r) => `<div class="nx-pill tram"><span class="line">${esc(r.line)}</span>
      <span class="dest">${esc(shortDest(r.dest))}</span><span class="next">${esc(r.next)}</span></div>`).join("");
  card.innerHTML = `<div class="muted">Tram · ${esc(b.stop)}</div>
    ${rows.length ? `<div class="grid">${tiles}</div>` : `<div class="error">Aucun passage prévu</div>`}`;
}

function renderMails(m: Summary["mail"]) {
  const card = $("mails");
  card.hidden = m === null;
  const head = `<h2>${svg(ICON.mail, 15, 1.9)}Mails</h2>`;
  if (!m || isErr(m)) return void (card.innerHTML = `${head}<div class="error">Indisponible</div>`);
  const tile = (cls: string, n: number, k: string) =>
    `<button class="nx-pill nx-btn tile ${cls}" type="button" data-open="mail" aria-label="Ouvrir Gmail : ${Number(n) || 0} ${k.toLowerCase()}">
      <span class="n">${Number(n) || 0}</span><span class="k">${k}</span></button>`;
  card.innerHTML = `${head}<div class="tiles">${tile("urgent", m.urgent, "Urgent")}${tile("todo", m.a_traiter, "À traiter")}</div>`;
}

function renderClaude(c: Summary["claude"]) {
  const card = $("claude");
  card.hidden = c === null;
  if (!c) return;
  // The PC sends the quota only while its dashboard is open: a window that has reset since is back to 0.
  const meter = (k: string, q: Quota) => {
    const reset = q.resets_at !== null && Date.parse(q.resets_at) < Date.now();
    const p = reset ? 0 : Math.min(100, Math.max(0, Math.round(q.pct)));
    return `<div class="meter"><div class="top"><span>${k}</span><b>${p} %</b></div><div class="bar"><div style="width:${p}%"></div></div></div>`;
  };
  card.innerHTML = `<h2>${svg(ICON.claude, 15, 1.9)}Claude</h2>${meter("Session", c.session)}${meter("Semaine", c.week)}
    <div class="age">maj ${esc(ago(c.updated_at))}</div>`;
}

function renderDock() {
  const btn = (key: string, icon: string, label: string) =>
    `<button class="nx-btn" type="button" data-open="${key}" aria-label="Ouvrir ${label}">
      <span class="ico">${svg(icon, 20)}</span><span class="lbl">${label}</span></button>`;
  $("dock").innerHTML = btn("claude", ICON.claude, "Claude") + btn("camera", ICON.camera, "Appareil photo") + btn("authenticator", ICON.shield, "Authenticator") + btn("wallet", ICON.wallet, "Wallet");
}

function renderStatus() {
  const s = $("status");
  s.hidden = failedAt === null && !unpaired && !stale.length;
  if (unpaired) s.textContent = "Téléphone non appairé · Réglages";
  else if (failedAt === null && stale.length) s.textContent = `${stale.join(", ")} : source indisponible, dernière valeur affichée`;
  else if (data && failedAt !== null) {
    const d = new Date(data.generated_at);
    s.textContent = `Relais injoignable · données de ${pad(d.getHours())}h${pad(d.getMinutes())}`;
  } else if (failedAt !== null) s.textContent = "Relais injoignable";
}

function render() {
  if (data) {
    renderNotion(data.notion);
    renderWeather(data.weather);
    renderTrams(data.board);
    renderMails(data.mail);
    renderClaude(data.claude);
  }
  renderStatus();
}

// ---------- data ----------
const CACHE = "nx-summary";
const LABEL = { notion: "Notion", weather: "Météo", board: "Trams", mail: "Mails" };

const inTauri = "__TAURI_INTERNALS__" in window;

async function fetchSummary(): Promise<Summary> {
  // `npm run mobile:dev` in a desktop browser: demo data (dropped from the APK build).
  if (import.meta.env.DEV && !inTauri) {
    const { demo } = await import("../../src/demo");
    const now = new Date().toISOString();
    return { generated_at: now, notion: demo.notion, weather: { ...demo.weather, place: "La Doua" }, board: demo.board,
      mail: { urgent: 2, a_traiter: 3, partial: false }, claude: { ...demo.claude, updated_at: now }, links: {} };
  }
  return invoke<Summary>("summary"); // Rust holds the token and calls the relay
}

/** Not paired any more (revoked or forgotten): its data must not stay on screen or in the cache. */
function dropData() {
  unpaired = true;
  data = null;
  try { localStorage.removeItem(CACHE); } catch {}
  for (const id of ["notion", "weather", "trams", "mails", "claude"]) $(id).hidden = true;
}

let loading = false;
async function refresh() {
  if (loading) return;
  loading = true;
  const t0 = Date.now();
  $("spin").classList.add("on");
  $("app").classList.add("loading");
  try {
    const fresh = await fetchSummary();
    // A source down keeps its last good value (the relay sends {error} for it).
    stale = [];
    for (const k of ["notion", "weather", "board", "mail"] as const) {
      const old = data?.[k];
      if (isErr(fresh[k]) && old && !isErr(old)) { (fresh as any)[k] = old; stale.push(LABEL[k]); }
    }
    data = fresh;
    failedAt = null;
    unpaired = false;
    try { localStorage.setItem(CACHE, JSON.stringify(data)); } catch {}
  } catch (e) {
    if (e === "unpaired") {
      dropData();
    } else failedAt = Date.now();
  } finally {
    loading = false;
    render();
    // Shown at least 600 ms: a fast reply would otherwise flash by unseen.
    setTimeout(() => { $("spin").classList.remove("on"); $("app").classList.remove("loading"); }, Math.max(0, 600 - (Date.now() - t0)));
  }
}

// ---------- interactions ----------
// Defaults, so the dock works before pairing; the relay config (`[android]`) overrides them.
const LINKS: Record<string, string> = { camera: "camera", claude: "com.anthropic.claude",
  authenticator: "com.bitwarden.authenticator", wallet: "com.google.android.apps.walletnfcrel" };

function onOpen(key: string) {
  const target = data?.links[key] ?? LINKS[key];
  if (target) invoke("open", { target }).catch(() => {});
}
document.addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>("[data-open]");
  if (b) onOpen(b.dataset.open!);
});

// Pull to refresh: drag down from the top of the page.
let startY: number | null = null;
let pulled = 0;
addEventListener("touchstart", (e) => { startY = scrollY === 0 ? e.touches[0].clientY : null; }, { passive: true });
addEventListener("touchmove", (e) => {
  if (startY === null) return;
  pulled = Math.max(0, Math.min(70, (e.touches[0].clientY - startY) / 2));
  $("app").style.transform = `translateY(${pulled}px)`;
  const s = $("spin").style; // fills in and turns as you pull; fully visible at the 50 px threshold
  s.opacity = String(Math.min(1, pulled / 50));
  s.transform = `rotate(${pulled * 6}deg)`;
}, { passive: true });
addEventListener("touchend", () => {
  if (pulled >= 50) refresh();
  startY = null;
  pulled = 0;
  $("app").style.transform = "";
  $("spin").style.opacity = $("spin").style.transform = "";
});

// ---------- settings (FLAG_SECURE while shown; Android back closes it) ----------
const msg = (t: string) => { $("settings-msg").textContent = t; };

async function openSettings() {
  if (!$("settings").hidden) return;
  if (inTauri && !(await invoke<boolean>("unlock").catch(() => false))) return; // shown over the lock screen
  history.pushState({ settings: true }, "");
  invoke("secure", { on: true }).catch(() => {});
  msg("");
  await showPairState();
  $("settings").hidden = false;
}

function closeSettings() {
  $("settings").hidden = true;
  invoke("secure", { on: false }).catch(() => {});
}

async function showPairState() {
  const relay = await invoke<string | null>("paired_relay").catch(() => null);
  $("paired").hidden = !relay;
  $("unpaired").hidden = !!relay;
  if (relay) $("relay-host").textContent = new URL(relay).host;
}

$("open-settings").addEventListener("click", openSettings);
$("status").addEventListener("click", () => (unpaired ? openSettings() : refresh()));
$("close-settings").addEventListener("click", () => history.back());
let scanning = false;
addEventListener("popstate", () => {
  if (scanning) { // Android back during a scan: stop the camera, stay in the settings
    cancel().catch(() => {});
    history.pushState({ settings: true }, "");
    return;
  }
  if (!$("settings").hidden) closeSettings();
});

$("unpaired").addEventListener("submit", async (e) => {
  e.preventDefault();
  const device = ($("device") as HTMLInputElement).value.trim();
  msg("");
  // The scanner fails at once unless the camera permission was granted beforehand.
  if ((await checkPermissions()) !== "granted" && (await requestPermissions()) !== "granted")
    return msg("NEXUS a besoin de l'appareil photo pour lire le QR : autorise-le dans Paramètres › Applis › NEXUS › Autorisations.");
  let link: string;
  scanning = true;
  try {
    link = (await scan({ formats: [Format.QRCode] })).content;
  } catch {
    return msg("Scan annulé.");
  } finally {
    scanning = false;
  }
  try {
    msg("Appairage…");
    await invoke("pair", { link, device });
    msg("Téléphone appairé.");
    await showPairState();
    refresh();
  } catch (err) {
    msg(String(err));
  }
});

$("forget").addEventListener("click", async () => {
  if (!confirm("Oublier ce téléphone ? Il faudra l'appairer de nouveau.")) return;
  try {
    await invoke("forget");
    dropData();
    render();
    await showPairState();
    msg("Ce téléphone est oublié.");
  } catch (err) {
    msg(String(err));
  }
});

// Refresh on open and when the app comes back to the foreground; never in the background.
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") refresh(); });

try { data = JSON.parse(localStorage.getItem(CACHE) ?? "null"); } catch {}
if (inTauri) invoke("secure", { on: false }).catch(() => {}); // a reload while settings were open must not keep it
renderDock();
render(); // cached values first, instantly
refresh();
