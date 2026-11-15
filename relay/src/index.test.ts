// `npm test` (Node's runner, types stripped). Upstream APIs are stubbed: no network, no secret.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import worker, { clearCache, localDate } from "./index.ts";
import { sha256hex } from "./auth.ts";
import { text } from "./sources.ts";

const DEVICE = "nxd_" + "A".repeat(43);
const PUSH = "push-token-for-tests-0123456789";
const ADMIN = "admin-token-for-tests-0123456789";
const store = new Map<string, string>();
let allow = true;

const config = {
  tz: "Europe/Paris",
  weather: { latitude: 45.78, longitude: 4.87, place: "La Doua" },
  transport: { provider: "tcl", stop_name: "INSA-Einstein", stop_ids: [1], lines: ["T1"] },
  notion: { tasks: { database: "db", title: "T", subject: "S", date: "D", status: "St", done_value: "Fini", exam_value: "DS" } },
  gmail: { urgent: "Urgents", todo: "A traiter" },
  links: { mail: "com.google.android.gm" },
};

const env = (over: Record<string, unknown> = {}) => ({
  KV: {
    get: async (k: string, t?: string) => (store.has(k) ? (t === "json" ? JSON.parse(store.get(k)!) : store.get(k)) : null),
    put: async (k: string, v: string) => void store.set(k, v),
    delete: async (k: string) => void store.delete(k),
  },
  RL: { limit: async () => ({ success: allow }) },
  RL_PAIR: { limit: async () => ({ success: allow }) },
  RL_PUSH: { limit: async () => ({ success: allow }) },
  INSA_MAIL: { counts: async () => ({ urgent: 2, a_traiter: 1 }) },
  NEXUS_CONFIG: JSON.stringify(config),
  PUSH_TOKEN_SHA256: "", ADMIN_TOKEN_SHA256: "",
  ...over,
}) as any;

// Stub upstream APIs by host.
let gmailUp = true;
globalThis.fetch = (async (input: RequestInfo | URL) => {
  const u = new URL(String(input));
  const j = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status });
  switch (u.host) {
    case "api.open-meteo.com":
      return j({ current: { temperature_2m: 9, weather_code: 2, is_day: 1 },
        daily: { temperature_2m_min: [5], temperature_2m_max: [12], precipitation_probability_max: [10] } });
    case "data.grandlyon.com":
      return j({ values: [{ ligne: "T1", direction: "Debourg", heurepassage: "2026-11-15 17:03:30" },
        { ligne: "C17", direction: "X", heurepassage: "2026-11-15 17:05:00" }] });
    case "api.notion.com":
      return j({ results: [{ properties: { T: { title: [{ plain_text: "TD 4" }] }, S: { select: { name: "Réseaux" } }, St: { status: { name: "Fini" } }, D: { date: { start: "2026-11-19" } } } }] });
    case "oauth2.googleapis.com":
      return gmailUp ? j({ access_token: "a", expires_in: 3600 }) : j({}, 401);
    case "gmail.googleapis.com":
      if (!gmailUp) return j({}, 503);
      if (u.pathname.endsWith("/labels")) return j({ labels: [{ id: "L1", name: "Urgents" }, { id: "L2", name: "A traiter" }] });
      return j({ messagesTotal: u.pathname.endsWith("L1") ? 1 : 4 });
  }
  throw new Error("unexpected fetch " + u.host);
}) as typeof fetch;

const call = (path: string, init: RequestInit = {}, e = env()) =>
  worker.fetch(new Request("https://relay.test" + path, init), e);
const auth = (t: string) => ({ headers: { Authorization: `Bearer ${t}` } });

beforeEach(async () => {
  store.clear();
  store.set(`dev:${await sha256hex(DEVICE)}`, JSON.stringify({ name: "S22" }));
  allow = true;
  gmailUp = true;
  clearCache();
});

test("deny by default: unknown route, wrong method, no CORS", async () => {
  assert.equal((await call("/")).status, 404);
  assert.equal((await call("/v1/summary/x")).status, 404);
  assert.equal((await call("/v1/summary", { method: "POST" })).status, 405);
  const r = await call("/v1/summary", { method: "OPTIONS" });
  assert.equal(r.status, 405);
  assert.equal(r.headers.get("Access-Control-Allow-Origin"), null);
});

test("every token problem is the same 401", async () => {
  const pushEnv = env({ PUSH_TOKEN_SHA256: await sha256hex(PUSH) });
  for (const init of [{}, auth("nope"), auth("nxd_" + "B".repeat(43)), auth(DEVICE + "x"), { headers: { Authorization: DEVICE } }]) {
    const r = await call("/v1/summary", init);
    assert.equal(r.status, 401);
    assert.deepEqual(await r.json(), { error: "unauthorized" });
  }
  assert.equal((await call("/v1/summary", auth(PUSH), pushEnv)).status, 401, "push token can't read");
});

test("rate limit answers 429 before touching KV", async () => {
  allow = false;
  const r = await call("/v1/summary", auth(DEVICE));
  assert.equal(r.status, 429);
  assert.equal(r.headers.get("Retry-After"), "60");
});

