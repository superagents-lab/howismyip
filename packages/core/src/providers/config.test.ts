import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  isProviderEnabled,
  providerDailyBudget,
  providerTimeoutMs,
} from './config.js';
import type { IpProvider } from './types.js';

const keyless: IpProvider = {
  id: 'ip-api',
  name: 'ip-api.com',
  category: 'geo',
  requiresKey: false,
  sourceUrl: () => 'https://example.com',
  lookup: () => Promise.resolve(null),
};

const keyed: IpProvider = {
  id: 'maxmind',
  name: 'MaxMind minFraud',
  category: 'risk',
  requiresKey: true,
  credentialEnv: ['MAXMIND_ACCOUNT_ID', 'MAXMIND_LICENSE_KEY'],
  sourceUrl: () => 'https://example.com',
  lookup: () => Promise.resolve(null),
};

test('keyless providers are enabled by default and can be disabled by list', () => {
  assert.equal(isProviderEnabled(keyless, {}), true);
  assert.equal(
    isProviderEnabled(keyless, { HOWISMYIP_DISABLED_PROVIDERS: 'ip-api' }),
    false
  );
  // Tolerates spaces, mixed case, and other entries in the list.
  assert.equal(
    isProviderEnabled(keyless, {
      HOWISMYIP_DISABLED_PROVIDERS: ' geojs, IP-API ,cymru',
    }),
    false
  );
  assert.equal(
    isProviderEnabled(keyless, { HOWISMYIP_DISABLED_PROVIDERS: 'geojs' }),
    true
  );
});

test('keyed providers need credentials and honor the disable list', () => {
  assert.equal(isProviderEnabled(keyed, {}), false);
  const creds = {
    MAXMIND_ACCOUNT_ID: 'account',
    MAXMIND_LICENSE_KEY: 'license',
  };
  assert.equal(isProviderEnabled(keyed, creds), true);
  assert.equal(
    isProviderEnabled(keyed, {
      ...creds,
      HOWISMYIP_DISABLED_PROVIDERS: 'maxmind',
    }),
    false
  );
});

test('daily budgets come from one table variable', () => {
  assert.equal(providerDailyBudget(keyless, {}), null);
  const env = {
    HOWISMYIP_DAILY_BUDGETS: 'ip-api:900, maxmind:0',
  };
  assert.equal(providerDailyBudget(keyless, env), 900);
  assert.equal(providerDailyBudget(keyed, env), 0); // 0 = never call
  // Absent or malformed entries mean unlimited.
  assert.equal(
    providerDailyBudget(keyless, { HOWISMYIP_DAILY_BUDGETS: 'maxmind:5' }),
    null
  );
  assert.equal(
    providerDailyBudget(keyless, { HOWISMYIP_DAILY_BUDGETS: 'ip-api:lots' }),
    null
  );
  assert.equal(
    providerDailyBudget(keyless, { HOWISMYIP_DAILY_BUDGETS: 'ip-api:-1' }),
    null
  );
});

test('provider timeout has a single shared env variable', () => {
  assert.equal(providerTimeoutMs({}), 10_000);
  assert.equal(
    providerTimeoutMs({ HOWISMYIP_PROVIDER_TIMEOUT_MS: '2500' }),
    2500
  );
  assert.equal(
    providerTimeoutMs({ HOWISMYIP_PROVIDER_TIMEOUT_MS: '50' }),
    10_000
  );
  assert.equal(
    providerTimeoutMs({ HOWISMYIP_PROVIDER_TIMEOUT_MS: 'not-a-number' }),
    10_000
  );
});
