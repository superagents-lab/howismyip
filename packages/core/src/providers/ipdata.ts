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
 * The free tier exposes the threat booleans + blocklists but no numeric fraud
 * score, so we only set a risk score for IPs flagged as actually malicious
 * (known attacker/abuser/threat); proxy/datacenter status rides on the flags.
 */
export const ipdataProvider: IpProvider = {
  id: 'ipdata',
  name: 'ipdata.co',
  category: 'risk',
  requiresKey: true,
  sourceUrl: (ip) => `https://ipdata.co/?ip=${encodeURIComponent(ip)}`,
  isEnabled: (env) => Boolean(env.IPDATA_API_KEY),
  async lookup(ip, env) {
    const key = env.IPDATA_API_KEY ?? '';
    const url = `https://api.ipdata.co/${encodeURIComponent(ip)}?api-key=${encodeURIComponent(key)}`;
    const payload = asDict(await fetchJson(url));
    const asn = asDict(payload.asn);
    const threat = asDict(payload.threat);
    const carrier = asDict(payload.carrier);

    const malicious =
      yesNoToBool(threat.is_known_attacker) === true ||
      yesNoToBool(threat.is_known_abuser) === true ||
      yesNoToBool(threat.is_threat) === true;

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
      risk_score: malicious ? 100 : null,
      risk_level: malicious ? 'high' : null,
      is_proxy: yesNoToBool(threat.is_proxy),
      is_tor: yesNoToBool(threat.is_tor),
      is_hosting: yesNoToBool(threat.is_datacenter),
      is_mobile: carrier.name ? true : null,
      blocklists: blocklistNames(threat),
      raw: payload,
    };
  },
};
