// nexus-relay: the phone's only door to its data. Contract: docs/relay-api.md.
// Deny by default: unknown route 404, wrong method 405, any token problem 401 (always the same answer).
import { bearer, deviceOf, isPcToken, sha256hex } from "./auth.ts";
import { board, mail, notion, weather } from "./sources.ts";

export interface Config {
  tz: string;
  weather: { latitude: number; longitude: number; place?: string } | null;
  transport: { provider: string; stop_name?: string; stop_ids: number[]; lines?: string[] } | null;
  notion: {
    tasks: { database: string; title: string; subject: string; date: string; status: string; done_value: string; exam_value: string };
    health?: { database: string; score: string; date: string; filter_property: string; filter_value: string };
  } | null;
  gmail: { urgent: string; todo: string } | null;
  links: Record<string, string>;
}

export interface Env {
  KV: KVNamespace;
  RL: RateLimit;      // /v1/summary, 30/min/IP
  RL_PAIR: RateLimit; // /v1/pair*, 5/min/IP
  RL_PUSH: RateLimit; // /v1/claude-usage, 12/min/IP
  INSA_MAIL?: { counts(): Promise<{ urgent: number; a_traiter: number }> };
  NEXUS_CONFIG: string;
  NOTION_TOKEN: string;
  GRANDLYON_USER: string;
  GRANDLYON_PASSWORD: string;
  GMAIL_CLIENT_ID: string;
  GMAIL_CLIENT_SECRET: string;
  GMAIL_REFRESH_TOKEN: string;
  PUSH_TOKEN_SHA256: string;
  ADMIN_TOKEN_SHA256: string;
}

const HEADERS = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
export const reply = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  Response.json(body, { status, headers: { ...HEADERS, ...extra } });
const fail = (status: number, error: string, extra?: Record<string, string>) => reply({ error }, status, extra);

// Per-isolate cache, best effort: the Cache API does nothing on workers.dev and KV allows only
// 1,000 writes/day. A cold isolate just calls the sources again. Errors are never cached.
const cache = new Map<string, { until: number; value: unknown }>();
async function cached<T>(key: string, seconds: number, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && hit.until > Date.now()) return hit.value as T;
  const value = await load();
  cache.set(key, { until: Date.now() + seconds * 1000, value });
  return value;
}
export const clearCache = () => cache.clear(); // tests

/** null = not configured (card hidden); {error} = source down (phone keeps its cached value). */
async function section<T>(name: string, configured: unknown, seconds: number, load: () => Promise<T>) {
  if (!configured) return null;
  try {
    return await cached(name, seconds, load);
  } catch (e) {
    console.log(`${name}: ${(e as Error).message.slice(0, 40)}`); // service + HTTP status only
    return { error: "unavailable" };
  }
}

/** "YYYY-MM-DD" in `tz`, `daysBack` days ago. */
export function localDate(tz: string, daysBack = 0, now = Date.now()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date(now - daysBack * 864e5));
}

async function summary(env: Env) {
  const cfg: Config = JSON.parse(env.NEXUS_CONFIG);
  const [n, w, b, m, claude] = await Promise.all([
    section("notion", cfg.notion, 300, () => notion(cfg.notion!, env, localDate(cfg.tz), localDate(cfg.tz, 7))),
    section("weather", cfg.weather, 900, () => weather(cfg.weather!)),
    section("board", cfg.transport, 30, () => board(cfg.transport!, env)),
    section("mail", cfg.gmail || env.INSA_MAIL, 120, () => mail(cfg, env)),
    env.KV.get("claude", "json"),
  ]);
  return { v: 1, generated_at: new Date().toISOString(), notion: n, weather: w, board: b, mail: m, claude, links: cfg.links };
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const t0 = Date.now();
    const { pathname } = new URL(req.url);
    const res = await route(req, env, pathname).catch(() => fail(500, "internal"));
    console.log(`${req.method} ${pathname.slice(0, 32)} ${res.status} ${Date.now() - t0}ms`);
    return res;
  },
};

const ROUTES: Record<string, { method: string; rl: "RL" | "RL_PAIR" | "RL_PUSH" }> = {
  "/v1/summary": { method: "GET", rl: "RL" },
  "/v1/claude-usage": { method: "POST", rl: "RL_PUSH" },
  "/v1/pair": { method: "POST", rl: "RL_PAIR" },
  "/v1/pair/claim": { method: "POST", rl: "RL_PAIR" },
  "/v1/device": { method: "DELETE", rl: "RL_PAIR" },
};

