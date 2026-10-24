import { notifyTasksChanged } from "../lib/realtime.js";
import type { RequestHandler } from "express";
import { ZodError } from "zod";
import { createTask, listTasks, reorderTasks, updateTask, deleteTask } from "../services/tasks.js";
import { WorkspaceError } from "../services/workspaces.js";

export function createTaskHandlers(services = { createTask, listTasks, reorderTasks, updateTask, deleteTask }) {
  function handler(create: boolean, reorder = false, update = false, remove = false): RequestHandler {
    return async (request, response) => {
      response.set("Cache-Control", "no-store");
      if ((create || reorder || update || remove) && !request.is("application/json")) {
        response.status(415).json({ code: "TASK_INVALID", error: "Yêu cầu phải dùng JSON." }); return;
      }
      try {
        const uid = response.locals.firebaseIdentity.uid;
        if (remove) response.json(await services.deleteTask(uid, request.params.id, request.params.taskId, request.body));
        else if (update) response.json(await services.updateTask(uid, request.params.id, request.params.taskId, request.body));
        else if (reorder) response.json(await services.reorderTasks(uid, request.params.id, request.body));
        else if (create) response.status(201).json({ task: await services.createTask(uid, request.params.id, request.body) });
        else response.json({ tasks: await services.listTasks(uid, request.params.id) });
        if ((create || update || reorder || remove) && typeof request.params.id === "string") notifyTasksChanged(request.params.id);
      } catch (error) {
        const status = error instanceof ZodError ? 400 : error instanceof WorkspaceError ? error.status : 503;
        response.status(status).json({ code: error instanceof WorkspaceError ? error.code : error instanceof ZodError ? "TASK_INVALID" : "TASK_UNAVAILABLE", error: "Chưa thể xử lý task." });
      }
    };
  }
  return { list: handler(false), create: handler(true), reorder: handler(false, true), update: handler(false, false, true), remove: handler(false, false, false, true) };
}
