import { riskLevelFromScore } from '../schema.js';
import { asDict, fetchJson, toInt, toStr, yesNoToBool } from './helpers.js';
import type { IpProvider } from './types.js';

const DATACENTER_RE = /data ?center|hosting/i;
// Free-tier IPQS returns this placeholder for premium-only fields.
const PREMIUM_PLACEHOLDER_RE = /premium|required/i;

/**
 * IPQualityScore — proxy/VPN/Tor + fraud scoring. `fraud_score` (0-100) maps to
 * our risk score; `connection_type` drives the hosting/mobile flags.
 */
export const ipqsProvider: IpProvider = {
  id: 'ipqs',
  name: 'IPQualityScore',
  category: 'risk',
  requiresKey: true,
  sourceUrl: (ip) =>
    `https://www.ipqualityscore.com/free-ip-lookup-proxy-vpn-test/lookup/${encodeURIComponent(ip)}`,
  isEnabled: (env) => Boolean(env.IPQS_API_KEY),
  async lookup(ip, env) {
    const key = env.IPQS_API_KEY ?? '';
    const url = `https://ipqualityscore.com/api/json/ip/${encodeURIComponent(key)}/${encodeURIComponent(ip)}?strictness=1`;
    const payload = asDict(await fetchJson(url));
    if (payload.success === false) {
      return null;
    }
    const score = toInt(payload.fraud_score);
    const asn = toInt(payload.ASN);
    const rawConnectionType = toStr(payload.connection_type);
    const connectionType =
      rawConnectionType && PREMIUM_PLACEHOLDER_RE.test(rawConnectionType)
        ? null
        : rawConnectionType;
    return {
      country_code: toStr(payload.country_code),
      region: toStr(payload.region),
      city: toStr(payload.city),
      asn: asn === null ? null : `AS${asn}`,
      isp: toStr(payload.ISP),
      organization: toStr(payload.organization),
      proxy_type: connectionType,
      connection_type: connectionType,
      risk_score: score,
      risk_level: riskLevelFromScore(score),
      is_proxy: yesNoToBool(payload.proxy),
      is_vpn: yesNoToBool(payload.vpn),
      is_tor: yesNoToBool(payload.tor),
      is_hosting: connectionType ? DATACENTER_RE.test(connectionType) : null,
      is_mobile:
        yesNoToBool(payload.mobile) ??
        (connectionType === 'Mobile' ? true : null),
      is_abuser: yesNoToBool(payload.recent_abuse),
      is_crawler: yesNoToBool(payload.bot_status),
      raw: payload,
    };
  },
};