async function route(req: Request, env: Env, path: string): Promise<Response> {
  const r = ROUTES[path];
  if (!r) return fail(404, "not_found");
  if (req.method !== r.method) return fail(405, "method_not_allowed");

  // Before any KV read, so junk traffic can't burn the free KV quota.
  const ip = req.headers.get("CF-Connecting-IP") ?? "?";
  if (!(await env[r.rl].limit({ key: `${path}:${ip}` })).success) return fail(429, "rate_limited", { "Retry-After": "60" });

  const token = bearer(req);
  switch (path) {
    case "/v1/summary":
      if (!(await deviceOf(token, env.KV))) return fail(401, "unauthorized");
      return reply(await summary(env));
    case "/v1/claude-usage":
      if (!(await isPcToken(token, env.PUSH_TOKEN_SHA256))) return fail(401, "unauthorized");
      return claudeUsage(req, env);
    case "/v1/device": { // "forget this phone": a device can only revoke itself
      const name = await deviceOf(token, env.KV);
      if (!name) return fail(401, "unauthorized");
      await env.KV.delete(`dev:${await sha256hex(token!)}`);
      await env.KV.delete(`devname:${name}`);
      return new Response(null, { status: 204, headers: HEADERS });
    }
    case "/v1/pair":
      if (!(await isPcToken(token, env.ADMIN_TOKEN_SHA256))) return fail(401, "unauthorized");
      return pair(env);
    default:
      return claim(req, env); // no token: the one-time code is the credential
  }
}

/** JSON body of at most 1 KB, or null. */
async function body(req: Request): Promise<any> {
  const t = await req.text();
  if (t.length > 1024) return null;
  try { return JSON.parse(t); } catch { return null; }
}

const isDate = (v: unknown) => v === null || (typeof v === "string" && v.length <= 40 && !Number.isNaN(Date.parse(v)));
const isWindow = (w: any) => w && typeof w.pct === "number" && w.pct >= 0 && w.pct <= 1000 && isDate(w.resets_at ?? null);

async function claudeUsage(req: Request, env: Env) {
  const b = await body(req);
  if (!b || !isWindow(b.session) || !isWindow(b.week)) return fail(400, "bad_request");
  const w = (x: any) => ({ pct: x.pct, resets_at: x.resets_at ?? null });
  await env.KV.put("claude", JSON.stringify({ session: w(b.session), week: w(b.week), updated_at: new Date().toISOString() }));
  return new Response(null, { status: 204, headers: HEADERS });
}

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const random = (n: number) => b64url(crypto.getRandomValues(new Uint8Array(n)));

async function pair(env: Env) {
  const code = random(16); // 128 bits, only ever shown as a QR on the PC
  await env.KV.put(`pair:${await sha256hex(code)}`, "1", { expirationTtl: 60 }); // 60 s = KV's minimum TTL
  return reply({ code, expires_in: 60 }, 201);
}

const DEVICE_NAME = /^[\p{L}\p{N} _'.-]{1,40}$/u;

async function claim(req: Request, env: Env) {
  const b = await body(req);
  if (!b || typeof b.code !== "string" || !/^[A-Za-z0-9_-]{22}$/.test(b.code) ||
      typeof b.device !== "string" || !DEVICE_NAME.test(b.device.trim())) return fail(400, "bad_request");
  const name = b.device.trim();
  const codeKey = `pair:${await sha256hex(b.code)}`;
  if (!(await env.KV.get(codeKey))) return fail(401, "unauthorized"); // unknown, expired or used: same answer
  if (await env.KV.get(`devname:${name}`)) return fail(409, "conflict"); // code stays valid: retry with another name
  await env.KV.delete(codeKey);
  const token = "nxd_" + random(32); // 256 bits; only its hash is stored
  const hash = await sha256hex(token);
  await env.KV.put(`dev:${hash}`, JSON.stringify({ name, created_at: new Date().toISOString() }));
  await env.KV.put(`devname:${name}`, hash); // name → hash, for scripts/relay-revoke.sh
  return reply({ token, device: name }, 201);
}
