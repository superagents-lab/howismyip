import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { maxmindProvider, parseMaxMindMinFraudResponse } from './maxmind.js';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function testContext() {
  return { signal: new AbortController().signal, timeoutMs: 10_000 };
}

test('maxmind: maps minFraud IP risk and Insights traits', () => {
  const result = parseMaxMindMinFraudResponse({
    ip_address: {
      risk: 82.4,
      country: { iso_code: 'US', names: { en: 'United States' } },
      continent: { code: 'NA', names: { en: 'North America' } },
      city: { names: { en: 'New York' } },
      subdivisions: [{ iso_code: 'NY', names: { en: 'New York' } }],
      traits: {
        autonomous_system_number: 2914,
        autonomous_system_organization: 'NTT America, Inc.',
        connection_type: 'Corporate',
        domain: 'ntt.net',
        isp: 'NTT America',
        organization: 'NTT America, Inc.',
        network: '176.46.140.0/24',
        is_anonymous: true,
        is_anonymous_vpn: true,
        is_hosting_provider: false,
        is_public_proxy: false,
        is_residential_proxy: false,
        is_tor_exit_node: false,
      },
      risk_reasons: [{ code: 'ANONYMOUS_IP', reason: 'Anonymous IP' }],
    },
  });

  assert.equal(result.risk_score, 82.4);
  assert.equal(result.risk_level, 'high');
  assert.equal(result.country_code, 'US');
  assert.equal(result.country_name, 'United States');
  assert.equal(result.continent_code, 'NA');
  assert.equal(result.continent_name, 'North America');
  assert.equal(result.region, 'New York');
  assert.equal(result.city, 'New York');
  assert.equal(result.asn, 'AS2914');
  assert.equal(result.as_domain, 'ntt.net');
  assert.equal(result.isp, 'NTT America');
  assert.equal(result.organization, 'NTT America, Inc.');
  assert.equal(result.proxy_type, 'Anonymous VPN');
  assert.equal(result.connection_type, 'Corporate');
  assert.equal(result.is_proxy, true);
  assert.equal(result.is_residential_proxy, false);
  assert.equal(result.is_vpn, true);
  assert.equal(result.is_tor, false);
  assert.equal(result.is_hosting, false);
  assert.deepEqual(result.risk_reasons, ['MaxMind IP reason: ANONYMOUS_IP']);
});

test('maxmind: residential proxy flag still marks is_proxy when public proxy is false', () => {
  const result = parseMaxMindMinFraudResponse({
    ip_address: {
      risk: '45.5',
      traits: {
        is_public_proxy: false,
        is_residential_proxy: true,
      },
    },
  });

  assert.equal(result.risk_score, 45.5);
  assert.equal(result.risk_level, 'medium');
  assert.equal(result.proxy_type, 'Residential proxy');
  assert.equal(result.is_proxy, true);
  assert.equal(result.is_residential_proxy, true);
});

test('maxmind: provider posts minimal minFraud Score request with basic auth', async () => {
  globalThis.fetch = ((url, init) => {
    assert.equal(
      String(url),
      'https://minfraud.maxmind.com/minfraud/v2.0/score'
    );
    assert.equal(init?.method, 'POST');
    assert.equal(
      init?.headers &&
        typeof init.headers === 'object' &&
        'authorization' in init.headers,
      true
    );
    assert.deepEqual(JSON.parse(String(init?.body)), {
      device: { ip_address: '1.2.3.4' },
    });
    return Promise.resolve(
      new Response(JSON.stringify({ ip_address: { risk: 0.01 } }), {
        status: 200,
      })
    );
  }) as typeof fetch;

  const result = await maxmindProvider.lookup(
    '1.2.3.4',
    {
      MAXMIND_ACCOUNT_ID: 'account',
      MAXMIND_LICENSE_KEY: 'license',
    },
    testContext()
  );

  assert.ok(result);
  assert.equal(result.risk_score, 0.01);
  assert.equal(result.risk_level, 'low');
});
