import type { Env, IpProvider } from './types.js';

const DEFAULT_PROVIDER_TIMEOUT_MS = 10_000;
const MIN_PROVIDER_TIMEOUT_MS = 100;

function envToken(id: string): string {
  return id.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
}

function enabledEnvName(id: string): string {
  return `HOWISMYIP_PROVIDER_${envToken(id)}_ENABLED`;
}

function parseBool(value: string | undefined): boolean | null {
  if (value === undefined || value.trim() === '') {
    return null;
  }
  switch (value.trim().toLowerCase()) {
    case '1':
    case 'true':
    case 'yes':
    case 'on':
      return true;
    case '0':
    case 'false':
    case 'no':
    case 'off':
      return false;
    default:
      return null;
  }
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

export function providerEnabledEnvName(provider: IpProvider): string {
  return enabledEnvName(provider.id);
}

export function isProviderEnabled(provider: IpProvider, env: Env): boolean {
  const enabled = parseBool(env[enabledEnvName(provider.id)]);
  if (enabled === false) {
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
