import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { ipdataProvider } from './ipdata.js';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function testContext() {
  return { signal: new AbortController().signal, timeoutMs: 10_000 };
}

function mockJson(payload: unknown) {
  globalThis.fetch = (() =>
    Promise.resolve(
      new Response(JSON.stringify(payload), { status: 200 })
    )) as typeof fetch;
}

test('ipdata: explicit clean threat verdict scores 0', async () => {
  mockJson({
    asn: { asn: 'AS2914', name: 'NTT America', type: 'internet_backbone' },
    threat: {
      is_proxy: false,
      is_tor: false,
      is_datacenter: false,
      is_known_attacker: false,
      is_known_abuser: false,
      is_threat: false,
      blocklists: [],
    },
  });

  const result = await ipdataProvider.lookup(
    '1.2.3.4',
    {
      IPDATA_API_KEY: 'test',
    },
    testContext()
  );
  assert.ok(result);
  assert.equal(result.risk_score, 0);
  assert.equal(result.risk_level, 'low');
  assert.equal(result.is_proxy, false);
});

test('ipdata: malicious threat verdict scores 100', async () => {
  mockJson({
    threat: {
      is_known_attacker: true,
      is_known_abuser: false,
      is_threat: false,
      blocklists: [],
    },
  });

  const result = await ipdataProvider.lookup(
    '1.2.3.4',
    {
      IPDATA_API_KEY: 'test',
    },
    testContext()
  );
  assert.ok(result);
  assert.equal(result.risk_score, 100);
  assert.equal(result.risk_level, 'high');
});
