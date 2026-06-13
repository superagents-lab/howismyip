import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  detectIpVersion,
  expandIpv6,
  isPrivateOrReserved,
  isValidIp,
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

test('isPrivateOrReserved', () => {
  assert.ok(isPrivateOrReserved('10.0.0.1'));
  assert.ok(isPrivateOrReserved('192.168.1.1'));
  assert.ok(isPrivateOrReserved('127.0.0.1'));
  assert.ok(isPrivateOrReserved('172.16.5.5'));
  assert.ok(isPrivateOrReserved('::1'));
  assert.ok(!isPrivateOrReserved('8.8.8.8'));
  assert.ok(!isPrivateOrReserved('172.32.0.1'));
});
