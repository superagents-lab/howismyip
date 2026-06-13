import assert from 'node:assert/strict';
import { test } from 'node:test';
import { InvalidIpError, lookupIpWith } from './aggregate.js';
import type { IpProvider } from './providers/types.js';
import type { IpIntelligence } from './schema.js';

function fakeProvider(
  id: string,
  data: Partial<IpIntelligence> | null,
  opts: { throws?: boolean } = {}
): IpProvider {
  return {
    id,
    name: id,
    category: 'risk',
    requiresKey: false,
    sourceUrl: (ip) => `https://example.com/${ip}`,
    isEnabled: () => true,
    lookup() {
      if (opts.throws) {
        throw new Error('boom');
      }
      return Promise.resolve(data);
    },
  };
}

test('rejects invalid IPs', async () => {
  await assert.rejects(
    () => lookupIpWith([], '999.999.999.999', {}),
    InvalidIpError
  );
});

test('merges geo via first-available and risk via max', async () => {
  const report = await lookupIpWith(
    [
      fakeProvider('a', { country_code: 'US', risk_score: 20, is_vpn: false }),
      fakeProvider('b', { country_code: 'CA', risk_score: 80, is_vpn: true }),
    ],
    '8.8.8.8',
    {}
  );
  assert.equal(report.consensus.country_code, 'US'); // first source wins
  assert.equal(report.consensus.risk_score, 80); // worst score
  assert.equal(report.consensus.risk_level, 'high');
  assert.equal(report.consensus.is_vpn, true); // any-true OR
  assert.equal(report.consensus.source_count, 2);
});

test('records per-source status without failing the whole report', async () => {
  const report = await lookupIpWith(
    [
      fakeProvider('ok', { asn: 'AS15169' }),
      fakeProvider('empty', null),
      fakeProvider('boom', null, { throws: true }),
    ],
    '8.8.8.8',
    {}
  );
  const byId = Object.fromEntries(report.sources.map((s) => [s.id, s]));
  assert.equal(byId.ok.status, 'ok');
  assert.equal(byId.empty.status, 'empty');
  assert.equal(byId.boom.status, 'error');
  assert.equal(byId.boom.error, 'boom');
  assert.equal(report.consensus.asn, 'AS15169');
  assert.equal(report.consensus.source_count, 1);
});

test('unions blocklists and ORs flags to false when all say false', async () => {
  const report = await lookupIpWith(
    [
      fakeProvider('x', { blocklists: ['Spamhaus'], is_tor: false }),
      fakeProvider('y', { blocklists: ['DroneBL'], is_tor: false }),
    ],
    '8.8.8.8',
    {}
  );
  assert.deepEqual(report.consensus.blocklists.sort(), ['DroneBL', 'Spamhaus']);
  assert.equal(report.consensus.is_tor, false);
  assert.equal(report.consensus.is_proxy, null); // nobody asserted
});
