import { riskLevelFromScore } from '../schema.js';
import { asDict, fetchJson, toInt, toStr } from './helpers.js';
import type { IpProvider } from './types.js';

const DATACENTER_RE = /data ?center|hosting/i;

/**
 * AbuseIPDB — community abuse reports. The abuse confidence score (0-100) maps
 * directly onto our risk score; usageType indicates hosting/datacenter.
 */
export const abuseipdbProvider: IpProvider = {
  id: 'abuseipdb',
  name: 'AbuseIPDB',
  category: 'risk',
  requiresKey: true,
  credentialEnv: ['ABUSEIPDB_API_KEY'],
  sourceUrl: (ip) =>
    `https://www.abuseipdb.com/check/${encodeURIComponent(ip)}`,
  async lookup(ip, env, context) {
    const url = `https://api.abuseipdb.com/api/v2/check?ipAddress=${encodeURIComponent(ip)}&maxAgeInDays=90`;
    const payload = asDict(
      await fetchJson(url, {
        signal: context.signal,
        headers: {
          Key: env.ABUSEIPDB_API_KEY ?? '',
          accept: 'application/json',
        },
      })
    );
    const data = asDict(payload.data);
    const score = toInt(data.abuseConfidenceScore);
    const usageType = toStr(data.usageType);
    const isHosting = usageType ? DATACENTER_RE.test(usageType) : null;
    const totalReports = toInt(data.totalReports) ?? 0;
    return {
      country_code: toStr(data.countryCode),
      isp: toStr(data.isp),
      as_domain: toStr(data.domain),
      proxy_type: usageType,
      usage_type: usageType,
      risk_score: score,
      risk_level: riskLevelFromScore(score),
      is_hosting: isHosting,
      is_abuser: totalReports > 0 ? true : null,
      blocklists:
        totalReports > 0 ? [`AbuseIPDB (${totalReports} reports)`] : [],
      raw: payload,
    };
  },
};
