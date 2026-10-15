import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.ts';
test('automation is removed and old PC clients cannot sync', async () => {
 assert.equal(worker.scheduled, undefined);
 const response = await worker.fetch(new Request('https://example.test/sync/drafts'), {});
 assert.equal(response.status, 410);
 assert.equal((await worker.fetch(new Request('https://example.test/'), {})).status, 200);
});
