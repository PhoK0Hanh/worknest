import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Prisma } from '../dist/generated/prisma/client.js';
import { listMyTasks } from '../dist/services/my-tasks.js';
import { getTask } from '../dist/services/tasks.js';
import { createMyTasksHandler } from '../dist/routes/my-tasks.js';
import { getPrisma, disconnectDatabase } from '../dist/lib/prisma.js';

test('personal task filters reject forged identity, arrays and unbounded pagination before querying', async () => {
  const db = { $transaction: () => assert.fail('invalid queries must not reach Neon') };
  for (const query of [{ userId: randomUUID() }, { scope: 'others' }, { scope: ['assigned', 'created'] }, { page: 0 }, { pageSize: 51 }, { page: 1.5 }, { workspaceId: 'invalid' }, { priority: "HIGH' OR true" }]) {
    await assert.rejects(listMyTasks('verified-uid', query, db));
  }
});

test('personal tasks route uses verified identity and disables response caching', async () => {
  let received;
  const handler = createMyTasksHandler(async (uid, query) => { received = { uid, query }; return { tasks: [], total: 0 }; });
  const response = { locals: { firebaseIdentity: { uid: 'verified-uid' } }, set(name, value) { assert.equal(name, 'Cache-Control'); assert.equal(value, 'no-store'); return this; }, json(value) { this.body = value; } };
  await handler({ query: { scope: 'created' } }, response);
  assert.deepEqual(received, { uid: 'verified-uid', query: { scope: 'created' } });
  assert.equal(response.body.total, 0);
});

