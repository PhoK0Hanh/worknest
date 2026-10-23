import type { Server, Socket } from "socket.io";
import { z } from "zod";
import { verifyFirebaseIdToken } from "./firebase-admin.js";
import { getPrisma } from "./prisma.js";

type Identity = { uid: string; exp: number };
type Dependencies = { verify: (token: string) => Promise<Identity>; allowed: (uid: string, workspaceId: string) => Promise<boolean> };
const defaults: Dependencies = {
  verify: verifyFirebaseIdToken,
  allowed: async (uid, id) => {
    const rows = await getPrisma().$queryRaw<Array<{ id: string }>>`SELECT u.id FROM public.users u JOIN public.memberships m ON m.user_id=u.id
      WHERE u.firebase_uid=${uid} AND u.is_active=true AND m.workspace_id=${id}::uuid AND m.left_at IS NULL AND m.is_banned=false`;
    return rows.length > 0;
  },
};
let publish: (id: string) => Promise<void> = async () => {};
export function notifyTasksChanged(workspaceId: string) {
  // Called only after the service transaction resolves. Delivery errors never undo committed HTTP writes.
  void publish(workspaceId).catch(() => {});
}

export function attachRealtime(io: Server, dependencies: Dependencies = defaults) {
  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;
    if (typeof token !== "string" || !token || token.length > 16384) return next(new Error("UNAUTHORIZED"));
    try {
      const identity = await dependencies.verify(token);
      if (identity.exp * 1000 <= Date.now()) return next(new Error("UNAUTHORIZED"));
      socket.data.identity = identity;
      socket.data.token = token;
      next();
    } catch { next(new Error("UNAUTHORIZED")); }
  });
  async function authorized(socket: Socket, id: string) {
    const identity = await dependencies.verify(socket.data.token);
    return identity.exp * 1000 > Date.now() && identity.uid === socket.data.identity.uid && await dependencies.allowed(identity.uid, id);
  }
  io.on("connection", socket => {
    let checking = false;
    socket.on("workspace:subscribe", async (input, ack) => {
      // One workspace subscription per connection; ignore floods while a check is in progress.
      if (checking) return;
      checking = true;
      const parsed = z.uuid().safeParse(input?.workspaceId);
      try {
        if (!parsed.success || !await authorized(socket, parsed.data)) {
          if (typeof ack === "function") ack({ ok: false });
          socket.disconnect(true); return;
        }
        socket.data.workspaceId = parsed.data;
        if (typeof ack === "function") ack({ ok: true });
      } catch { socket.disconnect(true); }
      finally { checking = false; }
    });
    const expiration = setTimeout(() => socket.disconnect(true), Math.min(2 ** 31 - 1, socket.data.identity.exp * 1000 - Date.now()));
    // Recheck idle subscriptions too, so leaving a workspace eventually closes the socket.
    let auditing = false;
    const audit = setInterval(async () => {
      if (auditing || !socket.data.workspaceId) return;
      auditing = true;
      try { if (!await authorized(socket, socket.data.workspaceId)) socket.disconnect(true); }
      catch { socket.disconnect(true); }
      finally { auditing = false; }
    }, 30000);
    socket.on("disconnect", () => { clearTimeout(expiration); clearInterval(audit); });
  });
  const broadcast = async (id: string) => {
    // Re-authorize each recipient before emitting; stale membership never grants task events.
    await Promise.all([...io.sockets.sockets.values()].filter(socket => socket.data.workspaceId === id).map(async socket => {
      try {
        if (await authorized(socket, id)) socket.emit("tasks:changed", { workspaceId: id });
        else socket.disconnect(true);
      } catch { socket.disconnect(true); }
    }));
  };
  publish = broadcast;
  return () => { if (publish === broadcast) publish = async () => {}; };
}
