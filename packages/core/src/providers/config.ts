import type { Env, IpProvider } from './types.js';

/**
 * The whole configuration surface is three variables (plus per-provider
 * credentials): a disable list, a daily-budget table, and a shared timeout.
 * Provider ids are used verbatim (e.g. `ip-api`, `ipapi-is`) — no name
 * mangling to learn.
 */
export const DISABLED_PROVIDERS_ENV = 'HOWISMYIP_DISABLED_PROVIDERS';
export const DAILY_BUDGETS_ENV = 'HOWISMYIP_DAILY_BUDGETS';

const DEFAULT_PROVIDER_TIMEOUT_MS = 10_000;
const MIN_PROVIDER_TIMEOUT_MS = 100;

/** Ids listed in `HOWISMYIP_DISABLED_PROVIDERS` (comma-separated). */
function disabledProviderIds(env: Env): Set<string> {
  const raw = env[DISABLED_PROVIDERS_ENV] ?? '';
  return new Set(
    raw
      .split(',')
      .map((id) => id.trim().toLowerCase())
      .filter(Boolean)
  );
}

function hasCredentials(provider: IpProvider, env: Env): boolean {
  if (!provider.requiresKey) {
    return true;
  }
  const keys = provider.credentialEnv ?? [];
  if (keys.length === 0) {
    return false;
  }
  return keys.every((key) => {
    const value = env[key];
    return value !== undefined && value.trim() !== '';
  });
}

/**
 * Optional per-provider daily call budget (UTC day), for hosted deployments
 * living on limited upstream plans. Configured as one table:
 * `HOWISMYIP_DAILY_BUDGETS=proxycheck:900,abuseipdb:900`. A provider not in
 * the table (or with an invalid value) is unlimited; `0` is valid and means
 * "never call" while still listing the provider.
 */
export function providerDailyBudget(
  provider: IpProvider,
  env: Env
): number | null {
  const raw = env[DAILY_BUDGETS_ENV];
  if (raw === undefined || raw.trim() === '') {
    return null;
  }
  for (const entry of raw.split(',')) {
    const [id, value] = entry.split(':');
    if (id?.trim().toLowerCase() !== provider.id) {
      continue;
    }
    const parsed = Number.parseInt(value ?? '', 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  }
  return null;
}

/** Enabled unless listed in the disable list; keyed providers additionally
 *  need all of their credentials present. */
export function isProviderEnabled(provider: IpProvider, env: Env): boolean {
  if (disabledProviderIds(env).has(provider.id)) {
    return false;
  }
  return hasCredentials(provider, env);
}

export function providerTimeoutMs(env: Env): number {
  const raw = env.HOWISMYIP_PROVIDER_TIMEOUT_MS;
  const parsed = raw ? Number.parseInt(raw, 10) : null;
  if (
    parsed === null ||
    !Number.isFinite(parsed) ||
    parsed < MIN_PROVIDER_TIMEOUT_MS
  ) {
    return DEFAULT_PROVIDER_TIMEOUT_MS;
  }
  return parsed;
}
