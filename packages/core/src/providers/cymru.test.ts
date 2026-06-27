import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { cymruProvider } from './cymru.js';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function testContext() {
  return { signal: new AbortController().signal, timeoutMs: 10_000 };
}

/** Mock DoH: maps a query `name` to its TXT-record answers. */
function mockDoh(answers: Record<string, string[]>) {
  globalThis.fetch = ((input: string | URL | Request) => {
    const url = new URL(typeof input === 'string' ? input : input.toString());
    const name = url.searchParams.get('name') ?? '';
    const data = answers[name] ?? [];
    const body = { Answer: data.map((d) => ({ type: 16, data: d })) };
    return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
  }) as typeof fetch;
}

const ORIGIN = '4.3.2.1.origin.asn.cymru.com';
const AS = 'AS15169.asn.cymru.com';

test('cymru: happy path parses origin and AS-name records', async () => {
  mockDoh({
    [ORIGIN]: ['15169 | 8.8.8.0/24 | US | arin | 1992-12-01'],
    [AS]: ['15169 | US | arin | 1992-12-01 | GOOGLE, US'],
  });
  const result = await cymruProvider.lookup('1.2.3.4', {}, testContext());
  assert.ok(result);
  assert.equal(result.asn, 'AS15169');
  assert.equal(result.network_cidr, '8.8.8.0/24');
  assert.equal(result.country_code, 'US');
  assert.equal(result.rir, 'ARIN');
  assert.equal(result.organization, 'GOOGLE, US');
  assert.equal(result.isp, 'GOOGLE, US');
});

test('cymru: no origin record returns null', async () => {
  mockDoh({});
  const result = await cymruProvider.lookup('1.2.3.4', {}, testContext());
  assert.equal(result, null);
});

test('cymru: origin present but empty AS-name lookup leaves names null', async () => {
  mockDoh({
    [ORIGIN]: ['15169 | 8.8.8.0/24 | US | arin | 1992-12-01'],
  });
  const result = await cymruProvider.lookup('1.2.3.4', {}, testContext());
  assert.ok(result);
  assert.equal(result.asn, 'AS15169');
  assert.equal(result.organization, null);
  assert.equal(result.isp, null);
});
