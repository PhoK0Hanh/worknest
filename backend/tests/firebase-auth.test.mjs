import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createRequireFirebaseAuth } from '../dist/middleware/require-firebase-auth.js';

// Exercise the real HTTP boundary with a local verifier, without credentials or Firebase traffic.
async function withApi(verify, run) {
  const app = express();
  app.use(express.json());
  app.get('/identity', createRequireFirebaseAuth(verify), (_req, res) => res.json(res.locals.firebaseIdentity));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try { await run(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise(resolve => server.close(resolve)); }
}

test('missing, malformed and oversized credentials never reach the verifier', async () => {
  let calls = 0;
  await withApi(async () => { calls++; throw new Error('must not run'); }, async base => {
    for (const header of [undefined, 'Basic abc', 'Bearer', 'Bearer a b', `Bearer ${'a'.repeat(16385)}`]) {
      const res = await fetch(`${base}/identity`, { headers: header ? { Authorization: header } : {} });
      // Large headers may be rejected by Node before Express.
      assert.ok([401, 431].includes(res.status));
    }
  });
  assert.equal(calls, 0);
});

test('response uses verified identity, ignores a supplied user ID, and disables caching', async () => {
  await withApi(async token => {
    assert.equal(token, 'signed-token');
    return { uid: 'verified-user', email: 'test@example.com', email_verified: true };
  }, async base => {
    const res = await fetch(`${base}/identity?userId=another-user`, { headers: { Authorization: 'Bearer signed-token' } });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await res.json(), { uid: 'verified-user', email: 'test@example.com', emailVerified: true });
  });
});

test('expired, revoked and disabled users are rejected; infrastructure errors remain retryable', async () => {
  for (const code of ['auth/id-token-expired', 'auth/id-token-revoked', 'auth/user-disabled', 'auth/user-not-found', 'auth/invalid-id-token', 'app/network-error']) {
    await withApi(async () => { throw { code, message: 'secret-internal-detail' }; }, async base => {
      const res = await fetch(`${base}/identity`, { headers: { Authorization: 'Bearer signed-token' } });
      assert.equal(res.status, code === 'app/network-error' ? 503 : 401);
      assert.ok(!(await res.text()).includes('secret-internal-detail'));
    });
  }
});
