// Token checks. Tokens are never stored or compared in clear: only their SHA-256 (hex).

const enc = new TextEncoder();

export async function sha256hex(s: string): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(s)));
  return Array.from(d, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Constant-time string compare (both are hex digests of equal length when valid). */
export function sameHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/** `Authorization: Bearer <token>` → token, or null. */
export function bearer(req: Request): string | null {
  const m = /^Bearer ([A-Za-z0-9_-]{20,100})$/.exec(req.headers.get("Authorization") ?? "");
  return m ? m[1] : null;
}

/** Device tokens: "nxd_" + 43 base64url chars (256 bits). Checked before any KV read. */
export const DEVICE_TOKEN = /^nxd_[A-Za-z0-9_-]{43}$/;

/** Is `token` the PC token whose hash is `expectedHash` (push or admin)? */
export async function isPcToken(token: string | null, expectedHash: string | undefined): Promise<boolean> {
  if (!token || !expectedHash || token.startsWith("nxd_")) return false;
  return sameHex(await sha256hex(token), expectedHash);
}

/** Device name for a valid device token, else null. Lookup by hash: nothing to compare in clear. */
export async function deviceOf(token: string | null, kv: KVNamespace): Promise<string | null> {
  if (!token || !DEVICE_TOKEN.test(token)) return null;
  const rec = await kv.get<{ name: string }>(`dev:${await sha256hex(token)}`, "json");
  return rec?.name ?? null;
}
