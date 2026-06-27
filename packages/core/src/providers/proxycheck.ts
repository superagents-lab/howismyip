import { riskLevelFromScore } from '../schema.js';
import { asDict, fetchJson, toInt, toStr, yesNoToBool } from './helpers.js';
import type { IpProvider } from './types.js';

/**
 * proxycheck.io — adds a fraud/risk score plus proxy/VPN/Tor/hosting flags.
 * Requires a (free-tier) key. Parsing ported from search1api's
 * `parse_proxycheck_response`.
 */
export const proxycheckProvider: IpProvider = {
  id: 'proxycheck',
  name: 'proxycheck.io',
  category: 'risk',
  requiresKey: true,
  credentialEnv: ['PROXYCHECK_API_KEY'],
  sourceUrl: (ip) => `https://proxycheck.io/v3/${encodeURIComponent(ip)}`,
  async lookup(ip, env, context) {
    const key = env.PROXYCHECK_API_KEY ?? '';
    const url = `https://proxycheck.io/v2/${encodeURIComponent(ip)}?vpn=1&asn=1&risk=1&key=${encodeURIComponent(key)}`;
    const payload = asDict(await fetchJson(url, { signal: context.signal }));
    const ipData = asDict(payload[ip]);
    const riskScore = toInt(ipData.risk);
    const proxyType = toStr(ipData.type);
    return {
      country_code: toStr(ipData.isocode),
      country_name: toStr(ipData.country),
      region: toStr(ipData.region),
      city: toStr(ipData.city),
      asn: toStr(ipData.asn),
      isp: toStr(ipData.provider),
      organization: toStr(ipData.organisation) ?? toStr(ipData.organization),
      proxy_type: proxyType,
      connection_type: proxyType,
      risk_score: riskScore,
      risk_level: riskLevelFromScore(riskScore),
      is_proxy: yesNoToBool(ipData.proxy),
      is_vpn: yesNoToBool(ipData.vpn),
      is_tor: proxyType === 'TOR' || yesNoToBool(ipData.tor),
      is_hosting: proxyType === 'Hosting' || yesNoToBool(ipData.hosting),
      raw: payload,
    };
  },
};
