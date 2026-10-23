import { cleanupDeletedAccounts } from "./lib/account-cleanup.js";
import { attachRealtime } from "./lib/realtime.js";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { app } from "./app.js";
import { config } from "./config.js";
import { disconnectDatabase } from "./lib/prisma.js";

export const server = createServer(app);
export const io = new Server(server, {
  cors: { origin: config.FRONTEND_URL, credentials: true },
});

attachRealtime(io);
void cleanupDeletedAccounts();
const accountCleanup = setInterval(() => { void cleanupDeletedAccounts(); }, 60000);
accountCleanup.unref();

server.listen(config.PORT, () => {
  console.log(`WorkNest API: http://localhost:${config.PORT}`);
});

// Release sockets and the HTTP listener when the development process stops.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    clearInterval(accountCleanup);
    io.close(() => { void disconnectDatabase(); });
    server.close();
  });
}
