import express, { type ErrorRequestHandler } from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { config } from "./config.js";
import { requireFirebaseAuth } from "./middleware/require-firebase-auth.js";

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