test("summary: shapes, mail = Gmail + INSA, no-store", async () => {
  store.set("claude", JSON.stringify({ session: { pct: 42, resets_at: null }, week: { pct: 63, resets_at: null }, updated_at: "x" }));
  const r = await call("/v1/summary", auth(DEVICE));
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("Cache-Control"), "no-store");
  const s: any = await r.json();
  assert.equal(s.v, 1);
  assert.deepEqual(s.weather, { temp: 9, code: 2, is_day: true, min: 5, max: 12, rain: 10, place: "La Doua" });
  assert.deepEqual(s.board, { stop: "INSA-Einstein", departures: [{ line: "T1", direction: "Debourg", at: "2026-11-15 17:03:30" }] });
  assert.deepEqual(s.notion.tasks, [{ title: "TD 4", subject: "Réseaux", done: true }]);
  assert.deepEqual(s.notion.exam, { title: "TD 4", date: "2026-11-19" });
  assert.deepEqual(s.mail, { urgent: 3, a_traiter: 5, partial: false });
  assert.equal(s.claude.session.pct, 42);
  assert.deepEqual(s.links, config.links);
});

test("a source down only marks its own section; one mailbox down = partial", async () => {
  gmailUp = false;
  const s: any = await (await call("/v1/summary", auth(DEVICE))).json();
  assert.deepEqual(s.mail, { urgent: 2, a_traiter: 1, partial: true });
  assert.equal(s.weather.temp, 9);
  const down: any = await (await call("/v1/summary", auth(DEVICE), env({ INSA_MAIL: { counts: async () => { throw new Error("x"); } } }))).json();
  assert.deepEqual(down.mail, { urgent: 2, a_traiter: 1, partial: true }, "cached value still served");
});

test("unconfigured sections are null", async () => {
  const e = env({ NEXUS_CONFIG: JSON.stringify({ ...config, notion: null, weather: null, gmail: null }), INSA_MAIL: undefined });
  const s: any = await (await call("/v1/summary", auth(DEVICE), e)).json();
  assert.equal(s.notion, null);
  assert.equal(s.weather, null);
  assert.equal(s.mail, null);
  assert.equal(s.claude, null);
});

test("localDate uses the configured time zone", () => {
  const t = Date.parse("2026-11-15T23:30:00Z"); // 00:30 the next day in Paris
  assert.equal(localDate("Europe/Paris", 0, t), "2026-11-16");
  assert.equal(localDate("Europe/Paris", 7, t), "2026-11-09");
});

test("Notion text reads title, select and status", () => {
  const p = { properties: { T: { title: [{ plain_text: "TD " }, { plain_text: "4" }] }, S: { select: { name: "NRP" } } } };
  assert.equal(text(p, "T"), "TD 4");
  assert.equal(text(p, "S"), "NRP");
  assert.equal(text(p, "missing"), "");
});

const pcEnv = async () => env({ PUSH_TOKEN_SHA256: await sha256hex(PUSH), ADMIN_TOKEN_SHA256: await sha256hex(ADMIN) });
const post = (path: string, body: unknown, token?: string, e?: any) =>
  call(path, { method: "POST", body: JSON.stringify(body), headers: token ? { Authorization: `Bearer ${token}` } : {} }, e);

test("claude-usage: push token only, validated, then served in the summary", async () => {
  const e = await pcEnv();
  const usage = { session: { pct: 42, resets_at: "2026-11-15T19:59:59+00:00" }, week: { pct: 63, resets_at: null } };
  for (const t of [undefined, DEVICE, ADMIN]) assert.equal((await post("/v1/claude-usage", usage, t, e)).status, 401);
  for (const bad of [{}, { session: { pct: "42" }, week: usage.week }, { ...usage, week: { pct: -1 } }, { ...usage, junk: "x".repeat(2000) }])
    assert.equal((await post("/v1/claude-usage", bad, PUSH, e)).status, 400);
  assert.equal((await post("/v1/claude-usage", usage, PUSH, e)).status, 204);
  const s: any = await (await call("/v1/summary", auth(DEVICE), e)).json();
  assert.deepEqual([s.claude.session.pct, s.claude.week.pct, typeof s.claude.updated_at], [42, 63, "string"]);
});

test("pairing: admin creates a one-time code, the phone trades it for a working token", async () => {
  const e = await pcEnv();
  for (const t of [undefined, DEVICE, PUSH]) assert.equal((await post("/v1/pair", {}, t, e)).status, 401);
  const p = await post("/v1/pair", {}, ADMIN, e);
  assert.equal(p.status, 201);
  const { code, expires_in } = await p.json() as any;
  assert.match(code, /^[A-Za-z0-9_-]{22}$/);
  assert.equal(expires_in, 60);

  assert.equal((await post("/v1/pair/claim", { code, device: "<script>" }, undefined, e)).status, 400);
  const c = await post("/v1/pair/claim", { code, device: "Galaxy S22" }, undefined, e);
  assert.equal(c.status, 201);
  const { token, device } = await c.json() as any;
  assert.match(token, /^nxd_[A-Za-z0-9_-]{43}$/);
  assert.equal(device, "Galaxy S22");
  assert.ok(![...store.values()].some((v) => v.includes(token)), "token never stored in clear");
  assert.equal((await call("/v1/summary", auth(token), e)).status, 200);

  assert.equal((await post("/v1/pair/claim", { code, device: "Other" }, undefined, e)).status, 401, "code is single-use");
  assert.equal((await post("/v1/pair/claim", { code: "A".repeat(22), device: "X" }, undefined, e)).status, 401);
});

test("pairing: a taken name is 409 and leaves the code usable", async () => {
  const e = await pcEnv();
  const code1 = (await (await post("/v1/pair", {}, ADMIN, e)).json() as any).code;
  await post("/v1/pair/claim", { code: code1, device: "S22" }, undefined, e);
  const code2 = (await (await post("/v1/pair", {}, ADMIN, e)).json() as any).code;
  assert.equal((await post("/v1/pair/claim", { code: code2, device: "S22" }, undefined, e)).status, 409);
  assert.equal((await post("/v1/pair/claim", { code: code2, device: "S22 bis" }, undefined, e)).status, 201);
});
