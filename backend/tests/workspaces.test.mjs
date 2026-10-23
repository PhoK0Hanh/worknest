import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import express from 'express';
import { verify } from 'argon2';
import { createWorkspace, listWorkspaces, joinWorkspace, getWorkspace, leaveWorkspace } from '../dist/services/workspaces.js';
import { createWorkspaceHandlers } from '../dist/routes/workspaces.js';
import { createRequireFirebaseAuth } from '../dist/middleware/require-firebase-auth.js';
import { getPrisma, disconnectDatabase } from '../dist/lib/prisma.js';

test('invalid input and caller-supplied owner/role are rejected before starting a transaction', async () => {
  const db = { $transaction: () => { assert.fail('invalid input must not reach database'); } };
  for (const input of [null, {}, { name: ' ', password: 'password123' }, { name: 'Team', password: '123' }, { name: 'Team', password: 'password123', role: 'OWNER' }, { name: 'Team', password: 'password123', userId: 'someone' }]) {
    await assert.rejects(createWorkspace('uid', input, db), error => error.code === 'WORKSPACE_INVALID');
  }
});

test('join rejects malformed codes, missing passwords and caller-supplied membership roles', async () => {
  const db = { $transaction: () => { assert.fail('invalid join must not query'); } };
  for (const input of [null, {}, { joinCode: 'bad', password: 'password123' }, { joinCode: 'ABCDEF123456', password: '' }, { joinCode: 'ABCDEF123456', password: 'password123', role: 'ADMIN' }]) {
    await assert.rejects(joinWorkspace('uid', input, db), error => error.code === 'JOIN_INVALID');
  }
});

test('detail and leave reject invalid IDs before querying the database', async () => {
  const db = { $transaction: () => assert.fail('invalid ID must not query') };
  for (const action of [getWorkspace, leaveWorkspace]) {
    for (const id of [null, '', 'invalid', ['id']]) {
      await assert.rejects(action('uid', id, db), error => error.code === 'WORKSPACE_ID_INVALID');
    }
  }
});

