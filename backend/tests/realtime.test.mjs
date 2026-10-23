import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { Server } from 'socket.io';
import { attachRealtime, notifyTasksChanged } from '../dist/lib/realtime.js';
// Exercise the same Socket.IO client installed in our frontend, without a second copy.
const requireFrontend = createRequire(new URL('../../frontend/package.json', import.meta.url));
const { io: connect } = requireFrontend('socket.io-client');

test('realtime authenticates, isolates workspace subscribers and revokes former members', { timeout: 10000 }, async () => {
  const server = createServer();
  const io = new Server(server);
  const group = randomUUID();
  const otherGroup = randomUUID();
  const grants = new Set(['alice:' + group, 'bob:' + group, 'other:' + otherGroup]);
  const detach = attachRealtime(io, {
    verify: async token => { if (!['alice', 'bob', 'other', 'outsider'].includes(token)) throw new Error('Invalid'); return { uid: token, exp: Math.floor(Date.now()/1000)+60 }; },
    allowed: async (uid, id) => grants.has(uid + ':' + id),
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const url = `http://127.0.0.1:${server.address().port}`;
  const clients = [];
  function client(token) { const socket = connect(url, { auth: { token }, autoConnect: false, reconnection: false }); clients.push(socket); return socket; }
  async function subscribe(token, id) {
    const socket = client(token); const ready = once(socket, 'connect'); socket.connect(); await ready;
    const result = await new Promise(resolve => socket.emit('workspace:subscribe', { workspaceId: id }, resolve));
    return { socket, result };
  }
  try {
    const invalid = client('invalid'); const rejected = once(invalid, 'connect_error'); invalid.connect(); await rejected;
    const outsider = await subscribe('outsider', group); assert.equal(outsider.result.ok, false);
    const alice = await subscribe('alice', group); assert.equal(alice.result.ok, true);
    const bob = await subscribe('bob', group); assert.equal(bob.result.ok, true);
    const other = await subscribe('other', otherGroup);
    let leaked = 0; other.socket.on('tasks:changed', () => leaked++);
    const a = once(alice.socket, 'tasks:changed'), b = once(bob.socket, 'tasks:changed');
    notifyTasksChanged(group);
    assert.equal((await a)[0].workspaceId, group); await b;
    grants.delete('bob:' + group);
    let revokedEvents = 0; bob.socket.on('tasks:changed', () => revokedEvents++);
    const disconnected = once(bob.socket, 'disconnect'); const refreshed = once(alice.socket, 'tasks:changed');
    notifyTasksChanged(group); await disconnected; await refreshed;
    assert.equal(leaked, 0); assert.equal(revokedEvents, 0);
  } finally { clients.forEach(socket => socket.disconnect()); detach(); await new Promise(resolve => io.close(resolve)); }
});
