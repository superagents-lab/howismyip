import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  isProviderEnabled,
  providerEnabledEnvName,
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

test('provider config derives stable enable env names', () => {
  assert.equal(
    providerEnabledEnvName(keyless),
    'HOWISMYIP_PROVIDER_IP_API_ENABLED'
  );
});

test('keyless providers are enabled by default and can be disabled', () => {
  assert.equal(isProviderEnabled(keyless, {}), true);
  assert.equal(
    isProviderEnabled(keyless, { HOWISMYIP_PROVIDER_IP_API_ENABLED: '0' }),
    false
  );
});

test('keyed providers require both switch and credentials', () => {
  assert.equal(isProviderEnabled(keyed, {}), false);
  assert.equal(
    isProviderEnabled(keyed, {
      MAXMIND_ACCOUNT_ID: 'account',
      MAXMIND_LICENSE_KEY: 'license',
    }),
    true
  );
  assert.equal(
    isProviderEnabled(keyed, {
      HOWISMYIP_PROVIDER_MAXMIND_ENABLED: 'false',
      MAXMIND_ACCOUNT_ID: 'account',
      MAXMIND_LICENSE_KEY: 'license',
    }),
    false
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
