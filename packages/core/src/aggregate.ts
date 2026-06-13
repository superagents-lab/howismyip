import { isValidIp } from './ip.js';
import { enabledProviders } from './providers/index.js';
import type { Env, IpProvider } from './providers/types.js';
import {
  type Consensus,
  type IpIntelligence,
  type IpReport,
  type ProviderResult,
  type RiskLevel,
  emptyIntelligence,
  riskLevelFromScore,
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

/** OR across boolean flags: true if any source asserts true, false if any asserts false, else null. */
function anyFlag(
  sources: ProviderResult[],
  key: 'is_proxy' | 'is_vpn' | 'is_tor' | 'is_hosting' | 'is_mobile'
): boolean | null {
  let sawFalse = false;
  for (const source of sources) {
    const value = source.data?.[key];
    if (value === true) {
      return true;
    }
    if (value === false) {
      sawFalse = true;
    }
  }
  return sawFalse ? false : null;
}

function buildConsensus(sources: ProviderResult[]): Consensus {
  const ok = sources.filter((s) => s.status === 'ok' && s.data);

  const scores = ok
    .map((s) => s.data?.risk_score)
    .filter((v): v is number => typeof v === 'number');
  const maxScore = scores.length > 0 ? Math.max(...scores) : null;

  let riskLevel: RiskLevel | null = riskLevelFromScore(maxScore);
  if (riskLevel === null) {
    riskLevel = firstAvailable(ok, 'risk_level') as RiskLevel | null;
  }

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
    proxy_type: firstAvailable(ok, 'proxy_type'),
    risk_score: maxScore,
    risk_level: riskLevel,
    is_proxy: anyFlag(ok, 'is_proxy'),
    is_vpn: anyFlag(ok, 'is_vpn'),
    is_tor: anyFlag(ok, 'is_tor'),
    is_hosting: anyFlag(ok, 'is_hosting'),
    is_mobile: anyFlag(ok, 'is_mobile'),
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
