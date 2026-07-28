import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import {
  ip2locationProvider,
  parseIp2LocationHtml,
  parseIp2LocationPayload,
} from './ip2location.js';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function testContext() {
  return { signal: new AbortController().signal, timeoutMs: 10_000 };
}

test('ip2location: API-like payload maps security fields', () => {
  const result = parseIp2LocationPayload('176.46.140.69', {
    ip: '176.46.140.69',
    country_code: 'US',
    country_name: 'United States of America',
    region_name: 'New York',
    city_name: 'New York City',
    asn: '2914',
    as: 'NTT America Inc.',
    as_info: {
      as_number: '2914',
      as_name: 'NTT America Inc.',
      as_domain: 'ntt.com',
      as_usage_type: 'DCH',
    },
    isp: 'Farahoosh Dena PLC',
    domain: 'farahoosh.ir',
    usage_type: 'ISP',
    is_proxy: false,
    fraud_score: 0,
    proxy: {
      proxy_type: '-',
      is_vpn: false,
      is_tor: false,
      is_data_center: false,
    },
  });

  assert.equal(result.risk_score, 0);
  assert.equal(result.risk_level, 'low');
  assert.equal(result.country_code, 'US');
  assert.equal(result.country_name, 'United States of America');
  assert.equal(result.region, 'New York');
  assert.equal(result.city, 'New York City');
  assert.equal(result.asn, 'AS2914');
  assert.equal(result.as_domain, 'ntt.com');
  assert.equal(result.isp, 'Farahoosh Dena PLC');
  assert.equal(result.organization, 'NTT America Inc.');
  assert.equal(result.proxy_type, 'ISP');
  assert.equal(result.is_proxy, false);
  assert.equal(result.is_vpn, false);
  assert.equal(result.is_tor, false);
  assert.equal(result.is_hosting, false);
});

test('ip2location: DCH usage is hosting when proxy flag is absent', () => {
  const result = parseIp2LocationPayload('9.249.84.94', {
    ip: '9.249.84.94',
    usage_type: 'DCH',
    is_proxy: true,
    fraud_score: 99,
    proxy: {
      proxy_type: 'VPN',
      is_vpn: true,
    },
  });

  assert.equal(result.risk_score, 99);
  assert.equal(result.risk_level, 'high');
  assert.equal(result.proxy_type, 'VPN');
  assert.equal(result.is_proxy, true);
  assert.equal(result.is_vpn, true);
  assert.equal(result.is_hosting, true);
});

test('ip2location: preserves a residential proxy as its own signal', () => {
  const result = parseIp2LocationPayload('1.2.3.4', {
    ip: '1.2.3.4',
    is_proxy: true,
    fraud_score: 80,
    proxy: {
      proxy_type: 'RES',
      is_residential_proxy: true,
    },
  });

  assert.equal(result.is_proxy, true);
  assert.equal(result.is_residential_proxy, true);
  assert.equal(result.proxy_type, 'RES');
});

test('ip2location: public lookup HTML maps fraud score and flags', () => {
  const result = parseIp2LocationHtml(
    '9.249.85.11',
    `
    <label class="mb-0">IP Address</label>
    <p class="ip-result"><a>9.249.85.11</a></p>
    <label class="mb-0">Country</label>
    <p class="ip-result">United States of America (US)</p>
    <label class="mb-0">Region</label>
    <p class="ip-result">California</p>
    <label class="mb-0">City</label>
    <p class="ip-result">Sacramento</p>
    <label class="mb-0">ASN</label>
    <p class="ip-result"><a>5650</a></p>
    <label class="mb-0">AS</label>
    <p class="ip-result">Frontier Communications of America Inc.</p>
    <label class="mb-0">ISP</label>
    <p class="ip-result">Aviation RE LLC</p>
    <label class="mb-0">Domain</label>
    <p class="ip-result">sacjet.com</p>
    <label class="mb-0">Net Speed</label>
    <p class="ip-result">(T1) Data Center/Transit</p>
    <label class="mb-0">Usage Type</label>
    <p class="ip-result">(DCH) Data Center/Web Hosting/Transit</p>
    <label class="mb-0">Category</label>
    <p class="ip-result">(IAB19-11) Data Centers</p>
    <label class="mb-0">Proxy</label>
    <p class="ip-result">Yes</p>
    <label class="mb-0">Last Seen</label>
    <p class="ip-result">1 day ago</p>
    <label class="mb-0">Proxy Type</label>
    <p class="ip-result">(VPN) Anonymizing VPN services</p>
    <label class="mb-0">Fraud Score</label>
    <p class="ip-result">99</p>
    `
  );

  assert.ok(result);
  assert.equal(result.risk_score, 99);
  assert.equal(result.risk_level, 'high');
  assert.equal(result.country_code, 'US');
  assert.equal(result.country_name, 'United States of America');
  assert.equal(result.region, 'California');
  assert.equal(result.city, 'Sacramento');
  assert.equal(result.asn, 'AS5650');
  assert.equal(result.isp, 'Aviation RE LLC');
  assert.equal(result.proxy_type, 'VPN');
  assert.equal(result.is_proxy, true);
  assert.equal(result.is_vpn, true);
  assert.equal(result.is_hosting, true);
  assert.equal(result.raw.lookup_method, 'html_scrape');
});

test('ip2location: provider fetches the public lookup page', async () => {
  globalThis.fetch = ((url, init) => {
    assert.equal(String(url), 'https://www.ip2location.io/1.2.3.4');
    assert.equal(init?.headers && 'user-agent' in init.headers, true);
    return Promise.resolve(
      new Response(
        `
        <label class="mb-0">IP Address</label>
        <p class="ip-result">1.2.3.4</p>
        <label class="mb-0">Fraud Score</label>
        <p class="ip-result">0</p>
        <label class="mb-0">Proxy</label>
        <p class="ip-result">No</p>
        `,
        { status: 200 }
      )
    );
  }) as typeof fetch;

  const result = await ip2locationProvider.lookup('1.2.3.4', {}, testContext());
  assert.ok(result);
  assert.equal(result.risk_score, 0);
  assert.equal(result.risk_level, 'low');
  assert.equal(result.is_proxy, false);
});
