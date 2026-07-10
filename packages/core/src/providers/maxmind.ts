import type { IpIntelligence } from '../schema.js';
import { riskLevelFromScore } from '../schema.js';
import { asDict, first, toStr, yesNoToBool } from './helpers.js';
import type { IpProvider } from './types.js';

const DEFAULT_MINFRAUD_SCORE_URL =
  'https://minfraud.maxmind.com/minfraud/v2.0/score';
const DATACENTER_RE = /hosting|data ?center/i;

function toScore(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  const n =
    typeof value === 'number' ? value : Number.parseFloat(String(value));
  if (!Number.isFinite(n)) {
    return null;
  }
  return Math.max(0, Math.min(100, n));
}

function basicAuth(accountId: string, licenseKey: string): string {
  const token =
    typeof btoa === 'function'
      ? btoa(`${accountId}:${licenseKey}`)
      : Buffer.from(`${accountId}:${licenseKey}`).toString('base64');
  return `Basic ${token}`;
}

function englishName(value: unknown): string | null {
  const names = asDict(asDict(value).names);
  return (
    toStr(names.en) ??
    toStr(names['zh-CN']) ??
    toStr(names.zh) ??
    toStr(first(names, Object.keys(names)))
  );
}

function inferProxyType(traits: Record<string, unknown>): string | null {
  if (yesNoToBool(traits.is_tor_exit_node)) {
    return 'Tor exit node';
  }
  if (yesNoToBool(traits.is_anonymous_vpn)) {
    return 'Anonymous VPN';
  }
  if (yesNoToBool(traits.is_public_proxy)) {
    return 'Public proxy';
  }
  if (yesNoToBool(traits.is_residential_proxy)) {
    return 'Residential proxy';
  }
  if (yesNoToBool(traits.is_hosting_provider)) {
    return 'Hosting provider';
  }
  return toStr(traits.user_type) ?? toStr(traits.connection_type);
}

function anyBoolean(values: unknown[]): boolean | null {
  let sawFalse = false;
  for (const value of values) {
    const bool = yesNoToBool(value);
    if (bool === true) {
      return true;
    }
    if (bool === false) {
      sawFalse = true;
    }
  }
  return sawFalse ? false : null;
}

function riskReasons(payload: Record<string, unknown>): string[] {
  const rawIpRiskReasons = asDict(payload.ip_address).risk_reasons;
  const ipRiskReasons = Array.isArray(rawIpRiskReasons) ? rawIpRiskReasons : [];
  const topReasons = Array.isArray(payload.risk_score_reasons)
    ? payload.risk_score_reasons
    : [];

  const names = new Set<string>();
  for (const item of ipRiskReasons) {
    const reason = asDict(item);
    const code = toStr(reason.code);
    if (code) {
      names.add(`MaxMind IP reason: ${code}`);
    }
  }
  for (const item of topReasons) {
    const reasons = asDict(item).reasons;
    if (!Array.isArray(reasons)) {
      continue;
    }
    for (const reason of reasons) {
      const code = toStr(asDict(reason).code);
      if (code) {
        names.add(`MaxMind score reason: ${code}`);
      }
    }
  }
  return Array.from(names);
}

export function parseMaxMindMinFraudResponse(
  payload: Record<string, unknown>
): Partial<IpIntelligence> {
  const ipAddress = asDict(payload.ip_address);
  const traits = asDict(ipAddress.traits);
  const country = asDict(ipAddress.country);
  const continent = asDict(ipAddress.continent);
  const city = asDict(ipAddress.city);
  const subdivisions = Array.isArray(ipAddress.subdivisions)
    ? ipAddress.subdivisions
    : [];
  const firstSubdivision = asDict(subdivisions[0]);
  const score = toScore(ipAddress.risk);
  const connectionType = toStr(traits.connection_type);
  const proxyType = inferProxyType(traits);
  const isHosting =
    yesNoToBool(traits.is_hosting_provider) ??
    (connectionType ? DATACENTER_RE.test(connectionType) : null);

  return {
    country_code: toStr(country.iso_code),
    country_name: englishName(country),
    continent_code: toStr(continent.code),
    continent_name: englishName(continent),
    region: englishName(firstSubdivision) ?? toStr(firstSubdivision.iso_code),
    city: englishName(city),
    asn:
      traits.autonomous_system_number === null ||
      traits.autonomous_system_number === undefined
        ? null
        : `AS${traits.autonomous_system_number}`,
    as_domain: toStr(traits.domain),
    isp: toStr(traits.isp),
    organization:
      toStr(traits.organization) ??
      toStr(traits.autonomous_system_organization),
    network_cidr: toStr(traits.network),
    proxy_type: proxyType,
    usage_type: toStr(traits.user_type),
    connection_type: connectionType,
    risk_score: score,
    risk_level: riskLevelFromScore(score),
    is_proxy: anyBoolean([
      traits.is_public_proxy,
      traits.is_residential_proxy,
      traits.is_anonymous_proxy,
      traits.is_anonymous,
    ]),
    is_vpn: yesNoToBool(traits.is_anonymous_vpn),
    is_tor: yesNoToBool(traits.is_tor_exit_node),
    is_hosting: isHosting,
    is_mobile:
      traits.mobile_country_code || traits.mobile_network_code ? true : null,
    risk_reasons: riskReasons(payload),
    raw: payload,
  };
}

/**
 * MaxMind minFraud Score — this is MaxMind's IP scoring product line. The
 * GeoIP/GeoLite databases do not expose a numeric fraud score, so this provider
 * deliberately uses the official minFraud endpoint and maps `ip_address.risk`.
 */
export const maxmindProvider: IpProvider = {
  id: 'maxmind',
  name: 'MaxMind minFraud',
  category: 'risk',
  requiresKey: true,
  credentialEnv: ['MAXMIND_ACCOUNT_ID', 'MAXMIND_LICENSE_KEY'],
  // Pay-as-you-go prepaid balance — it never refills on its own. Raise the
  // configured budget after a manual top-up instead of waiting for a reset.
  billingPeriod: 'lifetime',
  sourceUrl: () => 'https://dev.maxmind.com/minfraud/',
  async lookup(ip, env, context) {
    const accountId = env.MAXMIND_ACCOUNT_ID ?? '';
    const licenseKey = env.MAXMIND_LICENSE_KEY ?? '';
    const url = env.MAXMIND_MINFRAUD_SCORE_URL ?? DEFAULT_MINFRAUD_SCORE_URL;
    const response = await fetch(url, {
      method: 'POST',
      signal: context.signal,
      headers: {
        accept: 'application/json',
        authorization: basicAuth(accountId, licenseKey),
        'content-type': 'application/json',
      },
      body: JSON.stringify({ device: { ip_address: ip } }),
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return parseMaxMindMinFraudResponse(asDict(await response.json()));
  },
};
