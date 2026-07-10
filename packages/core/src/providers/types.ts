import type { IpIntelligence, ProviderCategory } from '../schema.js';

/**
 * Environment a provider reads its credentials from. In the web app this is
 * the runtime environment; in the CLI this is `process.env`. The same object
 * also carries unified provider switches and timeout settings.
 */
export type Env = Record<string, string | undefined>;

export interface ProviderLookupContext {
  signal: AbortSignal;
  timeoutMs: number;
}

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
  /** Environment variables that must be present when `requiresKey` is true. */
  credentialEnv?: string[];
  /**
   * Real-world billing cycle this provider's `HOWISMYIP_DAILY_BUDGETS` number
   * is measured against. `'day'` (default) and `'month'` reset on UTC calendar
   * boundaries. `'lifetime'` never resets — for prepaid/pay-as-you-go balances
   * (e.g. MaxMind): raise the configured number after a manual top-up instead
   * of waiting for a reset that will never come.
   */
  billingPeriod?: 'day' | 'month' | 'lifetime';
  /** Link to the provider's own page for this IP (for "view at source"). */
  sourceUrl(ip: string): string;
  /**
   * Perform the lookup. Return a partial record (merged onto an empty one), or
   * `null` when the provider has nothing useful for this IP. Throwing is fine —
   * the aggregator records it as an error without failing the whole report.
   */
  lookup(
    ip: string,
    env: Env,
    context: ProviderLookupContext
  ): Promise<Partial<IpIntelligence> | null>;
}
