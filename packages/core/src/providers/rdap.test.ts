import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { rdapProvider } from './rdap.js';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function testContext() {
  return { signal: new AbortController().signal, timeoutMs: 10_000 };
}

/** Mock a single JSON response for `fetchJson`. */
function mockJson(payload: unknown) {
  globalThis.fetch = (() =>
    Promise.resolve(
      new Response(JSON.stringify(payload), { status: 200 })
    )) as typeof fetch;
}

test('rdap: full fixture walks entities and infers RIR', async () => {
  mockJson({
    handle: 'NET-8-8-8-0-1',
    name: 'GOGL',
    country: 'US',
    port43: 'whois.arin.net',
    cidr0_cidrs: [{ v4prefix: '8.8.8.0', length: 24 }],
    events: [
      { eventAction: 'registration', eventDate: '2014-03-14T00:00:00Z' },
    ],
    entities: [
      {
        roles: ['registrant'],
        entities: [
          {
            roles: ['abuse'],
            vcardArray: [
              'vcard',
              [
                ['version', {}, 'text', '4.0'],
                ['email', {}, 'text', 'abuse@example.com'],
              ],
            ],
          },
        ],
      },
    ],
  });
  const result = await rdapProvider.lookup('8.8.8.8', {}, testContext());
  assert.ok(result);
  assert.equal(result.rir, 'ARIN');
  assert.equal(result.network_cidr, '8.8.8.0/24');
  assert.equal(result.allocation_date, '2014-03-14T00:00:00Z');
  assert.equal(result.organization, 'GOGL');
  assert.equal(result.country_code, 'US');
  assert.equal(result.abuse_contact, 'abuse@example.com');
});

test('rdap: neither handle nor startAddress returns null', async () => {
  mockJson({ name: 'GOGL', country: 'US' });
  const result = await rdapProvider.lookup('8.8.8.8', {}, testContext());
  assert.equal(result, null);
});

test('rdap: no abuse entity yields null abuse_contact', async () => {
  mockJson({
    handle: 'NET-8-8-8-0-1',
    name: 'GOGL',
    country: 'US',
    port43: 'whois.arin.net',
    cidr0_cidrs: [{ v4prefix: '8.8.8.0', length: 24 }],
    entities: [{ roles: ['registrant'] }],
  });
  const result = await rdapProvider.lookup('8.8.8.8', {}, testContext());
  assert.ok(result);
  assert.equal(result.abuse_contact, null);
});
