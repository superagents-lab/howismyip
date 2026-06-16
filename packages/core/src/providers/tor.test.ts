import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { torProvider } from './tor.js';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function mockExitList(body: string) {
  globalThis.fetch = (() =>
    Promise.resolve(new Response(body, { status: 200 }))) as typeof fetch;
}

test('tor: non-exit membership check scores 0', async () => {
  mockExitList('9.9.9.9\n');

  const result = await torProvider.lookup('1.2.3.4', {});
  assert.ok(result);
  assert.equal(result.is_tor, false);
  assert.equal(result.risk_score, 0);
  assert.equal(result.risk_level, 'low');
});
