import { isValidIp } from './ip.js';
import { enabledProviders } from './providers/index.js';
import type { Env, IpProvider } from './providers/types.js';
import {
  type Consensus,
  type IpIntelligence,
  type IpReport,
  type ProviderResult,
  emptyIntelligence,
} from './schema.js';

/** Run one provider, timing it and normalizing the outcome into a ProviderResult. */
async function runProvider(
  provider: IpProvider,
  ip: string,
  env: Env
): Promise<ProviderResult> {
  const startedAt = Date.now();
  const base = {
    id: provider.id,
    name: provider.name,
    category: provider.category,
    requiresKey: provider.requiresKey,
    sourceUrl: provider.sourceUrl(ip),
  };
  try {
    const partial = await provider.lookup(ip, env);
    const durationMs = Date.now() - startedAt;
    if (!partial) {
      return { ...base, status: 'empty', durationMs, data: null, error: null };
    }
    const data: IpIntelligence = { ...emptyIntelligence(ip), ...partial, ip };
    return { ...base, status: 'ok', durationMs, data, error: null };
  } catch (err) {
    return {
      ...base,
      status: 'error',
      durationMs: Date.now() - startedAt,
      data: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** First non-empty value across the successful sources, in source order. */
function firstAvailable<K extends keyof IpIntelligence>(
  sources: ProviderResult[],
  key: K
): IpIntelligence[K] | null {
  for (const source of sources) {
    const value = source.data?.[key];
    if (value !== null && value !== undefined && value !== '') {
      return value as IpIntelligence[K];
    }
  }
  return null;
}

function buildConsensus(sources: ProviderResult[]): Consensus {
  const ok = sources.filter((s) => s.status === 'ok' && s.data);

  const blocklists = Array.from(
    new Set(ok.flatMap((s) => s.data?.blocklists ?? []))
  );

  return {
    country_code: firstAvailable(ok, 'country_code'),
    country_name: firstAvailable(ok, 'country_name'),
    city: firstAvailable(ok, 'city'),
    asn: firstAvailable(ok, 'asn'),
    isp: firstAvailable(ok, 'isp'),
    organization: firstAvailable(ok, 'organization'),
    rir: firstAvailable(ok, 'rir'),
    blocklists,
    source_count: ok.length,
  };
}

export class InvalidIpError extends Error {
  constructor(ip: string) {
    super(`Invalid IP address: ${ip}`);
    this.name = 'InvalidIpError';
  }
}

/**
 * Run a specific set of providers for `ip` concurrently. Exposed mainly for
 * testing with fake providers; production callers use `lookupIp`.
 */
export async function lookupIpWith(
  providers: IpProvider[],
  ip: string,
  env: Env = process.env
): Promise<IpReport> {
  const trimmed = ip.trim();
  if (!isValidIp(trimmed)) {
    throw new InvalidIpError(ip);
  }
  const sources = await Promise.all(
    providers.map((p) => runProvider(p, trimmed, env))
  );
  return {
    ip: trimmed,
    queried_at: new Date().toISOString(),
    consensus: buildConsensus(sources),
    sources,
  };
}

/**
 * Query every enabled provider for `ip` concurrently and return a normalized
 * report: per-source results (with timing + partial-failure info) plus a merged
 * consensus view. Never throws on individual provider failure.
 */
export function lookupIp(
  ip: string,
  env: Env = process.env
): Promise<IpReport> {
  return lookupIpWith(enabledProviders(env), ip, env);
}
