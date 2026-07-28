import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { ipapiIsProvider, parseIpapiIsResponse } from './ipapi-is.js';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function testContext() {
  return { signal: new AbortController().signal, timeoutMs: 10_000 };
}

test('ipapi.is: maps abuse score, type, and risk flags', () => {
  const result = parseIpapiIsResponse({
    ip: '154.51.40.88',
    rir: 'ARIN',
    is_proxy: false,
    is_vpn: false,
    is_tor: false,
    is_datacenter: true,
    is_abuser: false,
    is_crawler: false,
    company: {
      name: 'Cogent Communications, LLC',
      abuser_score: '0.0002 (Very Low)',
      domain: 'cogentco.com',
      type: 'isp',
      network: '154.51.0.0 - 154.51.255.255',
    },
    asn: {
      asn: 46783,
      abuser_score: '0.0145 (Elevated)',
      route: '154.51.40.0/24',
      org: 'EASY LINK LLC',
      domain: '3rack.com',
      abuse: 'noc@3rack.com',
      type: 'hosting',
      rir: 'ARIN',
    },
    location: {
      continent: 'NA',
      country: 'United States',
      country_code: 'US',
      state: 'California',
      city: 'El Segundo',
    },
  });

  assert.ok(result);
  assert.equal(result.risk_score, 0.02);
  assert.equal(result.risk_level, 'low');
  assert.equal(result.country_code, 'US');
  assert.equal(result.continent_code, 'NA');
  assert.equal(result.region, 'California');
  assert.equal(result.city, 'El Segundo');
  assert.equal(result.asn, 'AS46783');
  assert.equal(result.as_domain, '3rack.com');
  assert.equal(result.isp, 'EASY LINK LLC');
  assert.equal(result.organization, 'Cogent Communications, LLC');
  assert.equal(result.usage_type, 'hosting');
  assert.equal(result.company_type, 'isp');
  assert.equal(result.connection_type, 'hosting');
  assert.equal(result.proxy_type, 'Datacenter');
  assert.equal(result.is_hosting, true);
  assert.equal(result.is_abuser, false);
  assert.equal(result.is_crawler, false);
  assert.equal(result.rir, 'ARIN');
  assert.equal(result.announced_prefix, '154.51.40.0/24');
  assert.equal(result.is_announced, true);
  assert.deepEqual(result.origin_asns, ['AS46783']);
  assert.deepEqual(result.origin_holders, ['EASY LINK LLC']);
  assert.equal(result.abuse_contact, 'noc@3rack.com');
  assert.deepEqual(result.risk_reasons, [
    'Company abuse score: Very Low',
    'ASN abuse score: Elevated',
  ]);
});

test('ipapi.is: VPN details become proxy type and reasons', () => {
  const result = parseIpapiIsResponse({
    is_vpn: true,
    is_abuser: true,
    is_crawler: true,
    company: { abuser_score: '0.45 (High)' },
    vpn: {
      service: 'PublicVpnConfigs',
      type: 'vpn_server',
      last_seen_str: '2026-06-22T16:10:58.472Z',
    },
  });

  assert.ok(result);
  assert.equal(result.risk_score, 45);
  assert.equal(result.risk_level, 'medium');
  assert.equal(result.proxy_type, 'PublicVpnConfigs · vpn_server');
  assert.equal(result.is_vpn, true);
  assert.equal(result.is_abuser, true);
  assert.equal(result.is_crawler, true);
  assert.deepEqual(result.risk_reasons, [
    'Company abuse score: High',
    'VPN: PublicVpnConfigs: vpn_server',
    'Abuser',
    'Crawler',
  ]);
});

test('ipapi.is: provider fetches keyless endpoint', async () => {
  globalThis.fetch = ((url) => {
    assert.equal(String(url), 'https://api.ipapi.is/?q=1.2.3.4');
    return Promise.resolve(
      new Response(
        JSON.stringify({
          company: { abuser_score: '0.01 (Elevated)' },
          is_proxy: false,
        }),
        { status: 200 }
      )
    );
  }) as typeof fetch;

  const result = await ipapiIsProvider.lookup('1.2.3.4', {}, testContext());
  assert.ok(result);
  assert.equal(result.risk_score, 1);
  assert.equal(result.risk_level, 'low');
  assert.equal(result.is_proxy, false);
});
