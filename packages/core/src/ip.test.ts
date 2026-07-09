import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  detectIpVersion,
  expandIpv6,
  isPrivateOrReserved,
  isValidIp,
  normalizeIp,
  reverseLabels,
} from './ip.js';

test('detectIpVersion classifies v4/v6/invalid', () => {
  assert.equal(detectIpVersion('8.8.8.8'), 4);
  assert.equal(detectIpVersion('2001:4860:4860::8888'), 6);
  assert.equal(detectIpVersion('::1'), 6);
  assert.equal(detectIpVersion('999.1.1.1'), null);
  assert.equal(detectIpVersion('not-an-ip'), null);
  assert.equal(detectIpVersion('1.2.3'), null);
});

test('isValidIp', () => {
  assert.ok(isValidIp('1.1.1.1'));
  assert.ok(isValidIp('fe80::1'));
  assert.ok(!isValidIp('256.0.0.1'));
});

test('expandIpv6 normalizes to 8 groups', () => {
  assert.deepEqual(expandIpv6('2001:4860:4860::8888'), [
    '2001',
    '4860',
    '4860',
    '0000',
    '0000',
    '0000',
    '0000',
    '8888',
  ]);
  assert.equal(expandIpv6('gggg::1'), null);
});

test('reverseLabels for v4 and v6', () => {
  assert.equal(reverseLabels('1.2.3.4'), '4.3.2.1');
  assert.equal(
    reverseLabels('2001:4860:4860::8888')?.startsWith('8.8.8.8'),
    true
  );
});

test('normalizeIp canonicalizes equal addresses to equal strings', () => {
  assert.equal(normalizeIp(' 8.8.8.8 '), '8.8.8.8');
  assert.equal(normalizeIp('010.001.0.1'), '10.1.0.1');
  assert.equal(normalizeIp('2001:DB8::1'), '2001:db8::1');
  assert.equal(normalizeIp('2606:4700:0:0:0:0:0:1111'), '2606:4700::1111');
  assert.equal(
    normalizeIp('2606:4700:0000:0000:0000:0000:0000:1111'),
    '2606:4700::1111'
  );
  // Leftmost longest zero run wins; single zero groups stay uncompressed.
  assert.equal(normalizeIp('1:0:0:1:0:0:0:1'), '1:0:0:1::1');
  assert.equal(normalizeIp('1:0:2:3:4:5:6:7'), '1:0:2:3:4:5:6:7');
  assert.equal(normalizeIp('::1'), '::1');
  assert.equal(normalizeIp('::'), '::');
  assert.equal(normalizeIp('fe80::'), 'fe80::');
  assert.equal(normalizeIp('999.1.1.1'), null);
  assert.equal(normalizeIp('not-an-ip'), null);
});

test('isPrivateOrReserved', () => {
  assert.ok(isPrivateOrReserved('10.0.0.1'));
  assert.ok(isPrivateOrReserved('192.168.1.1'));
  assert.ok(isPrivateOrReserved('127.0.0.1'));
  assert.ok(isPrivateOrReserved('172.16.5.5'));
  assert.ok(isPrivateOrReserved('::1'));
  assert.ok(!isPrivateOrReserved('8.8.8.8'));
  assert.ok(!isPrivateOrReserved('172.32.0.1'));
});
