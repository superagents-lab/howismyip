import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import {
  combineRpkiStatuses,
  parsePrefixOverview,
  parseReverseDns,
  ripestatProvider,
} from './ripestat.js';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function testContext() {
  return { signal: new AbortController().signal, timeoutMs: 10_000 };
}

function ok(data: Record<string, unknown>) {
  return { status: 'ok', data };
}

function mockEndpoints(
  responses: Record<
    string,
    { status?: number; body?: unknown } | ((url: URL) => unknown)
  >
) {
  globalThis.fetch = ((input: string | URL | Request) => {
    const url = new URL(typeof input === 'string' ? input : input.toString());
    const endpoint = url.pathname.split('/').at(-2) ?? '';
    const configured = responses[endpoint];
    if (typeof configured === 'function') {
      return Promise.resolve(
        new Response(JSON.stringify(configured(url)), { status: 200 })
      );
    }
    return Promise.resolve(
      new Response(JSON.stringify(configured?.body ?? {}), {
        status: configured?.status ?? 200,
      })
    );
  }) as typeof fetch;
}

test('ripestat parsers normalize routing, PTR, and RPKI', () => {
  assert.deepEqual(
    parsePrefixOverview(
      ok({
        announced: true,
        resource: '8.8.8.0/24',
        asns: [{ asn: 15169, holder: 'GOOGLE - Google LLC' }],
      })
    ),
    {
      announced_prefix: '8.8.8.0/24',
      is_announced: true,
      origin_asns: ['AS15169'],
      origin_holders: ['GOOGLE - Google LLC'],
      asn: 'AS15169',
    }
  );
  assert.deepEqual(parseReverseDns(ok({ result: ['dns.google'] })), {
    ptr: 'dns.google',
  });
  assert.equal(combineRpkiStatuses([ok({ status: 'valid' })]), 'valid');
  assert.equal(
    combineRpkiStatuses([
      ok({ status: 'valid' }),
      ok({ status: 'invalid_asn' }),
    ]),
    'mixed'
  );
});

test('ripestat provider queries base endpoints then RPKI', async () => {
  mockEndpoints({
    'prefix-overview': {
      body: ok({
        announced: true,
        resource: '8.8.8.0/24',
        asns: [{ asn: 15169, holder: 'GOOGLE - Google LLC' }],
      }),
    },
    'reverse-dns-ip': {
      body: ok({ result: ['dns.google'], error: '' }),
    },
    'rpki-validation': (url) => {
      assert.equal(url.searchParams.get('resource'), '15169');
      assert.equal(url.searchParams.get('prefix'), '8.8.8.0/24');
      assert.equal(url.searchParams.get('sourceapp'), 'howismyip');
      return ok({ status: 'valid' });
    },
  });

  const result = await ripestatProvider.lookup('8.8.8.8', {}, testContext());
  assert.ok(result);
  assert.equal(result.announced_prefix, '8.8.8.0/24');
  assert.equal(result.ptr, 'dns.google');
  assert.equal(result.is_announced, true);
  assert.deepEqual(result.origin_asns, ['AS15169']);
  assert.deepEqual(result.origin_holders, ['GOOGLE - Google LLC']);
  assert.equal(result.rpki_status, 'valid');
  assert.equal(result.raw.rpki_origins_truncated, false);
});

test('ripestat provider preserves multiple origins and reports mixed RPKI', async () => {
  mockEndpoints({
    'prefix-overview': {
      body: ok({
        announced: true,
        resource: '203.0.113.0/24',
        asns: [
          { asn: 64500, holder: 'EXAMPLE-A' },
          { asn: 64501, holder: 'EXAMPLE-B' },
        ],
      }),
    },
    'reverse-dns-ip': { body: ok({ result: [] }) },
    'rpki-validation': (url) =>
      ok({
        status:
          url.searchParams.get('resource') === '64500'
            ? 'valid'
            : 'invalid_asn',
      }),
  });

  const result = await ripestatProvider.lookup(
    '203.0.113.1',
    {},
    testContext()
  );
  assert.ok(result);
  assert.equal(result.asn, null);
  assert.deepEqual(result.origin_asns, ['AS64500', 'AS64501']);
  assert.deepEqual(result.origin_holders, ['EXAMPLE-A', 'EXAMPLE-B']);
  assert.equal(result.rpki_status, 'mixed');
});

test('ripestat provider keeps reverse DNS when prefix overview fails', async () => {
  mockEndpoints({
    'prefix-overview': { status: 500 },
    'reverse-dns-ip': { body: ok({ result: ['example.net'] }) },
  });

  const result = await ripestatProvider.lookup('1.2.3.4', {}, testContext());
  assert.ok(result);
  assert.equal(result.ptr, 'example.net');
  assert.equal(result.announced_prefix, null);
  assert.match(result.raw.prefix_overview.error, /HTTP 500/);
});

test('ripestat provider fails when both base endpoints fail', async () => {
  mockEndpoints({
    'prefix-overview': { status: 500 },
    'reverse-dns-ip': { status: 503 },
  });

  await assert.rejects(
    () => ripestatProvider.lookup('1.2.3.4', {}, testContext()),
    /RIPEstat endpoints failed/
  );
});
