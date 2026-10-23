import type { RequestHandler } from "express";
import { syncUser, UserSyncError, type SyncIdentity } from "../services/sync-user.js";

export function createSyncUserHandler(sync: (identity: SyncIdentity) => Promise<unknown> = syncUser): RequestHandler {
  return async (_request, response) => {
    response.set("Cache-Control", "no-store");
    try {
      // Only middleware-provided identity is trusted; request body cannot choose UID or email.
      const user = await sync(response.locals.firebaseIdentity);
      response.json({ user });
    } catch (error) {
      if (error instanceof UserSyncError) {
        response.status(error.status).json({ error: error.message, code: error.code });
        return;
      }
      response.status(503).json({ error: "Chưa thể tải hồ sơ WorkNest.", code: "PROFILE_UNAVAILABLE" });
    }
  };
}
