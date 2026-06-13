import { asDict, fetchJson, toStr } from './helpers.js';
import type { IpProvider } from './types.js';

/**
 * IPinfo Lite — free token tier: country + continent + ASN attribution (no
 * risk signal). Parsing ported from search1api's `parse_ipinfo_lite_response`.
 */
export const ipinfoProvider: IpProvider = {
  id: 'ipinfo',
  name: 'IPinfo Lite',
  category: 'network',
  requiresKey: true,
  sourceUrl: (ip) => `https://ipinfo.io/${encodeURIComponent(ip)}`,
  isEnabled: (env) => Boolean(env.IPINFO_TOKEN),
  async lookup(ip, env) {
    const token = env.IPINFO_TOKEN ?? '';
    const url = `https://api.ipinfo.io/lite/${encodeURIComponent(ip)}?token=${encodeURIComponent(token)}`;
    const payload = asDict(await fetchJson(url));
    const asName = toStr(payload.as_name);
    return {
      country_code: toStr(payload.country_code),
      country_name: toStr(payload.country),
      continent_code: toStr(payload.continent_code),
      continent_name: toStr(payload.continent),
      asn: toStr(payload.asn),
      as_domain: toStr(payload.as_domain),
      isp: asName,
      organization: asName,
      raw: payload,
    };
  },
};
