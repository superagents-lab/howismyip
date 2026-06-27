import { asDict, fetchJson, toInt, toStr } from './helpers.js';
import type { IpProvider } from './types.js';

/**
 * GeoJS — keyless, HTTPS, server-friendly (unlike ipwho.is, whose free plan
 * blocks server-side fetches). Geolocation plus origin ASN and organization,
 * used as an independent cross-check on geo + ASN.
 */
export const geojsProvider: IpProvider = {
  id: 'geojs',
  name: 'GeoJS',
  category: 'network',
  requiresKey: false,
  sourceUrl: (ip) =>
    `https://get.geojs.io/v1/ip/geo/${encodeURIComponent(ip)}.json`,
  async lookup(ip, _env, context) {
    const payload = asDict(
      await fetchJson(
        `https://get.geojs.io/v1/ip/geo/${encodeURIComponent(ip)}.json`,
        { signal: context.signal }
      )
    );
    const asn = toInt(payload.asn);
    const orgName = toStr(payload.organization_name);
    return {
      country_code: toStr(payload.country_code),
      country_name: toStr(payload.country),
      continent_code: toStr(payload.continent_code),
      region: toStr(payload.region),
      city: toStr(payload.city),
      asn: asn === null ? null : `AS${asn}`,
      isp: orgName,
      organization: orgName,
      raw: payload,
    };
  },
};
