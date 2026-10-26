import type { RequestHandler } from "express";
import { notifyTasksChanged } from "../lib/realtime.js";
import { createWorkspace, listWorkspaces, joinWorkspace, getWorkspace, leaveWorkspace, WorkspaceError } from "../services/workspaces.js";

export function createWorkspaceHandlers(services = { createWorkspace, listWorkspaces, joinWorkspace, getWorkspace, leaveWorkspace }) {
  function failure(response: Parameters<RequestHandler>[1], error: unknown) {
    const known = error instanceof WorkspaceError;
    response.status(known ? error.status : 503).json({
      error: known ? error.message : "Chưa thể xử lý workspace. Vui lòng thử lại.",
      code: known ? error.code : "WORKSPACE_UNAVAILABLE",
    });
  }
  const list: RequestHandler = async (_request, response) => {
    response.set("Cache-Control", "no-store");
    try {
      response.json({ workspaces: await services.listWorkspaces(response.locals.firebaseIdentity.uid) });
    } catch (error) { failure(response, error); }
  };
  const create: RequestHandler = async (request, response) => {
    response.set("Cache-Control", "no-store");
    if (!request.is("application/json")) {
      response.status(415).json({ error: "Yêu cầu phải dùng JSON.", code: "WORKSPACE_INVALID" });
      return;
    }
    try {
      response.status(201).json({ workspace: await services.createWorkspace(response.locals.firebaseIdentity.uid, request.body) });
    } catch (error) { failure(response, error); }
  };
  const join: RequestHandler = async (request, response) => {
    response.set("Cache-Control", "no-store");
    if (!request.is("application/json")) {
      response.status(415).json({ error: "Yêu cầu phải dùng JSON.", code: "JOIN_INVALID" });
      return;
    }
    try {
      response.json(await services.joinWorkspace(response.locals.firebaseIdentity.uid, request.body));
    } catch (error) { failure(response, error); }
  };
  const detail: RequestHandler = async (request, response) => {
    response.set("Cache-Control", "no-store");
    try {
      response.json({ workspace: await services.getWorkspace(response.locals.firebaseIdentity.uid, request.params.id) });
    } catch (error) { failure(response, error); }
  };
  const leave: RequestHandler = async (request, response) => {
    response.set("Cache-Control", "no-store");
    try {
      response.json(await services.leaveWorkspace(response.locals.firebaseIdentity.uid, request.params.id));
      if (typeof request.params.id === "string") notifyTasksChanged(request.params.id);
    } catch (error) { failure(response, error); }
  };
  return { list, create, join, detail, leave };
}
