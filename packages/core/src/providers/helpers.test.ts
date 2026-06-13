import assert from 'node:assert/strict';
import { test } from 'node:test';
import { asDict, first, toInt, toStr, yesNoToBool } from './helpers.js';

test('yesNoToBool', () => {
  assert.equal(yesNoToBool('yes'), true);
  assert.equal(yesNoToBool('NO'), false);
  assert.equal(yesNoToBool('1'), true);
  assert.equal(yesNoToBool(true), true);
  assert.equal(yesNoToBool('maybe'), null);
  assert.equal(yesNoToBool(undefined), null);
});

test('toInt', () => {
  assert.equal(toInt('66'), 66);
  assert.equal(toInt(42), 42);
  assert.equal(toInt(null), null);
  assert.equal(toInt('abc'), null);
});

test('first returns earliest present key', () => {
  const payload = { a: null, b: undefined, c: 'hit', d: 'later' };
  assert.equal(first(payload, ['a', 'b', 'c', 'd']), 'hit');
  assert.equal(first(payload, ['a', 'b']), null);
});

test('asDict narrows objects', () => {
  assert.deepEqual(asDict({ x: 1 }), { x: 1 });
  assert.deepEqual(asDict([1, 2]), {});
  assert.deepEqual(asDict('nope'), {});
});

test('toStr trims and rejects empty', () => {
  assert.equal(toStr('  hi '), 'hi');
  assert.equal(toStr('   '), null);
  assert.equal(toStr(123), '123');
  assert.equal(toStr(null), null);
});
