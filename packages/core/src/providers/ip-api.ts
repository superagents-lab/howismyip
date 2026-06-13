import { asDict, fetchJson, toStr, yesNoToBool } from './helpers.js';
import type { IpProvider } from './types.js';

const ASN_PREFIX_RE = /^AS\d+/i;

const FIELDS = [
  'status',
  'message',
  'continent',
  'continentCode',
  'country',
  'countryCode',
  'region',
  'regionName',
  'city',
  'isp',
  'org',
  'as',
  'asname',
  'mobile',
  'proxy',
  'hosting',
  'query',
].join(',');

/** Extract the "AS15169" token from ip-api's combined `as` field. */
function parseAsn(value: unknown): string | null {
  const raw = toStr(value);
  if (!raw) {
    return null;
  }
  const match = raw.match(ASN_PREFIX_RE);
  return match ? match[0].toUpperCase() : null;
}

/**
 * ip-api.com — keyless, no token. Free tier (HTTP only) returns geolocation,
 * ISP/org, ASN, and the proxy/hosting/mobile classification flags. ~45 req/min.
 */
export const ipApiProvider: IpProvider = {
  id: 'ip-api',
  name: 'ip-api.com',
  category: 'geo',
  requiresKey: false,
  sourceUrl: (ip) => `https://ip-api.com/#${encodeURIComponent(ip)}`,
  isEnabled: () => true,
  async lookup(ip) {
    const payload = asDict(
      await fetchJson(
        `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=${FIELDS}`
      )
    );
    if (payload.status !== 'success') {
      return null;
    }
    const proxy = yesNoToBool(payload.proxy);
    const hosting = yesNoToBool(payload.hosting);
    return {
      country_code: toStr(payload.countryCode),
      country_name: toStr(payload.country),
      continent_code: toStr(payload.continentCode),
      continent_name: toStr(payload.continent),
      region: toStr(payload.regionName),
      city: toStr(payload.city),
      asn: parseAsn(payload.as),
      isp: toStr(payload.isp),
      organization: toStr(payload.org) ?? toStr(payload.asname),
      proxy_type: hosting ? 'Hosting' : null,
      is_proxy: proxy,
      is_hosting: hosting,
      is_mobile: yesNoToBool(payload.mobile),
      raw: payload,
    };
  },
};
