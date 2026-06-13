/** IP parsing/validation utilities. Zero deps — used by the DNS-based providers. */

export type IpVersion = 4 | 6;

const IPV4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const IPV6_CHARS_RE = /^[0-9a-fA-F:]+$/;
const HEX_GROUP_RE = /^[0-9a-fA-F]{1,4}$/;

export function detectIpVersion(ip: string): IpVersion | null {
  if (IPV4_RE.test(ip)) {
    const octets = ip.split('.').map(Number);
    return octets.every((o) => o >= 0 && o <= 255) ? 4 : null;
  }
  // IPv6: loose but practical — hex groups and/or "::" compression.
  if (IPV6_CHARS_RE.test(ip) && ip.includes(':') && expandIpv6(ip) !== null) {
    return 6;
  }
  return null;
}

export function isValidIp(ip: string): boolean {
  return detectIpVersion(ip) !== null;
}

/** Expand an IPv6 address to 8 four-hex-digit groups; null if malformed. */
export function expandIpv6(ip: string): string[] | null {
  const halves = ip.split('::');
  if (halves.length > 2) {
    return null;
  }
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  let groups: string[];
  if (halves.length === 2) {
    const missing = 8 - head.length - tail.length;
    if (missing < 0) {
      return null;
    }
    groups = [...head, ...new Array(missing).fill('0'), ...tail];
  } else {
    groups = head;
  }
  if (groups.length !== 8) {
    return null;
  }
  const out: string[] = [];
  for (const g of groups) {
    if (!HEX_GROUP_RE.test(g)) {
      return null;
    }
    out.push(g.padStart(4, '0').toLowerCase());
  }
  return out;
}

/** Reverse-DNS label prefix (no zone suffix), e.g. "4.3.2.1" for 1.2.3.4. */
export function reverseLabels(ip: string): string | null {
  const version = detectIpVersion(ip);
  if (version === 4) {
    return ip.split('.').reverse().join('.');
  }
  if (version === 6) {
    const groups = expandIpv6(ip);
    if (!groups) {
      return null;
    }
    return groups.join('').split('').reverse().join('.');
  }
  return null;
}

const PRIVATE_V4 = [
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^0\./,
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, // CGNAT 100.64/10
];

/** True for private / loopback / link-local / reserved ranges. */
export function isPrivateOrReserved(ip: string): boolean {
  const version = detectIpVersion(ip);
  if (version === 4) {
    return PRIVATE_V4.some((re) => re.test(ip));
  }
  if (version === 6) {
    const lower = ip.toLowerCase();
    return (
      lower === '::1' ||
      lower === '::' ||
      lower.startsWith('fe80:') ||
      lower.startsWith('fc') ||
      lower.startsWith('fd')
    );
  }
  return false;
}
