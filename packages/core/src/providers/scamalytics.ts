import { riskLevelFromScore } from '../schema.js';
import {
  asDict,
  fetchJson,
  first,
  toInt,
  toStr,
  yesNoToBool,
} from './helpers.js';
import type { IpProvider } from './types.js';

/**
 * Scamalytics fraud-score API. Responses are deeply nested and field names vary
 * by plan/version, so this parser is intentionally permissive (multi-key
 * `first()` lookups across the payload + external datasources). Ported from
 * search1api's `parse_scamalytics_response`.
 */
export const scamalyticsProvider: IpProvider = {
  id: 'scamalytics',
  name: 'Scamalytics',
  category: 'risk',
  requiresKey: true,
  credentialEnv: ['SCAMALYTICS_API_URL', 'SCAMALYTICS_API_KEY'],
  billingPeriod: 'month', // Scamalytics plans meter on a monthly quota
  sourceUrl: (ip) => `https://scamalytics.com/ip/${encodeURIComponent(ip)}`,
  async lookup(ip, env, context) {
    const url = new URL(env.SCAMALYTICS_API_URL ?? '');
    url.searchParams.set('key', env.SCAMALYTICS_API_KEY ?? '');
    url.searchParams.set('ip', ip);
    const payload = asDict(
      await fetchJson(url.toString(), { signal: context.signal })
    );

    const scamalytics = asDict(payload.scamalytics);
    const external = asDict(payload.external_datasources);
    const dbip = asDict(external.dbip);
    const ipinfo = asDict(external.ipinfo);
    const ip2proxy = asDict(external.ip2proxy);

    const riskScore = toInt(
      first(payload, [
        'score',
        'fraud_score',
        'risk_score',
        'scamalytics_score',
      ]) ??
        first(scamalytics, [
          'scamalytics_score',
          'score',
          'fraud_score',
          'risk_score',
        ])
    );

    let riskLevel = (first(payload, ['risk', 'risk_level']) ??
      first(scamalytics, [
        'scamalytics_risk',
        'risk',
        'risk_level',
      ])) as unknown;
    riskLevel =
      typeof riskLevel === 'string'
        ? riskLevel.toLowerCase()
        : riskLevelFromScore(riskScore);

    const proxyFlags = asDict(scamalytics.scamalytics_proxy);
    const isDatacenter = yesNoToBool(
      first(payload, ['is_datacenter', 'datacenter', 'is_hosting']) ??
        first(proxyFlags, ['is_datacenter'])
    );
    const isPublicProxy = yesNoToBool(
      first(payload, ['is_public_proxy', 'public_proxy', 'is_web_proxy'])
    );
    let isProxy = yesNoToBool(first(payload, ['is_proxy', 'proxy']));
    if (isProxy === null) {
      isProxy = isPublicProxy;
    }

    let proxyType =
      toStr(first(payload, ['proxy_type', 'type'])) ??
      toStr(first(ip2proxy, ['proxy_type', 'type']));
    if (isProxy === null && proxyType) {
      isProxy = true;
    }
    if (proxyType === null) {
      if (isPublicProxy) {
        proxyType = 'Public proxy';
      } else if (isDatacenter) {
        proxyType = 'Datacenter';
      }
    }

    return {
      country_code: toStr(
        first(payload, ['ip_country_code', 'country_code']) ??
          first(dbip, ['ip_country_code', 'country_code']) ??
          first(ipinfo, ['ip_country_code', 'country_code'])
      ),
      country_name: toStr(
        first(payload, ['ip_country_name', 'country_name', 'country']) ??
          first(dbip, ['ip_country_name', 'country_name', 'country']) ??
          first(ipinfo, ['ip_country_name', 'country_name', 'country'])
      ),
      region: toStr(
        first(payload, ['ip_region', 'region']) ??
          first(dbip, ['ip_state_name', 'ip_region', 'region'])
      ),
      city: toStr(
        first(payload, ['ip_city', 'city']) ?? first(dbip, ['ip_city', 'city'])
      ),
      asn: toStr(
        first(payload, ['asn', 'ip_asn']) ?? first(ipinfo, ['asn', 'ip_asn'])
      ),
      isp: toStr(
        first(payload, ['isp', 'isp_name']) ??
          first(scamalytics, ['scamalytics_isp', 'isp', 'isp_name']) ??
          first(dbip, ['isp_name', 'isp']) ??
          first(ipinfo, ['as_name', 'isp_name', 'isp'])
      ),
      organization: toStr(
        first(payload, ['organization', 'as_name', 'isp_name']) ??
          first(scamalytics, ['scamalytics_org', 'organization']) ??
          first(dbip, ['org_name', 'organization']) ??
          first(ipinfo, ['as_name', 'organization'])
      ),
      proxy_type: proxyType,
      risk_score: riskScore,
      risk_level: (riskLevel as 'low' | 'medium' | 'high' | null) ?? null,
      is_proxy: isProxy,
      is_vpn: yesNoToBool(
        first(payload, ['is_vpn', 'vpn']) ?? first(proxyFlags, ['is_vpn'])
      ),
      is_tor: yesNoToBool(
        first(payload, ['is_tor', 'tor']) ?? first(proxyFlags, ['is_tor'])
      ),
      is_hosting: isDatacenter,
      raw: payload,
    };
  },
};
