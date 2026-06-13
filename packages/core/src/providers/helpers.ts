/**
 * Permissive parsing helpers shared by provider adapters. Ported from
 * search1api's `proxy_ip_intelligence.py` so that field-name variations across
 * provider plans/versions don't break normalization.
 */

/** Coerce yes/no/true/false/1/0 (string or bool) into a boolean, else null. */
export function yesNoToBool(value: unknown): boolean | null {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'yes' || normalized === 'true' || normalized === '1') {
      return true;
    }
    if (normalized === 'no' || normalized === 'false' || normalized === '0') {
      return false;
    }
  }
  return null;
}

/** Best-effort integer coercion, else null. */
export function toInt(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  const n =
    typeof value === 'number' ? value : Number.parseInt(String(value), 10);
  return Number.isFinite(n) ? n : null;
}

/** Return the first non-null/undefined value among the listed keys. */
export function first(
  payload: Record<string, unknown>,
  keys: string[]
): unknown {
  for (const key of keys) {
    const value = payload[key];
    if (value !== null && value !== undefined) {
      return value;
    }
  }
  return null;
}

/** Narrow an unknown to a plain object, else an empty object. */
export function asDict(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** Coerce to a non-empty trimmed string, else null. */
export function toStr(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === 'number') {
    return String(value);
  }
  return null;
}

const DEFAULT_TIMEOUT_MS = 10_000;

/** Some free APIs (e.g. ipwho.is) reject requests with no User-Agent. */
export const USER_AGENT =
  'howismyip/0.1 (+https://github.com/fatwang2/howismyip)';

/** `fetch` JSON with a timeout; throws on non-2xx or timeout. */
export async function fetchJson(
  url: string,
  init: RequestInit = {},
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        accept: 'application/json',
        'user-agent': USER_AGENT,
        ...(init.headers ?? {}),
      },
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

interface DohAnswer {
  type: number;
  data: string;
}

const DOH_TYPE: Record<'A' | 'TXT', number> = { A: 1, TXT: 16 };
const TXT_QUOTE_RE = /^"|"$/g;
const TXT_ESCAPED_QUOTE_RE = /\\"/g;

/**
 * Resolve DNS records over DNS-over-HTTPS (Cloudflare 1.1.1.1 JSON API). Used
 * instead of `node:dns` so the providers run on any runtime — Node, Deno, Bun,
 * and Cloudflare Workers (which has no DNS resolver). Returns record data
 * strings; never throws (returns [] on error / NXDOMAIN).
 */
export async function dohResolve(
  name: string,
  type: 'A' | 'TXT',
  timeoutMs = 5000
): Promise<string[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${type}`,
      {
        signal: controller.signal,
        headers: { accept: 'application/dns-json', 'user-agent': USER_AGENT },
      }
    );
    if (!res.ok) {
      return [];
    }
    const body = (await res.json()) as { Answer?: DohAnswer[] };
    if (!body.Answer) {
      return [];
    }
    return body.Answer.filter((a) => a.type === DOH_TYPE[type]).map((a) =>
      type === 'TXT'
        ? a.data.replace(TXT_QUOTE_RE, '').replace(TXT_ESCAPED_QUOTE_RE, '"')
        : a.data
    );
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}
