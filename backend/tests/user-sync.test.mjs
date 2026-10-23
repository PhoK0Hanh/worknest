import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import express from 'express';
import { randomUUID } from 'node:crypto';
import { syncUser } from '../dist/services/sync-user.js';
import { createSyncUserHandler } from '../dist/routes/auth.js';
import { createRequireFirebaseAuth } from '../dist/middleware/require-firebase-auth.js';
import { getPrisma, disconnectDatabase } from '../dist/lib/prisma.js';

test('profile sync validates identity before accessing the database', async () => {
  const db = { $queryRaw: async () => { assert.fail('invalid identity must not query'); } };
  await assert.rejects(syncUser({ uid: 'uid', email: null }, db), error => error.code === 'PROFILE_INVALID');
});

test('upsert passes identity as SQL parameters and preserves database profile', async () => {
  const row = { id: 'profile-id', name: 'Existing name', firebaseUid: 'uid', email: 'an@example.com' };
  const db = { $queryRaw: async (strings, ...values) => {
    assert.deepEqual(values, ['uid', 'Firebase name', 'an@example.com']);
    assert.ok(strings.join('').includes('WHERE "users".is_active = true'));
    assert.ok(!strings.join('').includes('Firebase name'));
    return [row];
  } };
  assert.deepEqual(await syncUser({ uid: 'uid', name: 'Firebase name', email: ' AN@example.com ' }, db), row);
});

test('deleted profiles, email conflicts and infrastructure failures produce distinct safe errors', async () => {
  const identity = { uid: 'uid', email: 'an@example.com' };
  await assert.rejects(syncUser(identity, { $queryRaw: async () => [] }), error => error.code === 'ACCOUNT_INACTIVE' && error.status === 403);
  await assert.rejects(syncUser(identity, { $queryRaw: async () => { throw { code: 'P2010', meta: { code: '23505' } }; } }), error => error.code === 'EMAIL_CONFLICT' && error.status === 409);
  await assert.rejects(syncUser(identity, { $queryRaw: async () => { throw new Error('private database detail'); } }), error => error.code === 'PROFILE_UNAVAILABLE' && !error.message.includes('private'));
});

test('sync HTTP route trusts verified identity rather than supplied UID, name or active flag', async () => {
  const app = express();
  app.use(express.json());
  const identities = [];
  app.post('/sync', createRequireFirebaseAuth(async () => ({ uid: 'verified', email: 'an@example.com', name: 'An' })), createSyncUserHandler(async identity => {
    identities.push(identity);
    return { id: 'profile-id' };
  }));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const url = `http://127.0.0.1:${server.address().port}/sync`;
    const missing = await fetch(url, { method: 'POST' });
    assert.equal(missing.status, 401);
    assert.equal(identities.length, 0);
    const response = await fetch(url, { method: 'POST', headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' }, body: JSON.stringify({ uid: 'attacker', name: 'Fake', isActive: true }) });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(identities[0].uid, 'verified');
    assert.equal(identities[0].name, 'An');
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('Prisma adapter: real upsert and unique-error mapping on a transaction-local TEMP table', { skip: process.env.RUN_DB_TESTS !== '1' }, async () => {
  try {
    await getPrisma().$transaction(async tx => {
      // The TEMP table is dropped at commit and never changes public.users.
      await tx.$executeRawUnsafe('DROP TABLE IF EXISTS pg_temp.users');
      await tx.$executeRawUnsafe(`CREATE TEMP TABLE users (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), firebase_uid text UNIQUE NOT NULL,
        name text NOT NULL, email text UNIQUE, is_active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP, deleted_at timestamptz,
        CHECK ((is_active AND email IS NOT NULL AND deleted_at IS NULL) OR
               (NOT is_active AND email IS NULL AND deleted_at IS NOT NULL))
      ) ON COMMIT DROP`);
      const database = { $queryRaw: (strings, ...values) => {
        const parts = strings.map(part => part.replaceAll('"public"."users"', '"pg_temp"."users"'));
        parts.raw = [...parts];
        return tx.$queryRaw(parts, ...values);
      } };
      const identity = { uid: randomUUID(), email: 'prisma-test@example.com', name: 'Prisma Test' };
      const first = await syncUser(identity, database);
      const second = await syncUser({ ...identity, name: 'Different name' }, database);
      assert.equal(first.id, second.id);
      assert.equal(second.name, 'Prisma Test');
      assert.equal((await tx.$queryRaw`SELECT count(*)::int AS count FROM pg_temp.users`)[0].count, 1);
      await tx.$executeRawUnsafe('SAVEPOINT expected_email_conflict');
      await assert.rejects(syncUser({ ...identity, uid: randomUUID() }, database), error => error.code === 'EMAIL_CONFLICT');
      await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT expected_email_conflict');
      await tx.$executeRaw`UPDATE users SET is_active = false, email = NULL, deleted_at = CURRENT_TIMESTAMP WHERE id = ${first.id}::uuid`;
      await assert.rejects(syncUser(identity, database), error => error.code === 'ACCOUNT_INACTIVE');
      const fresh = await syncUser({ ...identity, uid: randomUUID() }, database);
      assert.notEqual(fresh.id, first.id);
      assert.equal((await tx.$queryRaw`SELECT is_active FROM pg_temp.users WHERE id = ${first.id}::uuid`)[0].is_active, false);
    }, { timeout: 30000, maxWait: 10000 });
  } finally { await disconnectDatabase(); }
});