test('Neon personal task views enforce membership, filters, sorting, pagination and assignment changes', { skip: process.env.RUN_DB_TESTS !== '1' }, async () => {
  try {
    await getPrisma().$transaction(async tx => {
      // All fixtures are temporary; no user task or real membership is changed by this test.
      const tables = ['users', 'workspaces', 'memberships', 'tasks'];
      for (const table of tables) await tx.$executeRawUnsafe(`CREATE TEMP TABLE personal_test_${table} (LIKE public.${table} INCLUDING ALL) ON COMMIT DROP`);
      function redirect(strings) {
        const parts = strings.map(part => tables.reduce((sql, table) => sql.replaceAll(`public.${table}`, `pg_temp.personal_test_${table}`), part));
        parts.raw = [...parts]; return parts;
      }
      const mapped = { $queryRaw: (query, ...values) => Array.isArray(query)
        ? tx.$queryRaw(redirect(query), ...values)
        : tx.$queryRaw(Prisma.sql(redirect(query.strings), ...query.values)) };
      const db = { $transaction: action => action(mapped) };
      const alice = randomUUID(), bob = randomUUID();
      const group = randomUUID(), otherGroup = randomUUID(), leftGroup = randomUUID(), bannedGroup = randomUUID();
      await tx.$executeRaw`INSERT INTO pg_temp.personal_test_users(id,firebase_uid,name,email) VALUES
        (${alice}::uuid,'personal-alice','Alice','personal-alice@example.com'),(${bob}::uuid,'personal-bob','Bob','personal-bob@example.com')`;
      for (const [index, id] of [group, otherGroup, leftGroup, bannedGroup].entries()) {
        await tx.$executeRaw`INSERT INTO pg_temp.personal_test_workspaces(id,name,join_code,join_password_hash) VALUES (${id}::uuid,${`Group ${index}`},${`CODE${index}`},'fixture')`;
      }
      await tx.$executeRaw`INSERT INTO pg_temp.personal_test_memberships(user_id,workspace_id,role) VALUES
        (${alice}::uuid,${group}::uuid,'MEMBER'),(${alice}::uuid,${otherGroup}::uuid,'MEMBER'),
        (${alice}::uuid,${leftGroup}::uuid,'MEMBER'),(${alice}::uuid,${bannedGroup}::uuid,'MEMBER'),(${bob}::uuid,${group}::uuid,'OWNER')`;
      await tx.$executeRaw`UPDATE pg_temp.personal_test_memberships SET left_at=now() WHERE workspace_id IN (${leftGroup}::uuid,${bannedGroup}::uuid)`;
      await tx.$executeRaw`UPDATE pg_temp.personal_test_memberships SET is_banned=true WHERE workspace_id=${bannedGroup}::uuid`;
      const ids = {};
      async function task(title, creator, assignee, workspace, due, status = 'TODO', priority = 'MEDIUM') {
        const id = randomUUID(); ids[title] = id;
        await tx.$executeRaw`INSERT INTO pg_temp.personal_test_tasks(id,title,created_by,assignee_id,workspace_id,position,due_at,status,completed_at,priority)
          VALUES (${id}::uuid,${title},${creator}::uuid,${assignee}::uuid,${workspace}::uuid,1,${due},${status},${status === 'DONE' ? new Date() : null},${priority})`;
      }
      await task('Self', alice, alice, group, new Date('2099-01-01'), 'TODO', 'LOW');
      await task('Delegated', alice, bob, group, new Date('2020-01-01'), 'IN_PROGRESS', 'HIGH');
      await task('Received', bob, alice, group, new Date('2020-02-01'));
      await task('Unassigned', alice, null, otherGroup, null);
      await task('Done', alice, alice, group, new Date('2020-01-01'), 'DONE');
      await task('Unrelated', bob, bob, group, null);
      await task('Left', alice, alice, leftGroup, null);
      await task('Banned', alice, alice, bannedGroup, null);
      const assigned = await listMyTasks('personal-alice', {}, db);
      assert.deepEqual(assigned.tasks.map(task => task.title), ['Received', 'Self']);
      assert.equal(assigned.tasks[0].creatorName, 'Bob'); assert.equal(assigned.tasks[0].assigneeName, 'Alice');
      const created = await listMyTasks('personal-alice', { scope: 'created' }, db);
      assert.deepEqual(created.tasks.map(task => task.title), ['Delegated', 'Self', 'Unassigned']);
      assert.equal(created.tasks[2].workspaceName, 'Group 1'); assert.equal(created.tasks[2].assigneeName, null);
      const all = await listMyTasks('personal-alice', { scope: 'created', status: 'ALL' }, db);
      assert.equal(all.total, 4); assert.equal(all.tasks.at(-1).title, 'Done');
      assert.equal((await listMyTasks('personal-alice', { scope: 'created', priority: 'HIGH' }, db)).tasks[0].title, 'Delegated');
      assert.equal((await listMyTasks('personal-alice', { scope: 'created', workspaceId: otherGroup }, db)).total, 1);
      assert.equal((await listMyTasks('personal-alice', { scope: 'created', workspaceId: bannedGroup }, db)).total, 0);
      assert.equal((await listMyTasks('personal-alice', { status: 'DONE' }, db)).total, 1);
      const second = await listMyTasks('personal-alice', { scope: 'created', page: '2', pageSize: '2' }, db);
      assert.equal(second.total, 3); assert.equal(second.pageCount, 2); assert.deepEqual(second.tasks.map(task => task.title), ['Unassigned']);
      assert.equal((await listMyTasks('personal-alice', { page: '999' }, db)).page, 1);
      assert.equal((await getTask('personal-alice', group, ids.Self, db)).title, 'Self');
      await assert.rejects(getTask('personal-alice', group, ids.Unassigned, db), error => error.code === 'TASK_NOT_FOUND');
      await assert.rejects(getTask('personal-alice', leftGroup, ids.Left, db), error => error.code === 'WORKSPACE_NOT_FOUND');
      await tx.$executeRaw`UPDATE pg_temp.personal_test_tasks SET assignee_id=${bob}::uuid WHERE id=${ids.Self}::uuid`;
      assert.equal((await listMyTasks('personal-alice', {}, db)).total, 1);
      assert.equal((await listMyTasks('personal-alice', { scope: 'created' }, db)).total, 3);
      await tx.$executeRaw`UPDATE pg_temp.personal_test_memberships SET left_at=now() WHERE user_id=${alice}::uuid AND workspace_id=${group}::uuid`;
      assert.equal((await listMyTasks('personal-alice', {}, db)).total, 0);
      assert.equal((await listMyTasks('personal-alice', { scope: 'created' }, db)).total, 1);
      assert.equal((await tx.$queryRaw`SELECT count(*)::int AS total FROM pg_temp.personal_test_tasks`)[0].total, 8);
      await tx.$executeRaw`UPDATE pg_temp.personal_test_users SET is_active=false,email=NULL,deleted_at=now() WHERE id=${alice}::uuid`;
      await assert.rejects(listMyTasks('personal-alice', {}, db), error => error.code === 'ACCOUNT_UNAVAILABLE');
    }, { timeout: 30000, maxWait: 10000 });
  } finally { await disconnectDatabase(); }
});