test('HTTP boundary requires auth, uses verified UID and returns creation status', async () => {
  const app = express();
  app.use(express.json());
  const calls = [];
  const handlers = createWorkspaceHandlers({
    createWorkspace: async (uid, body) => { calls.push({ uid, body }); return { id: 'workspace', role: 'OWNER' }; },
    listWorkspaces: async uid => { calls.push({ uid }); return []; },
    joinWorkspace: async (uid, body) => { calls.push({ uid, body }); return { workspace: { id: 'workspace', role: 'MEMBER' }, alreadyMember: false }; },
    getWorkspace: async (uid, id) => { calls.push({ uid, id }); return { id, members: [] }; },
    leaveWorkspace: async (uid, id) => { calls.push({ uid, id }); return { workspaceId: id, alreadyLeft: false }; },
  });
  const auth = createRequireFirebaseAuth(async () => ({ uid: 'verified-uid' }));
  app.get('/workspaces', auth, handlers.list);
  app.post('/workspaces', auth, handlers.create);
  app.post('/workspaces/join', auth, handlers.join);
  app.get('/workspaces/:id', auth, handlers.detail);
  app.post('/workspaces/:id/leave', auth, handlers.leave);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const url = `http://127.0.0.1:${server.address().port}/workspaces`;
  try {
    assert.equal((await fetch(url)).status, 401);
    assert.equal((await fetch(url, { method: 'POST', headers: { Authorization: 'Bearer test' } })).status, 415);
    assert.equal(calls.length, 0);
    const created = await fetch(url, { method: 'POST', headers: { Authorization: 'Bearer test', 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'React', password: 'password123' }) });
    assert.equal(created.status, 201);
    assert.equal(calls[0].uid, 'verified-uid');
    const listed = await fetch(url, { headers: { Authorization: 'Bearer test' } });
    assert.equal(listed.status, 200);
    assert.equal(listed.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await listed.json(), { workspaces: [] });
    assert.equal((await fetch(`${url}/join`, { method: 'POST' })).status, 401);
    assert.equal((await fetch(`${url}/join`, { method: 'POST', headers: { Authorization: 'Bearer test' } })).status, 415);
    const joined = await fetch(`${url}/join`, { method: 'POST', headers: { Authorization: 'Bearer test', 'Content-Type': 'application/json' }, body: JSON.stringify({ joinCode: 'ABCDEF123456', password: 'password123' }) });
    assert.equal(joined.status, 200);
    assert.equal(joined.headers.get('cache-control'), 'no-store');
    assert.equal(calls.at(-1).uid, 'verified-uid');
    assert.equal((await joined.json()).workspace.role, 'MEMBER');
    assert.equal((await fetch(`${url}/group`)).status, 401);
    assert.equal((await fetch(`${url}/group/leave`, { method: 'POST' })).status, 401);
    const detail = await fetch(`${url}/group`, { headers: { Authorization: 'Bearer test' } });
    assert.equal(detail.status, 200);
    assert.equal(detail.headers.get('cache-control'), 'no-store');
    assert.deepEqual(calls.at(-1), { uid: 'verified-uid', id: 'group' });
    const left = await fetch(`${url}/group/leave`, { method: 'POST', headers: { Authorization: 'Bearer test', 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: 'someone-else' }) });
    assert.equal(left.status, 200);
    assert.deepEqual(calls.at(-1), { uid: 'verified-uid', id: 'group' });
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('Neon: Owner/log transaction, hashing, membership isolation and rollback', { skip: process.env.RUN_DB_TESTS !== '1' }, async () => {
  try {
    await getPrisma().$transaction(async tx => {
      // Clone structure into transaction-local fixtures; all service SQL is redirected here.
      const tables = ['users', 'workspaces', 'memberships', 'activity_logs', 'tasks'];
      for (const table of tables) {
        await tx.$executeRawUnsafe(`CREATE TEMP TABLE "workspace_test_${table}" (LIKE public."${table}" INCLUDING ALL) ON COMMIT DROP`);
      }
      await tx.$executeRawUnsafe('ALTER TABLE pg_temp.workspace_test_memberships ADD FOREIGN KEY (user_id) REFERENCES pg_temp.workspace_test_users(id), ADD FOREIGN KEY (workspace_id) REFERENCES pg_temp.workspace_test_workspaces(id) ON DELETE CASCADE');
      await tx.$executeRawUnsafe('ALTER TABLE pg_temp.workspace_test_activity_logs ADD FOREIGN KEY (workspace_id) REFERENCES pg_temp.workspace_test_workspaces(id) ON DELETE CASCADE');
      const owner = { id: randomUUID(), uid: randomUUID() };
      const other = { id: randomUUID(), uid: randomUUID() };
      const inactiveUid = randomUUID();
      await tx.$executeRaw`INSERT INTO pg_temp.workspace_test_users (id, firebase_uid, name, email) VALUES (${owner.id}::uuid, ${owner.uid}, 'Owner', 'owner@example.com'), (${other.id}::uuid, ${other.uid}, 'Other', 'other@example.com')`;
      await tx.$executeRaw`INSERT INTO pg_temp.workspace_test_users (firebase_uid, name, is_active, deleted_at) VALUES (${inactiveUid}, 'Inactive', false, CURRENT_TIMESTAMP)`;

      let failLog = false;
      const redirect = strings => {
        const parts = strings.map(part => tables.reduce((text, table) => text.replaceAll(`"public"."${table}"`, `"pg_temp"."workspace_test_${table}"`), part));
        parts.raw = [...parts];
        return parts;
      };
      const mappedTx = {
        $queryRaw: (strings, ...values) => tx.$queryRaw(redirect(strings), ...values),
        $executeRaw: (strings, ...values) => {
          if (failLog && strings.join('').includes('"activity_logs"')) throw new Error('simulated log failure');
          return tx.$executeRaw(redirect(strings), ...values);
        },
      };
      const database = { $transaction: async action => {
        await tx.$executeRawUnsafe('SAVEPOINT workspace_operation');
        try {
          const result = await action(mappedTx);
          await tx.$executeRawUnsafe('RELEASE SAVEPOINT workspace_operation');
          return result;
        } catch (error) {
          await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT workspace_operation');
          await tx.$executeRawUnsafe('RELEASE SAVEPOINT workspace_operation');
          throw error;
        }
      } };

      const workspace = await createWorkspace(owner.uid, { name: ' React ', password: 'workspace-password' }, database);
      assert.equal(workspace.name, 'React');
      assert.equal(workspace.role, 'OWNER');
      assert.equal(workspace.memberCount, 1);
      assert.match(workspace.joinCode, /^[0-9A-F]{12}$/);
      assert.ok(!JSON.stringify(workspace).includes('password'));
      const stored = (await tx.$queryRaw`SELECT join_password_hash FROM pg_temp.workspace_test_workspaces`)[0];
      assert.notEqual(stored.join_password_hash, 'workspace-password');
      assert.ok(await verify(stored.join_password_hash, 'workspace-password'));
      assert.equal((await tx.$queryRaw`SELECT role FROM pg_temp.workspace_test_memberships`)[0].role, 'OWNER');
      assert.equal((await tx.$queryRaw`SELECT count(*)::int AS count FROM pg_temp.workspace_test_activity_logs`)[0].count, 1);
      assert.equal((await listWorkspaces(owner.uid, database)).length, 1);
      assert.equal((await listWorkspaces(other.uid, database)).length, 0);
      const wrongCode = workspace.joinCode === '000000000000' ? '111111111111' : '000000000000';
      await assert.rejects(joinWorkspace(other.uid, { joinCode: wrongCode, password: 'workspace-password' }, database), error => error.code === 'JOIN_CREDENTIALS_INVALID');
      await assert.rejects(joinWorkspace(other.uid, { joinCode: workspace.joinCode, password: 'wrong-password' }, database), error => error.code === 'JOIN_CREDENTIALS_INVALID');
      await assert.rejects(joinWorkspace(inactiveUid, { joinCode: workspace.joinCode, password: 'workspace-password' }, database), error => error.code === 'ACCOUNT_UNAVAILABLE');
      const newcomer = { id: randomUUID(), uid: randomUUID() };
      await tx.$executeRaw`INSERT INTO pg_temp.workspace_test_users (id, firebase_uid, name, email) VALUES (${newcomer.id}::uuid, ${newcomer.uid}, 'New member', 'new@example.com')`;
      const joined = await joinWorkspace(newcomer.uid, { joinCode: ` ${workspace.joinCode.toLowerCase()} `, password: 'workspace-password' }, database);
      assert.equal(joined.workspace.role, 'MEMBER');
      assert.equal(joined.workspace.memberCount, 2);
      assert.equal(joined.alreadyMember, false);
      assert.ok(!JSON.stringify(joined).includes('passwordHash'));
      const repeated = await joinWorkspace(newcomer.uid, { joinCode: workspace.joinCode, password: 'workspace-password' }, database);
      assert.equal(repeated.alreadyMember, true);
      assert.equal(repeated.workspace.memberCount, 2);
      const existingOwner = await joinWorkspace(owner.uid, { joinCode: workspace.joinCode, password: 'workspace-password' }, database);
      assert.equal(existingOwner.workspace.role, 'OWNER');
      assert.equal(existingOwner.alreadyMember, true);
      assert.equal((await tx.$queryRaw`SELECT count(*)::int AS count FROM pg_temp.workspace_test_activity_logs`)[0].count, 2);
      await tx.$executeRaw`INSERT INTO pg_temp.workspace_test_memberships (user_id, workspace_id) VALUES (${other.id}::uuid, ${workspace.id}::uuid)`;
      assert.equal((await listWorkspaces(other.uid, database))[0].role, 'MEMBER');
      await tx.$executeRaw`UPDATE pg_temp.workspace_test_memberships SET left_at = CURRENT_TIMESTAMP, is_banned = true WHERE user_id = ${other.id}::uuid`;
      assert.equal((await listWorkspaces(other.uid, database)).length, 0);
      await assert.rejects(joinWorkspace(other.uid, { joinCode: workspace.joinCode, password: 'workspace-password' }, database), error => error.code === 'MEMBERSHIP_BANNED');
      assert.equal((await tx.$queryRaw`SELECT is_banned FROM pg_temp.workspace_test_memberships WHERE user_id = ${other.id}::uuid`)[0].is_banned, true);
      await tx.$executeRaw`UPDATE pg_temp.workspace_test_memberships SET role = 'ADMIN', is_banned = false, joined_at = CURRENT_TIMESTAMP - INTERVAL '10 days', left_at = CURRENT_TIMESTAMP - INTERVAL '1 day' WHERE user_id = ${other.id}::uuid`;
      const rejoined = await joinWorkspace(other.uid, { joinCode: workspace.joinCode, password: 'workspace-password' }, database);
      assert.equal(rejoined.workspace.role, 'MEMBER');
      assert.equal(rejoined.alreadyMember, false);
      const restored = (await tx.$queryRaw`SELECT joined_at, left_at, is_banned FROM pg_temp.workspace_test_memberships WHERE user_id = ${other.id}::uuid`)[0];
      assert.equal(restored.left_at, null);
      assert.equal(restored.is_banned, false);
      assert.equal(restored.joined_at.toISOString(), (await tx.$queryRaw`SELECT CURRENT_TIMESTAMP AS now`)[0].now.toISOString());
      await assert.rejects(createWorkspace(inactiveUid, { name: 'No', password: 'password123' }, database), error => error.code === 'ACCOUNT_UNAVAILABLE');
      await assert.rejects(listWorkspaces(inactiveUid, database), error => error.code === 'ACCOUNT_UNAVAILABLE');
      failLog = true;
      const rollbackUser = { id: randomUUID(), uid: randomUUID() };
      await tx.$executeRaw`INSERT INTO pg_temp.workspace_test_users (id, firebase_uid, name, email) VALUES (${rollbackUser.id}::uuid, ${rollbackUser.uid}, 'Rollback', 'rollback@example.com')`;
      await assert.rejects(joinWorkspace(rollbackUser.uid, { joinCode: workspace.joinCode, password: 'workspace-password' }, database));
      assert.equal((await tx.$queryRaw`SELECT count(*)::int AS count FROM pg_temp.workspace_test_memberships WHERE user_id = ${rollbackUser.id}::uuid`)[0].count, 0);
      assert.equal((await tx.$queryRaw`SELECT count(*)::int AS count FROM pg_temp.workspace_test_activity_logs`)[0].count, 3);
      await assert.rejects(createWorkspace(owner.uid, { name: 'Rollback', password: 'password123' }, database));
      assert.equal((await tx.$queryRaw`SELECT count(*)::int AS count FROM pg_temp.workspace_test_workspaces`)[0].count, 1);
      assert.equal((await tx.$queryRaw`SELECT count(*)::int AS count FROM pg_temp.workspace_test_memberships WHERE role = 'OWNER'`)[0].count, 1);
      failLog = false;

      // Detail authorization and leaving are checked against isolated fixtures, never public rows.
      const detail = await getWorkspace(owner.uid, workspace.id, database);
      assert.equal(detail.members.length, 3);
      assert.equal(detail.members[0].role, 'OWNER');
      assert.ok(!JSON.stringify(detail).includes('password'));
      await assert.rejects(getWorkspace(rollbackUser.uid, workspace.id, database), error => error.code === 'WORKSPACE_NOT_FOUND');
      await assert.rejects(getWorkspace(owner.uid, randomUUID(), database), error => error.code === 'WORKSPACE_NOT_FOUND');
      await assert.rejects(getWorkspace(inactiveUid, workspace.id, database), error => error.code === 'ACCOUNT_UNAVAILABLE');
      await assert.rejects(leaveWorkspace(owner.uid, workspace.id, database), error => error.code === 'OWNER_TRANSFER_REQUIRED');
      await assert.rejects(leaveWorkspace(rollbackUser.uid, workspace.id, database), error => error.code === 'WORKSPACE_NOT_FOUND');
      await tx.$executeRaw`INSERT INTO pg_temp.workspace_test_tasks (title, created_by, assignee_id, workspace_id, position, status, completed_at)
        VALUES ('Unfinished', ${owner.id}::uuid, ${other.id}::uuid, ${workspace.id}::uuid, 1, 'TODO', NULL),
               ('Finished', ${owner.id}::uuid, ${other.id}::uuid, ${workspace.id}::uuid, 1, 'DONE', CURRENT_TIMESTAMP)`;
      await tx.$executeRaw`UPDATE pg_temp.workspace_test_memberships SET role = 'ADMIN' WHERE user_id = ${other.id}::uuid`;
      failLog = true;
      await assert.rejects(leaveWorkspace(other.uid, workspace.id, database));
      assert.equal((await tx.$queryRaw`SELECT left_at FROM pg_temp.workspace_test_memberships WHERE user_id = ${other.id}::uuid`)[0].left_at, null);
      assert.equal((await tx.$queryRaw`SELECT assignee_id FROM pg_temp.workspace_test_tasks WHERE title = 'Unfinished'`)[0].assignee_id, other.id);
      failLog = false;
      assert.equal((await leaveWorkspace(other.uid, workspace.id, database)).alreadyLeft, false);
      const tasks = await tx.$queryRaw`SELECT title, assignee_id FROM pg_temp.workspace_test_tasks ORDER BY title`;
      assert.equal(tasks.find(task => task.title === 'Unfinished').assignee_id, null);
      assert.equal(tasks.find(task => task.title === 'Finished').assignee_id, other.id);
      assert.equal((await listWorkspaces(other.uid, database)).length, 0);
      await assert.rejects(getWorkspace(other.uid, workspace.id, database), error => error.code === 'WORKSPACE_NOT_FOUND');
      assert.equal((await getWorkspace(owner.uid, workspace.id, database)).memberCount, 2);
      const logCount = (await tx.$queryRaw`SELECT count(*)::int AS count FROM pg_temp.workspace_test_activity_logs`)[0].count;
      assert.equal((await leaveWorkspace(other.uid, workspace.id, database)).alreadyLeft, true);
      assert.equal((await tx.$queryRaw`SELECT count(*)::int AS count FROM pg_temp.workspace_test_activity_logs`)[0].count, logCount);
      assert.equal((await joinWorkspace(other.uid, { joinCode: workspace.joinCode, password: 'workspace-password' }, database)).workspace.role, 'MEMBER');
      await tx.$executeRaw`UPDATE pg_temp.workspace_test_memberships SET left_at = clock_timestamp(), is_banned = true WHERE user_id = ${other.id}::uuid`;
      await assert.rejects(getWorkspace(other.uid, workspace.id, database), error => error.code === 'WORKSPACE_NOT_FOUND');
      await assert.rejects(leaveWorkspace(other.uid, workspace.id, database), error => error.code === 'WORKSPACE_NOT_FOUND');
    }, { timeout: 30000, maxWait: 10000 });
  } finally { await disconnectDatabase(); }
});
