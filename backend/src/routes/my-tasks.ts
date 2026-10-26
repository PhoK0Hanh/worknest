import type { RequestHandler } from "express";
import { ZodError } from "zod";
import { listMyTasks } from "../services/my-tasks.js";
import { WorkspaceError } from "../services/workspaces.js";

export function createMyTasksHandler(list = listMyTasks): RequestHandler {
  return async (request, response) => {
    response.set("Cache-Control", "no-store");
    try {
      // Identity is always taken from Firebase middleware, never from a query parameter.
      response.json(await list(response.locals.firebaseIdentity.uid, request.query));
    } catch (error) {
      response.status(error instanceof ZodError ? 400 : error instanceof WorkspaceError ? error.status : 503).json({
        code: error instanceof WorkspaceError ? error.code : error instanceof ZodError ? "TASK_INVALID" : "TASK_UNAVAILABLE",
        error: "Chưa tải được công việc của bạn.",
      });
    }
  };
}
