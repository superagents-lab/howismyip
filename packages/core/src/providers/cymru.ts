import { detectIpVersion, expandIpv6 } from '../ip.js';
import { dohResolve, toStr } from './helpers.js';
import type { IpProvider } from './types.js';

const WHITESPACE_RE = /\s+/;

/** Build the Team Cymru origin query name for an IP. */
function originQuery(ip: string): string | null {
  const version = detectIpVersion(ip);
  if (version === 4) {
    return `${ip.split('.').reverse().join('.')}.origin.asn.cymru.com`;
  }
  if (version === 6) {
    const groups = expandIpv6(ip);
    if (!groups) {
      return null;
    }
    const nibbles = groups.join('').split('').reverse().join('.');
    return `${nibbles}.origin6.asn.cymru.com`;
  }
  return null;
}

async function txt(name: string): Promise<string | null> {
  const records = await dohResolve(name, 'TXT');
  const first = records[0];
  return first && first.length > 0 ? first : null;
}

/**
 * Team Cymru IP-to-ASN over DNS-over-HTTPS — keyless. Authoritative BGP-derived
 * mapping: origin ASN, announced prefix, registry, and the AS name.
 *
 * origin record: "ASN | BGP Prefix | CC | Registry | Allocated"
 * asn record:    "ASN | CC | Registry | Allocated | AS Name"
 */
export const cymruProvider: IpProvider = {
  id: 'cymru',
  name: 'Team Cymru (BGP)',
  category: 'network',
  requiresKey: false,
  sourceUrl: (ip) =>
    `https://asn.cymru.com/cgi-bin/whois.cgi?action=do_whois&family=ipv4&bulk_paste=${encodeURIComponent(ip)}`,
  isEnabled: () => true,
  async lookup(ip) {
    const query = originQuery(ip);
    if (!query) {
      return null;
    }
    const originRaw = await txt(query);
    if (!originRaw) {
      return null;
    }
    const [asnField, prefix, cc, registry] = originRaw
      .split('|')
      .map((p) => p.trim());
    const asn = toStr(asnField?.split(WHITESPACE_RE)[0]);

    let asName: string | null = null;
    if (asn) {
      const asnRaw = await txt(`AS${asn}.asn.cymru.com`);
      if (asnRaw) {
        const parts = asnRaw.split('|').map((p) => p.trim());
        asName = toStr(parts[4]) ?? null;
      }
    }

    return {
      asn: asn ? `AS${asn}` : null,
      organization: asName,
      isp: asName,
      country_code: toStr(cc),
      network_cidr: toStr(prefix),
      rir: toStr(registry)?.toUpperCase() ?? null,
      raw: { origin: originRaw, as_name: asName },
    };
  },
};
