import { asDict, fetchJson, toStr, yesNoToBool } from './helpers.js';
import type { IpProvider } from './types.js';

/** ipdata.co blocklists come as objects; pull their names. */
function blocklistNames(threat: Record<string, unknown>): string[] {
  const list = threat.blocklists;
  if (!Array.isArray(list)) {
    return [];
  }
  return list
    .map((b) => toStr(asDict(b).name))
    .filter((n): n is string => Boolean(n));
}

/**
 * ipdata.co — geolocation + a rich `threat` block (proxy / Tor / datacenter /
 * anonymous / known-attacker) and an `asn.type` field that classifies the
 * network as isp / hosting / business / education. That asn.type is the
 * clearest single signal for the "ISP proxy vs datacenter" question.
 *
 * The free tier exposes the threat booleans + blocklists but no native numeric
 * fraud score. Treat the explicit threat block as a binary provider verdict:
 * malicious flags score 100, explicit clean threat fields score 0.
 */
export const ipdataProvider: IpProvider = {
  id: 'ipdata',
  name: 'ipdata.co',
  category: 'risk',
  requiresKey: true,
  credentialEnv: ['IPDATA_API_KEY'],
  sourceUrl: (ip) => `https://ipdata.co/?ip=${encodeURIComponent(ip)}`,
  async lookup(ip, env, context) {
    const key = env.IPDATA_API_KEY ?? '';
    const url = `https://api.ipdata.co/${encodeURIComponent(ip)}?api-key=${encodeURIComponent(key)}`;
    const payload = asDict(await fetchJson(url, { signal: context.signal }));
    const asn = asDict(payload.asn);
    const threat = asDict(payload.threat);
    const carrier = asDict(payload.carrier);

    const knownAttacker = yesNoToBool(threat.is_known_attacker);
    const knownAbuser = yesNoToBool(threat.is_known_abuser);
    const knownThreat = yesNoToBool(threat.is_threat);
    const malicious =
      knownAttacker === true || knownAbuser === true || knownThreat === true;
    const hasThreatVerdict =
      knownAttacker !== null || knownAbuser !== null || knownThreat !== null;
    let riskScore: number | null = null;
    if (malicious) {
      riskScore = 100;
    } else if (hasThreatVerdict) {
      riskScore = 0;
    }

    let riskLevel: 'low' | 'high' | null = null;
    if (riskScore === 100) {
      riskLevel = 'high';
    } else if (riskScore === 0) {
      riskLevel = 'low';
    }
    let isAbuser: boolean | null = null;
    if (malicious) {
      isAbuser = true;
    } else if (hasThreatVerdict) {
      isAbuser = false;
    }

    return {
      country_code: toStr(payload.country_code),
      country_name: toStr(payload.country_name),
      continent_code: toStr(payload.continent_code),
      continent_name: toStr(payload.continent_name),
      region: toStr(payload.region),
      city: toStr(payload.city),
      asn: toStr(asn.asn),
      as_domain: toStr(asn.domain),
      isp: toStr(asn.name),
      organization: toStr(asn.name),
      proxy_type: toStr(asn.type),
      usage_type: toStr(asn.type),
      company_type: toStr(asn.type),
      connection_type: toStr(asn.type),
      risk_score: riskScore,
      risk_level: riskLevel,
      is_proxy: yesNoToBool(threat.is_proxy),
      is_tor: yesNoToBool(threat.is_tor),
      is_hosting: yesNoToBool(threat.is_datacenter),
      is_mobile: carrier.name ? true : null,
      is_abuser: isAbuser,
      blocklists: blocklistNames(threat),
      raw: payload,
    };
  },
};
