import type { IpIntelligence } from '../schema.js';
import { riskLevelFromScore } from '../schema.js';
import { asDict, fetchJson, toInt, toStr, yesNoToBool } from './helpers.js';
import type { IpProvider } from './types.js';

const ABUSER_SCORE_RE = /^\s*([0-9]*\.?[0-9]+)(?:\s*\(([^)]+)\))?/;

function parseAbuserScore(value: unknown): {
  score: number | null;
  label: string | null;
} {
  const raw = toStr(value);
  if (!raw) {
    return { score: null, label: null };
  }
  const match = ABUSER_SCORE_RE.exec(raw);
  if (!match) {
    return { score: null, label: raw };
  }
  const n = Number.parseFloat(match[1] ?? '');
  return {
    score: Number.isFinite(n) ? Math.max(0, Math.min(100, n * 100)) : null,
    label: toStr(match[2]) ?? null,
  };
}

function typedAsn(value: unknown): string | null {
  const asn = toInt(value);
  return asn === null ? null : `AS${asn}`;
}

function proxyType(payload: Record<string, unknown>): string | null {
  const vpn = asDict(payload.vpn);
  if (yesNoToBool(payload.is_tor)) {
    return 'Tor';
  }
  if (yesNoToBool(payload.is_vpn)) {
    const service = toStr(vpn.service);
    const type = toStr(vpn.type);
    return [service, type].filter(Boolean).join(' · ') || 'VPN';
  }
  if (yesNoToBool(payload.is_proxy)) {
    return 'Proxy';
  }
  if (yesNoToBool(payload.is_datacenter)) {
    return 'Datacenter';
  }
  return null;
}

function riskReasons(
  payload: Record<string, unknown>,
  companyLabel: string | null,
  asnLabel: string | null
): string[] {
  const vpn = asDict(payload.vpn);
  const reasons = new Set<string>();
  if (companyLabel) {
    reasons.add(`Company abuse score: ${companyLabel}`);
  }
  if (asnLabel) {
    reasons.add(`ASN abuse score: ${asnLabel}`);
  }
  if (yesNoToBool(payload.is_vpn)) {
    const service = toStr(vpn.service);
    const type = toStr(vpn.type);
    reasons.add(['VPN', service, type].filter(Boolean).join(': '));
  }
  if (yesNoToBool(payload.is_abuser)) {
    reasons.add('Abuser');
  }
  if (yesNoToBool(payload.is_crawler)) {
    reasons.add('Crawler');
  }
  return Array.from(reasons);
}

export function parseIpapiIsResponse(
  payload: Record<string, unknown>
): Partial<IpIntelligence> | null {
  if (payload.error) {
    return null;
  }
  const company = asDict(payload.company);
  const asn = asDict(payload.asn);
  const location = asDict(payload.location);
  const abuse = asDict(payload.abuse);
  const companyScore = parseAbuserScore(company.abuser_score);
  const asnScore = parseAbuserScore(asn.abuser_score);
  const score = companyScore.score ?? asnScore.score;
  const asnType = toStr(asn.type);
  const companyType = toStr(company.type);
  const isDatacenter =
    yesNoToBool(payload.is_datacenter) ??
    (asnType === 'hosting' || companyType === 'hosting' ? true : null);

  return {
    country_code: toStr(location.country_code),
    country_name: toStr(location.country),
    continent_code: toStr(location.continent),
    region: toStr(location.state),
    city: toStr(location.city),
    asn: typedAsn(asn.asn),
    as_domain: toStr(asn.domain) ?? toStr(company.domain),
    isp: toStr(asn.org) ?? toStr(company.name),
    organization: toStr(company.name) ?? toStr(asn.org),
    proxy_type: proxyType(payload),
    usage_type: asnType,
    company_type: companyType,
    connection_type: toStr(asnType ?? companyType),
    risk_score: score,
    risk_level: riskLevelFromScore(score),
    is_proxy: yesNoToBool(payload.is_proxy),
    is_vpn: yesNoToBool(payload.is_vpn),
    is_tor: yesNoToBool(payload.is_tor),
    is_hosting: isDatacenter,
    is_abuser: yesNoToBool(payload.is_abuser),
    is_crawler: yesNoToBool(payload.is_crawler),
    rir: toStr(payload.rir) ?? toStr(asn.rir),
    network_cidr: toStr(asn.route),
    abuse_contact: toStr(asn.abuse) ?? toStr(abuse.email),
    risk_reasons: riskReasons(payload, companyScore.label, asnScore.label),
    raw: payload,
  };
}

/**
 * ipapi.is — keyless IP quality endpoint used by IPQuality's aggregation model.
 * It contributes usage/company type, abuse score, and proxy/VPN/Tor/datacenter/
 * crawler/abuser flags.
 */
export const ipapiIsProvider: IpProvider = {
  id: 'ipapi-is',
  name: 'ipapi.is',
  category: 'risk',
  requiresKey: false,
  sourceUrl: (ip) => `https://ipapi.is/?q=${encodeURIComponent(ip)}`,
  async lookup(ip, _env, context) {
    const payload = asDict(
      await fetchJson(`https://api.ipapi.is/?q=${encodeURIComponent(ip)}`, {
        signal: context.signal,
      })
    );
    return parseIpapiIsResponse(payload);
  },
};
