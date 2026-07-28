import { asDict, fetchJson, toStr } from './helpers.js';
import type { IpProvider } from './types.js';

/** Pull the first email out of a jCard (vcardArray) entry. */
function emailFromVcard(entity: Record<string, unknown>): string | null {
  const vcard = entity.vcardArray;
  if (!Array.isArray(vcard) || vcard.length < 2 || !Array.isArray(vcard[1])) {
    return null;
  }
  for (const field of vcard[1] as unknown[]) {
    if (
      Array.isArray(field) &&
      field[0] === 'email' &&
      typeof field[3] === 'string'
    ) {
      return field[3];
    }
  }
  return null;
}

/** Recursively search entities for one holding the "abuse" role and return its email. */
function findAbuseContact(entities: unknown): string | null {
  if (!Array.isArray(entities)) {
    return null;
  }
  for (const raw of entities) {
    const entity = asDict(raw);
    const roles = Array.isArray(entity.roles) ? entity.roles : [];
    if (roles.includes('abuse')) {
      const email = emailFromVcard(entity);
      if (email) {
        return email;
      }
    }
    const nested = findAbuseContact(entity.entities);
    if (nested) {
      return nested;
    }
  }
  return null;
}

/** Map the responding RDAP server / whois host to a RIR name. */
function inferRir(payload: Record<string, unknown>): string | null {
  const port43 = toStr(payload.port43)?.toLowerCase() ?? '';
  const links = Array.isArray(payload.links) ? payload.links : [];
  const hrefs = links
    .map((l) => toStr(asDict(l).href)?.toLowerCase() ?? '')
    .join(' ');
  const haystack = `${port43} ${hrefs}`;
  if (haystack.includes('arin')) {
    return 'ARIN';
  }
  if (haystack.includes('ripe')) {
    return 'RIPE';
  }
  if (haystack.includes('apnic')) {
    return 'APNIC';
  }
  if (haystack.includes('lacnic')) {
    return 'LACNIC';
  }
  if (haystack.includes('afrinic')) {
    return 'AFRINIC';
  }
  return null;
}

function registrationDate(payload: Record<string, unknown>): string | null {
  const events = Array.isArray(payload.events) ? payload.events : [];
  for (const raw of events) {
    const event = asDict(raw);
    if (event.eventAction === 'registration') {
      return toStr(event.eventDate);
    }
  }
  return null;
}

function cidr(payload: Record<string, unknown>): string | null {
  const cidrs = payload.cidr0_cidrs;
  if (Array.isArray(cidrs) && cidrs.length > 0) {
    const entry = asDict(cidrs[0]);
    const prefix = toStr(entry.v4prefix) ?? toStr(entry.v6prefix);
    const length = entry.length;
    if (prefix && (typeof length === 'number' || typeof length === 'string')) {
      return `${prefix}/${length}`;
    }
  }
  return null;
}

/**
 * RDAP via rdap.org bootstrap — keyless, authoritative. Returns the registry
 * allocation: owning RIR, network name, allocated CIDR, registration date, and
 * the published abuse contact. This is WHOIS done right (structured JSON).
 */
export const rdapProvider: IpProvider = {
  id: 'rdap',
  name: 'RDAP (registry)',
  category: 'registry',
  requiresKey: false,
  sourceUrl: (ip) => `https://rdap.org/ip/${encodeURIComponent(ip)}`,
  async lookup(ip, _env, context) {
    const payload = asDict(
      await fetchJson(`https://rdap.org/ip/${encodeURIComponent(ip)}`, {
        signal: context.signal,
        headers: { accept: 'application/rdap+json' },
      })
    );
    if (!(payload.handle || payload.startAddress)) {
      return null;
    }
    return {
      registered_country_code: toStr(payload.country),
      organization: toStr(payload.name),
      rir: inferRir(payload),
      allocation_cidr: cidr(payload),
      allocation_date: registrationDate(payload),
      abuse_contact: findAbuseContact(payload.entities),
      raw: payload,
    };
  },
};
