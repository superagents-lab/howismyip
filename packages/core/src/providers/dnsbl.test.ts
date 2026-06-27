import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { dnsblProvider } from './dnsbl.js';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function testContext() {
  return { signal: new AbortController().signal, timeoutMs: 10_000 };
}

/** Mock DoH: maps a query `name` to its A-record answers. */
function mockDoh(answers: Record<string, string[]>) {
  globalThis.fetch = ((input: string | URL | Request) => {
    const url = new URL(typeof input === 'string' ? input : input.toString());
    const name = url.searchParams.get('name') ?? '';
    const data = answers[name] ?? [];
    const body = { Answer: data.map((d) => ({ type: 1, data: d })) };
    return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
  }) as typeof fetch;
}

const ZEN = '4.3.2.1.zen.spamhaus.org';
const SPAMCOP = '4.3.2.1.bl.spamcop.net';
const DRONEBL = '4.3.2.1.dnsbl.dronebl.org';
const S5H = '4.3.2.1.all.s5h.net';

test('dnsbl: clean IP scores 0 and lists nothing', async () => {
  mockDoh({});
  const result = await dnsblProvider.lookup('1.2.3.4', {}, testContext());
  assert.ok(result);
  assert.deepEqual(result.blocklists, []);
  assert.equal(result.risk_score, 0);
  assert.equal(result.risk_level, 'low');
});

test('dnsbl: a single zone listing scores 40', async () => {
  mockDoh({ [ZEN]: ['127.0.0.2'] });
  const result = await dnsblProvider.lookup('1.2.3.4', {}, testContext());
  assert.ok(result);
  assert.deepEqual(result.blocklists, ['Spamhaus']);
  assert.equal(result.risk_score, 40);
});

test('dnsbl: 127.255.255.x resolver-rejection sentinel is not a listing', async () => {
  mockDoh({ [ZEN]: ['127.255.255.254'] });
  const result = await dnsblProvider.lookup('1.2.3.4', {}, testContext());
  assert.ok(result);
  assert.deepEqual(result.blocklists, []);
  assert.equal(result.risk_score, 0);
});

test('dnsbl: score caps at 100 across all four zones', async () => {
  mockDoh({
    [ZEN]: ['127.0.0.2'],
    [SPAMCOP]: ['127.0.0.2'],
    [DRONEBL]: ['127.0.0.2'],
    [S5H]: ['127.0.0.2'],
  });
  const result = await dnsblProvider.lookup('1.2.3.4', {}, testContext());
  assert.ok(result);
  assert.equal(result.risk_score, 100);
  assert.equal(result.risk_level, 'high');
});

test('dnsbl: IPv6 short-circuits to null', async () => {
  mockDoh({});
  const result = await dnsblProvider.lookup(
    '2001:4860:4860::8888',
    {},
    testContext()
  );
  assert.equal(result, null);
});
