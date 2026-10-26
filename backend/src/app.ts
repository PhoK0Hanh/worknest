import { management } from "./routes/management.js";
import { createMyTasksHandler } from "./routes/my-tasks.js";
import { createTaskHandlers } from "./routes/tasks.js";
import express, { type ErrorRequestHandler } from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { config } from "./config.js";
import { requireFirebaseAuth } from "./middleware/require-firebase-auth.js";
import { createSyncUserHandler } from "./routes/auth.js";
import { createWorkspaceHandlers } from "./routes/workspaces.js";
import { rateLimit } from "express-rate-limit";

export const app = express();
app.disable("x-powered-by");
app.use(helmet());
app.use(cors({ origin: config.FRONTEND_URL, credentials: true }));
app.use(express.json({ limit: "32kb" }));
app.use(cookieParser());

// Liveness only: successful responses do not imply a working Neon connection.
app.get("/api/health", (_request, response) => {
  response.set("Cache-Control", "no-store").json({ service: "worknest-api", status: "ok" });
});

// Firebase identity only: this does not grant access to Neon users or workspaces.
app.get("/api/auth/identity", requireFirebaseAuth, (_request, response) => {
  response.json({ firebase: response.locals.firebaseIdentity });
});

// Idempotent profile synchronization after login; no password is sent to Express.
app.post("/api/auth/sync", requireFirebaseAuth, createSyncUserHandler());

const workspaces = createWorkspaceHandlers();
// Bound hashing/creation work per verified user, not an ID supplied in the request body.
const createWorkspaceLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: (_request, response) => response.locals.firebaseIdentity.uid,
  message: { error: "Bạn đã tạo quá nhiều nhóm. Vui lòng thử lại sau.", code: "WORKSPACE_RATE_LIMIT" },
});
app.get("/api/workspaces", requireFirebaseAuth, workspaces.list);
app.post("/api/workspaces", requireFirebaseAuth, createWorkspaceLimit, workspaces.create);
// Bound password guessing and verification work; successful joins do not consume attempts.
const joinWorkspaceLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  skipSuccessfulRequests: true,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: (_request, response) => response.locals.firebaseIdentity.uid,
  message: { error: "Bạn đã thử tham gia quá nhiều lần. Vui lòng thử lại sau.", code: "JOIN_RATE_LIMIT" },
});
app.post("/api/workspaces/join", requireFirebaseAuth, joinWorkspaceLimit, workspaces.join);
app.get("/api/workspaces/:id", requireFirebaseAuth, workspaces.detail);
app.post("/api/workspaces/:id/leave", requireFirebaseAuth, workspaces.leave);

const tasks = createTaskHandlers();
app.get("/api/my-tasks", requireFirebaseAuth, createMyTasksHandler());
app.get("/api/workspaces/:id/tasks/:taskId", requireFirebaseAuth, tasks.detail);
app.patch("/api/workspaces/:id/tasks/order", requireFirebaseAuth, tasks.reorder);
app.delete("/api/workspaces/:id/tasks/:taskId", requireFirebaseAuth, tasks.remove);
app.patch("/api/workspaces/:id/tasks/:taskId", requireFirebaseAuth, tasks.update);
app.get("/api/workspaces/:id/tasks", requireFirebaseAuth, tasks.list);
app.post("/api/workspaces/:id/tasks", requireFirebaseAuth, tasks.create);

app.use("/api", management);

app.use((_request, response) => {
  response.status(404).json({ error: "Không tìm thấy API." });
});

const handleError: ErrorRequestHandler = (error: unknown, _request, response, _next) => {
  // Preserve known body-parser errors instead of reporting bad input as a server failure.
  const status = error && typeof error === "object" && "status" in error ? error.status : undefined;
  if (status === 400 || status === 413 || status === 415) {
    response.status(status).json({ error: status === 413 ? "Dữ liệu quá lớn." : "Dữ liệu yêu cầu không hợp lệ." });
    return;
  }
  console.error("Unexpected API error", error);
  response.status(500).json({ error: "Không xử lý được yêu cầu." });
};
app.use(handleError);
