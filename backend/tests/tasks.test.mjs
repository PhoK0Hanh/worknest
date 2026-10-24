import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createTask, listTasks, reorderTasks, updateTask, deleteTask } from '../dist/services/tasks.js';
import { getPrisma, disconnectDatabase } from '../dist/lib/prisma.js';

test('task validation rejects forged creator/status and malformed fields before querying', async () => {
  const db = { $transaction: () => assert.fail('must not query') };
  for (const body of [{ title: ' ' }, { title: 'Task', status: 'DONE' }, { title: 'Task', createdBy: randomUUID() }, { title: 'Task', assigneeId: 'bad' }, { title: 'Task', dueAt: 'tomorrow' }]) {
    await assert.rejects(createTask('uid', randomUUID(), body, db));
  }
  await assert.rejects(listTasks('uid', 'bad', db));
});

test('Neon task authorization, assignment, ordering and atomic log rollback', { skip: process.env.RUN_DB_TESTS !== '1' }, async () => {
  try {
    await getPrisma().$transaction(async tx => {
      const tables = ['users', 'workspaces', 'memberships', 'tasks', 'activity_logs'];
      for (const table of tables) await tx.$executeRawUnsafe(`CREATE TEMP TABLE task_test_${table} (LIKE public.${table} INCLUDING ALL) ON COMMIT DROP`);
      const owner = randomUUID(), outsider = randomUUID(), group = randomUUID();
      await tx.$executeRaw`INSERT INTO pg_temp.task_test_users (id,firebase_uid,name,email) VALUES (${owner}::uuid, 'task-owner', 'Owner', 'task-owner@example.com'), (${outsider}::uuid, 'task-outsider', 'Outsider', 'task-outsider@example.com')`;
      await tx.$executeRaw`INSERT INTO pg_temp.task_test_workspaces (id,name,join_code,join_password_hash) VALUES (${group}::uuid,'Test','AABBCCDDEEFF','fixture')`;
      await tx.$executeRaw`INSERT INTO pg_temp.task_test_memberships(user_id,workspace_id,role) VALUES (${owner}::uuid,${group}::uuid,'OWNER')`;
      let failLog = false;
      function redirect(strings) {
        const parts = strings.map(part => tables.reduce((text, table) => text.replaceAll(`public.${table}`, `pg_temp.task_test_${table}`), part));
        parts.raw = [...parts]; return parts;
      }
      const mapped = {
        $queryRaw: (strings, ...values) => tx.$queryRaw(redirect(strings), ...values),
        $executeRaw: (strings, ...values) => { if (failLog && strings.join('').includes('activity_logs')) throw new Error('Log failure'); return tx.$executeRaw(redirect(strings), ...values); },
      };
      const db = { $transaction: async action => {
        await tx.$executeRawUnsafe('SAVEPOINT task_operation');
        try { const result = await action(mapped); await tx.$executeRawUnsafe('RELEASE SAVEPOINT task_operation'); return result; }
        catch (error) { await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT task_operation'); await tx.$executeRawUnsafe('RELEASE SAVEPOINT task_operation'); throw error; }
      }};
      await assert.rejects(listTasks('task-outsider', group, db), error => error.code === 'WORKSPACE_NOT_FOUND');
      await assert.rejects(createTask('task-outsider', group, { title: 'Denied' }, db));
      await assert.rejects(createTask('task-owner', group, { title: 'Denied', assigneeId: outsider }, db), error => error.code === 'ASSIGNEE_INVALID');
      await createTask('task-owner', group, { title: ' First ', assigneeId: owner, dueAt: '2026-12-01T10:30:00+07:00' }, db);
      await createTask('task-owner', group, { title: 'Second' }, db);
      const tasks = await listTasks('task-owner', group, db);
      assert.equal(tasks.length, 2); assert.equal(tasks[0].title, 'First');
      assert.equal(tasks[0].creatorName, 'Owner'); assert.equal(tasks[0].createdBy, owner);
      assert.equal(tasks[0].assigneeId, owner); assert.equal(tasks[0].status, 'TODO');
      assert.equal(tasks[0].dueAt.toISOString(), '2026-12-01T03:30:00.000Z');
      assert.equal(tasks[1].position, 2); assert.equal(tasks[1].assigneeId, null);
      assert.equal(tasks[1].priority, 'MEDIUM');
      const before = { TODO: tasks.map(task => task.id), IN_PROGRESS: [], DONE: [] };
      const done = { TODO: [tasks[1].id], IN_PROGRESS: [], DONE: [tasks[0].id] };
      await assert.rejects(reorderTasks('task-outsider', group, { previous: before, next: done }, db));
      await reorderTasks('task-owner', group, { previous: before, next: done }, db);
      let moved = (await listTasks('task-owner', group, db)).find(task => task.id === tasks[0].id);
      assert.equal(moved.status, 'DONE'); assert.ok(moved.completedAt);
      await assert.rejects(reorderTasks('task-owner', group, { previous: before, next: done }, db), error => error.code === 'BOARD_CONFLICT');
      const reopened = { TODO: [tasks[1].id], IN_PROGRESS: [tasks[0].id], DONE: [] };
      await reorderTasks('task-owner', group, { previous: done, next: reopened }, db);
      moved = (await listTasks('task-owner', group, db)).find(task => task.id === tasks[0].id);
      assert.equal(moved.completedAt, null); assert.equal(moved.status, 'IN_PROGRESS');
      failLog = true;
      await assert.rejects(reorderTasks('task-owner', group, { previous: reopened, next: done }, db));
      assert.equal((await listTasks('task-owner', group, db)).find(task => task.id === tasks[0].id).status, 'IN_PROGRESS');
      await assert.rejects(createTask('task-owner', group, { title: 'Rollback' }, db));
      assert.equal((await listTasks('task-owner', group, db)).length, 2);
      assert.equal((await tx.$queryRaw`SELECT count(*)::int AS count FROM pg_temp.task_test_activity_logs`)[0].count, 4);
      failLog = false;
      const snapshot = (await listTasks('task-owner', group, db)).find(task => task.id === tasks[0].id);
      const edit = { title: 'Edited task', description: 'Updated details', priority: 'HIGH', assigneeId: owner, dueAt: null, status: 'DONE', expectedUpdatedAt: snapshot.updatedAt.toISOString() };
      await assert.rejects(updateTask('task-outsider', group, snapshot.id, edit, db));
      await assert.rejects(updateTask('task-owner', group, snapshot.id, { ...edit, assigneeId: outsider }, db), error => error.code === 'ASSIGNEE_INVALID');
      await updateTask('task-owner', group, snapshot.id, edit, db);
      const edited = (await listTasks('task-owner', group, db)).find(task => task.id === snapshot.id);
      assert.equal(edited.title, 'Edited task'); assert.equal(edited.priority, 'HIGH'); assert.ok(edited.completedAt);
      await assert.rejects(updateTask('task-owner', group, snapshot.id, edit, db), error => error.code === 'TASK_CONFLICT');
      await updateTask('task-owner', group, snapshot.id, { ...edit, title: 'Edited again', expectedUpdatedAt: edited.updatedAt.toISOString() }, db);
      const again = (await listTasks('task-owner', group, db)).find(task => task.id === snapshot.id);
      assert.equal(again.completedAt.toISOString(), edited.completedAt.toISOString());
      failLog = true;
      await assert.rejects(updateTask('task-owner', group, snapshot.id, { ...edit, title: 'Rollback edit', expectedUpdatedAt: again.updatedAt.toISOString() }, db));
      assert.equal((await listTasks('task-owner', group, db)).find(task => task.id === snapshot.id).title, 'Edited again');
      await assert.rejects(deleteTask('task-owner', group, snapshot.id, { expectedUpdatedAt: again.updatedAt.toISOString() }, db));
      assert.equal((await listTasks('task-owner', group, db)).length, 2);
      failLog = false;
      await assert.rejects(deleteTask('task-outsider', group, snapshot.id, { expectedUpdatedAt: again.updatedAt.toISOString() }, db), error => error.code === 'WORKSPACE_NOT_FOUND');
      await tx.$executeRaw`INSERT INTO pg_temp.task_test_memberships(user_id,workspace_id,role) VALUES (${outsider}::uuid,${group}::uuid,'MEMBER')`;
      await assert.rejects(deleteTask('task-outsider', group, snapshot.id, { expectedUpdatedAt: again.updatedAt.toISOString() }, db), error => error.code === 'TASK_DELETE_FORBIDDEN');
      await assert.rejects(deleteTask('task-owner', group, snapshot.id, { expectedUpdatedAt: snapshot.updatedAt.toISOString() }, db), error => error.code === 'TASK_CONFLICT');
      await tx.$executeRaw`UPDATE pg_temp.task_test_memberships SET role='ADMIN' WHERE user_id=${outsider}::uuid`;
      await deleteTask('task-outsider', group, snapshot.id, { expectedUpdatedAt: again.updatedAt.toISOString() }, db);
      assert.equal((await listTasks('task-owner', group, db)).length, 1);
      await tx.$executeRaw`UPDATE pg_temp.task_test_memberships SET role='MEMBER' WHERE user_id=${owner}::uuid`;
      const remaining = (await listTasks('task-owner', group, db))[0];
      await deleteTask('task-owner', group, remaining.id, { expectedUpdatedAt: remaining.updatedAt.toISOString() }, db);
      assert.equal((await listTasks('task-owner', group, db)).length, 0);


    }, { timeout: 30000, maxWait: 10000 });
  } finally { await disconnectDatabase(); }
});
