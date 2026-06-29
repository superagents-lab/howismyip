#!/usr/bin/env node
import { type IpReport, lookupIp } from '@howismyip/core';
import { renderReport } from './render.js';

const TRAILING_SLASH_RE = /\/+$/;

const HELP = `howismyip — multi-source IP intelligence

Usage:
  howismyip [ip] [--json]

Arguments:
  ip            IPv4/IPv6 to look up. Omit to check your own public IP.

Options:
  --json, -j    Print the raw aggregated JSON report.
  --help, -h    Show this help.

Environment:
  HOWISMYIP_BASE_URL   Query a deployed instance (e.g. https://howismyip.dev)
                       instead of running keyless sources locally. Unlocks any
                       paid providers configured on that server.
  Provider API keys    When running locally, export provider keys in your shell,
                       e.g. PROXYCHECK_API_KEY, IPINFO_TOKEN, IPQS_API_KEY.
`;

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  const body = await res.json();
  if (!res.ok) {
    const msg =
      body && typeof body === 'object' && 'error' in body
        ? String((body as { error: unknown }).error)
        : `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return body;
}

/** Discover the caller's own public IP via a keyless echo service. */
async function ownPublicIp(): Promise<string> {
  const data = (await fetchJson('https://api.ipify.org?format=json')) as {
    ip?: string;
  };
  if (!data.ip) {
    throw new Error('could not determine your public IP');
  }
  return data.ip;
}

async function resolveReport(
  ip: string | null,
  baseUrl: string | undefined
): Promise<IpReport> {
  if (baseUrl) {
    const base = baseUrl.replace(TRAILING_SLASH_RE, '');
    const url = ip
      ? `${base}/api/ip/${encodeURIComponent(ip)}`
      : `${base}/api/me`;
    return (await fetchJson(url)) as IpReport;
  }
  const target = ip ?? (await ownPublicIp());
  return lookupIp(target);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    process.stdout.write(HELP);
    return;
  }
  const asJson = args.includes('--json') || args.includes('-j');
  const ip = args.find((a) => !a.startsWith('-')) ?? null;

  const report = await resolveReport(ip, process.env.HOWISMYIP_BASE_URL);

  if (asJson) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    process.stdout.write(`${renderReport(report)}\n`);
  }
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`howismyip: ${message}\n`);
  process.exit(1);
});
