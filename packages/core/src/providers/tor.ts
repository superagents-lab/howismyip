import { USER_AGENT } from './helpers.js';
import type { IpProvider } from './types.js';

const EXIT_LIST_URL = 'https://check.torproject.org/torbulkexitlist';
const TTL_MS = 60 * 60 * 1000; // refresh the public list at most hourly

// Process-lifetime memo of the public exit list. Not persistence — just avoids
// re-downloading a ~kB list on every request. Survives only in-memory.
let cache: { ips: Set<string>; fetchedAt: number } | null = null;

async function exitNodes(): Promise<Set<string>> {
  const now = Date.now();
  if (cache && now - cache.fetchedAt < TTL_MS) {
    return cache.ips;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(EXIT_LIST_URL, {
      signal: controller.signal,
      headers: { 'user-agent': USER_AGENT },
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const text = await response.text();
    const ips = new Set(
      text
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !line.startsWith('#'))
    );
    cache = { ips, fetchedAt: now };
    return ips;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Tor exit-node membership — keyless. Checks the IP against the official Tor
 * Project bulk exit list. An exit node is a strong "this is anonymized traffic"
 * signal, so a hit sets is_tor + a maxed risk score.
 */
export const torProvider: IpProvider = {
  id: 'tor',
  name: 'Tor exit list',
  category: 'risk',
  requiresKey: false,
  sourceUrl: (ip) =>
    `https://metrics.torproject.org/rs.html#search/${encodeURIComponent(ip)}`,
  isEnabled: () => true,
  async lookup(ip) {
    const isExit = (await exitNodes()).has(ip);
    return {
      is_tor: isExit,
      proxy_type: isExit ? 'Tor' : null,
      risk_score: isExit ? 100 : null,
      risk_level: isExit ? 'high' : null,
      raw: { is_tor_exit: isExit },
    };
  },
};
