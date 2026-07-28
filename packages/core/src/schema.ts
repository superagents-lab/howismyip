/**
 * Normalized IP intelligence shape shared by every provider, the web UI, the
 * public JSON API, and the CLI.
 *
 * Modeled on the proven `ProxyIPIntelligence` shape from search1api, extended
 * with registry (RDAP/Cymru) and blocklist dimensions. Providers fill in
 * whatever they know and leave the rest `null` — the aggregator merges across
 * sources, it never assumes a single provider is complete.
 */

export type RiskLevel = 'low' | 'medium' | 'high';
export type RpkiStatus =
  | 'valid'
  | 'invalid_asn'
  | 'invalid_length'
  | 'unknown'
  | 'mixed';

/** Coarse classification of what a provider contributes. Drives UI card variants. */
export type ProviderCategory =
  | 'geo' // location + ISP, no risk signal
  | 'network' // ASN / routing attribution
  | 'risk' // fraud / proxy / abuse scoring
  | 'registry' // authoritative WHOIS/RDAP allocation data
  | 'blocklist'; // presence on threat feeds / upstream blocklists

/** A single normalized record from one provider. */
export interface IpIntelligence {
  ip: string;

  // geo
  country_code: string | null;
  country_name: string | null;
  continent_code: string | null;
  continent_name: string | null;
  region: string | null;
  city: string | null;

  // registry/allocation geography — deliberately separate from geolocation
  registered_country_code: string | null;

  // network / ASN
  asn: string | null;
  as_domain: string | null;
  isp: string | null;
  organization: string | null;
  announced_prefix: string | null;
  ptr: string | null;
  is_announced: boolean | null;
  origin_asns: string[];
  origin_holders: string[];
  rpki_status: RpkiStatus | null;

  // risk / classification
  proxy_type: string | null;
  usage_type: string | null;
  company_type: string | null;
  connection_type: string | null;
  risk_score: number | null; // 0-100, higher = riskier
  risk_level: RiskLevel | null;
  is_proxy: boolean | null;
  is_vpn: boolean | null;
  is_tor: boolean | null;
  is_hosting: boolean | null;
  is_mobile: boolean | null;
  is_abuser: boolean | null;
  is_crawler: boolean | null;
  is_anycast: boolean | null;
  is_relay: boolean | null;
  is_residential_proxy: boolean | null;

  // registry (RDAP / Team Cymru)
  rir: string | null; // ARIN / RIPE / APNIC / LACNIC / AFRINIC
  allocation_cidr: string | null; // registry allocation, e.g. 8.8.8.0/24
  allocation_date: string | null; // ISO date
  abuse_contact: string | null;

  // blocklist
  blocklists: string[]; // names of lists the IP was found on (empty = clean)
  risk_reasons: string[]; // provider-specific reason codes / labels

  // provenance
  // Opaque upstream JSON. Typed `any` (not `unknown`) so TanStack Start's
  // server-fn serializer accepts it — it's real JSON, just not statically known.
  // biome-ignore lint/suspicious/noExplicitAny: arbitrary upstream provider payload
  raw: any; // untouched provider payload, for audit / "view source"
}

/** Wraps a provider lookup with timing + status so the UI can show partial failures. */
export interface ProviderResult {
  id: string;
  name: string;
  category: ProviderCategory;
  requiresKey: boolean;
  sourceUrl: string;
  status: 'ok' | 'empty' | 'error' | 'skipped';
  durationMs: number;
  data: IpIntelligence | null;
  error: string | null;
}

/** Merged "best guess" view across all successful providers. Factual fields only —
 *  no composite score or risk verdict (each source's own scores/flags live in its
 *  per-source record). */
export interface Consensus {
  country_code: string | null;
  country_name: string | null;
  city: string | null;
  asn: string | null;
  isp: string | null;
  organization: string | null;
  rir: string | null;
  registered_country_code: string | null;
  blocklists: string[]; // union across sources (factual: which lists the IP is on)
  /** How many providers contributed a non-empty record. */
  source_count: number;
}

export type FactKey =
  | 'country'
  | 'city'
  | 'region'
  | 'registration_country'
  | 'rir'
  | 'allocation'
  | 'asn'
  | 'isp'
  | 'organization'
  | 'announced_prefix'
  | 'ptr'
  | 'announcement'
  | 'origin_asn'
  | 'origin_holder'
  | 'rpki';

export interface FactValue {
  value: string;
  sources: string[];
}

/** Source-transparent factual fields for the basic identity card.
 *  Unlike `consensus`, this never picks a winner: disagreements stay visible. */
export interface FactSummary {
  key: FactKey;
  values: FactValue[];
  source_count: number;
  conflict: boolean;
}

/** Final aggregated payload returned by `lookupIp`. */
export interface IpReport {
  ip: string;
  queried_at: string; // ISO timestamp
  consensus: Consensus;
  facts: FactSummary[];
  sources: ProviderResult[];
}

/** Empty normalized record for a given IP, so providers only set what they know. */
export function emptyIntelligence(ip: string): IpIntelligence {
  return {
    ip,
    country_code: null,
    country_name: null,
    continent_code: null,
    continent_name: null,
    region: null,
    city: null,
    registered_country_code: null,
    asn: null,
    as_domain: null,
    isp: null,
    organization: null,
    announced_prefix: null,
    ptr: null,
    is_announced: null,
    origin_asns: [],
    origin_holders: [],
    rpki_status: null,
    proxy_type: null,
    usage_type: null,
    company_type: null,
    connection_type: null,
    risk_score: null,
    risk_level: null,
    is_proxy: null,
    is_vpn: null,
    is_tor: null,
    is_hosting: null,
    is_mobile: null,
    is_abuser: null,
    is_crawler: null,
    is_anycast: null,
    is_relay: null,
    is_residential_proxy: null,
    rir: null,
    allocation_cidr: null,
    allocation_date: null,
    abuse_contact: null,
    blocklists: [],
    risk_reasons: [],
    raw: null,
  };
}

/** Derive a coarse risk level from a 0-100 score (matches search1api thresholds). */
export function riskLevelFromScore(score: number | null): RiskLevel | null {
  if (score === null) {
    return null;
  }
  if (score >= 75) {
    return 'high';
  }
  if (score >= 40) {
    return 'medium';
  }
  return 'low';
}
