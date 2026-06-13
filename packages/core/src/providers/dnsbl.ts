import { detectIpVersion } from '../ip.js';
import { riskLevelFromScore } from '../schema.js';
import { dohResolve } from './helpers.js';
import type { IpProvider } from './types.js';

/** DNS blocklists keyed by a friendly label. v4-only (the common case for DNSBLs). */
const ZONES: Record<string, string> = {
  Spamhaus: 'zen.spamhaus.org',
  SpamCop: 'bl.spamcop.net',
  DroneBL: 'dnsbl.dronebl.org',
  's5h.net': 'all.s5h.net',
};

/**
 * A genuine listing returns a 127.0.0.x answer (x < 255). Codes in
 * 127.255.255.x are NOT listings — they signal the query was rejected
 * (e.g. issued through a large public DNS resolver, or over quota), which
 * Spamhaus and others use heavily. Treating those as "listed" produces false
 * positives, so we filter them out. NXDOMAIN → [] → not listed.
 */
async function isListed(query: string): Promise<boolean> {
  const answers = await dohResolve(query, 'A');
  return answers.some(
    (a) => a.startsWith('127.') && !a.startsWith('127.255.255.')
  );
}

/**
 * DNS blocklist (DNSBL) check — keyless. Queries several public reputation
 * lists in parallel and reports which ones flag the IP. Each hit raises the
 * risk score; an empty result means clean across all checked lists.
 */
export const dnsblProvider: IpProvider = {
  id: 'dnsbl',
  name: 'DNS blocklists',
  category: 'blocklist',
  requiresKey: false,
  sourceUrl: (ip) =>
    `https://multirbl.valli.org/lookup/${encodeURIComponent(ip)}.html`,
  isEnabled: () => true,
  async lookup(ip) {
    if (detectIpVersion(ip) !== 4) {
      return null; // these lists are IPv4-only
    }
    const reversed = ip.split('.').reverse().join('.');
    const checks = await Promise.all(
      Object.entries(ZONES).map(async ([label, zone]) => ({
        label,
        listed: await isListed(`${reversed}.${zone}`),
      }))
    );
    const blocklists = checks.filter((c) => c.listed).map((c) => c.label);
    const score =
      blocklists.length === 0 ? 0 : Math.min(100, blocklists.length * 40);
    return {
      blocklists,
      risk_score: score,
      risk_level: riskLevelFromScore(score),
      raw: { checked: Object.keys(ZONES), listed: blocklists },
    };
  },
};
