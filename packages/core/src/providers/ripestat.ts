import type { IpIntelligence, RpkiStatus } from '../schema.js';
import { asDict, fetchJson, toStr } from './helpers.js';
import type { IpProvider } from './types.js';

const RIPESTAT_API = 'https://stat.ripe.net/data';
const MAX_RPKI_ORIGINS = 8;
const RPKI_STATUSES = new Set<RpkiStatus>([
  'valid',
  'invalid_asn',
  'invalid_length',
  'unknown',
]);

interface EndpointResult {
  value: unknown | null;
  error: string | null;
}

function endpointResult(result: PromiseSettledResult<unknown>): EndpointResult {
  if (result.status === 'fulfilled') {
    return { value: result.value, error: null };
  }
  return {
    value: null,
    error:
      result.reason instanceof Error
        ? result.reason.message
        : String(result.reason),
  };
}

async function query(
  endpoint: string,
  params: Record<string, string>,
  signal: AbortSignal
): Promise<unknown> {
  const url = new URL(`${RIPESTAT_API}/${endpoint}/data.json`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  url.searchParams.set('sourceapp', 'howismyip');
  return fetchJson(url.toString(), { signal });
}

function dataFrom(payload: unknown): Record<string, unknown> {
  const root = asDict(payload);
  if (root.status !== 'ok') {
    return {};
  }
  return asDict(root.data);
}

function normalizeAsn(value: unknown): string | null {
  const raw = toStr(value);
  if (!raw) {
    return null;
  }
  return raw.toUpperCase().startsWith('AS') ? raw.toUpperCase() : `AS${raw}`;
}

export function parsePrefixOverview(payload: unknown): Partial<IpIntelligence> {
  const data = dataFrom(payload);
  const origins = Array.isArray(data.asns) ? data.asns : [];
  const originAsns: string[] = [];
  const originHolders: string[] = [];
  for (const raw of origins) {
    const origin = asDict(raw);
    const asn = normalizeAsn(origin.asn);
    const holder = toStr(origin.holder);
    if (asn && !originAsns.includes(asn)) {
      originAsns.push(asn);
    }
    if (holder && !originHolders.includes(holder)) {
      originHolders.push(holder);
    }
  }
  return {
    announced_prefix: toStr(data.resource),
    is_announced: typeof data.announced === 'boolean' ? data.announced : null,
    origin_asns: originAsns,
    origin_holders: originHolders,
    asn: originAsns.length === 1 ? originAsns[0] : null,
  };
}

export function parseReverseDns(payload: unknown): Partial<IpIntelligence> {
  const data = dataFrom(payload);
  const result = data.result;
  const ptr = Array.isArray(result) ? toStr(result[0]) : toStr(result);
  return { ptr };
}

export function combineRpkiStatuses(payloads: unknown[]): RpkiStatus | null {
  const statuses = new Set<RpkiStatus>();
  for (const payload of payloads) {
    const status = toStr(dataFrom(payload).status) as RpkiStatus | null;
    if (status && RPKI_STATUSES.has(status)) {
      statuses.add(status);
    }
  }
  if (statuses.size === 0) {
    return null;
  }
  if (statuses.size > 1) {
    return 'mixed';
  }
  return Array.from(statuses)[0] ?? null;
}

/**
 * RIPEstat — free, keyless routing provenance from RIPE NCC. One lookup uses
 * Prefix Overview and Reverse DNS concurrently, then validates any returned
 * origin/prefix pairs with RPKI. DNSBL and transfer-history endpoints are
 * intentionally excluded: their pending/error semantics do not fit the
 * synchronous report contract yet.
 */
export const ripestatProvider: IpProvider = {
  id: 'ripestat',
  name: 'RIPEstat',
  category: 'network',
  requiresKey: false,
  sourceUrl: (ip) => `https://stat.ripe.net/${encodeURIComponent(ip)}`,
  async lookup(ip, _env, context) {
    const [prefixSettled, reverseSettled] = await Promise.allSettled([
      query('prefix-overview', { resource: ip }, context.signal),
      query('reverse-dns-ip', { resource: ip }, context.signal),
    ]);
    const prefix = endpointResult(prefixSettled);
    const reverse = endpointResult(reverseSettled);

    if (prefix.error && reverse.error) {
      throw new Error(
        `RIPEstat endpoints failed: prefix-overview (${prefix.error}); reverse-dns-ip (${reverse.error})`
      );
    }

    const routing = parsePrefixOverview(prefix.value);
    const reverseDns = parseReverseDns(reverse.value);
    const originAsns = routing.origin_asns ?? [];
    const network = routing.announced_prefix;
    const rpkiSettled =
      network && originAsns.length > 0
        ? await Promise.allSettled(
            originAsns
              .slice(0, MAX_RPKI_ORIGINS)
              .map((asn) =>
                query(
                  'rpki-validation',
                  { resource: asn.replace(/^AS/i, ''), prefix: network },
                  context.signal
                )
              )
          )
        : [];
    const rpki = rpkiSettled.map(endpointResult);
    const rpkiStatus = combineRpkiStatuses(
      rpki.flatMap((result) => (result.value ? [result.value] : []))
    );

    const hasData =
      routing.announced_prefix ||
      routing.is_announced !== null ||
      originAsns.length > 0 ||
      reverseDns.ptr ||
      rpkiStatus;
    if (!hasData) {
      return null;
    }

    return {
      ...routing,
      ...reverseDns,
      rpki_status: rpkiStatus,
      raw: {
        prefix_overview: prefix,
        reverse_dns: reverse,
        rpki,
        rpki_origins_truncated: originAsns.length > MAX_RPKI_ORIGINS,
      },
    };
  },
};
