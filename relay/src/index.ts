// nexus-relay: the phone's only door to its data. Contract: docs/relay-api.md.
// Deny by default: unknown route 404, wrong method 405, any token problem 401 (always the same answer).
import { bearer, deviceOf } from "./auth.ts";
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
  RL: RateLimit;
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

async function route(req: Request, env: Env, path: string): Promise<Response> {
  const routes: Record<string, string> = { "/v1/summary": "GET" };
  if (!(path in routes)) return fail(404, "not_found");
  if (req.method !== routes[path]) return fail(405, "method_not_allowed");

  // Before any KV read, so junk traffic can't burn the free KV quota.
  const ip = req.headers.get("CF-Connecting-IP") ?? "?";
  if (!(await env.RL.limit({ key: `${path}:${ip}` })).success) return fail(429, "rate_limited", { "Retry-After": "60" });

  if (!(await deviceOf(bearer(req), env.KV))) return fail(401, "unauthorized");
  return reply(await summary(env));
}
