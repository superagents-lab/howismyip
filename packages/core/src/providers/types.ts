import type { IpIntelligence, ProviderCategory } from '../schema.js';

/**
 * Environment a provider reads its credentials from. In the web app this is
 * `process.env`; in the CLI the same. Keyless providers ignore it entirely.
 */
export type Env = Record<string, string | undefined>;

/**
 * A data source adapter. Each provider hides one upstream API's quirks behind
 * a single `lookup` that returns a partial normalized record (only the fields
 * it actually knows). The aggregator handles concurrency, timing, and merging.
 */
export interface IpProvider {
  /** Stable machine id, e.g. "ip-api", "rdap". */
  id: string;
  /** Human-facing name shown on the source card. */
  name: string;
  category: ProviderCategory;
  /** Whether this provider needs credentials to run at all. */
  requiresKey: boolean;
  /** Link to the provider's own page for this IP (for "view at source"). */
  sourceUrl(ip: string): string;
  /** Keyless providers return true always; keyed ones only when creds exist. */
  isEnabled(env: Env): boolean;
  /**
   * Perform the lookup. Return a partial record (merged onto an empty one), or
   * `null` when the provider has nothing useful for this IP. Throwing is fine —
   * the aggregator records it as an error without failing the whole report.
   */
  lookup(ip: string, env: Env): Promise<Partial<IpIntelligence> | null>;
}
