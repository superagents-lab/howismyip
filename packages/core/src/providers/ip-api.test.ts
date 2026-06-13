import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { ipApiProvider } from './ip-api.js';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

/** Mock a single JSON response for `fetchJson`. */
function mockJson(payload: unknown) {
  globalThis.fetch = (() =>
    Promise.resolve(
      new Response(JSON.stringify(payload), { status: 200 })
    )) as typeof fetch;
}

test('ip-api: success payload normalizes geo and flags', async () => {
  mockJson({
    status: 'success',
    country: 'United States',
    countryCode: 'US',
    as: 'AS15169 Google LLC',
    isp: 'Google',
    proxy: false,
    hosting: true,
    mobile: false,
  });
  const result = await ipApiProvider.lookup('1.2.3.4', {});
  assert.ok(result);
  assert.equal(result.country_code, 'US');
  assert.equal(result.asn, 'AS15169');
  assert.equal(result.is_hosting, true);
  assert.equal(result.proxy_type, 'Hosting');
  assert.equal(result.is_proxy, false);
});

test('ip-api: as field with no AS token yields null asn', async () => {
  mockJson({
    status: 'success',
    countryCode: 'US',
    as: '',
  });
  const result = await ipApiProvider.lookup('1.2.3.4', {});
  assert.ok(result);
  assert.equal(result.asn, null);
});

test('ip-api: failure payload returns null', async () => {
  mockJson({ status: 'fail', message: 'private range' });
  const result = await ipApiProvider.lookup('1.2.3.4', {});
  assert.equal(result, null);
});
