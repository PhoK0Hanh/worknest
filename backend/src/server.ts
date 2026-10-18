import { createServer } from "node:http";
import { Server } from "socket.io";
import { app } from "./app.js";
import { config } from "./config.js";

export const server = createServer(app);
export const io = new Server(server, {
  cors: { origin: config.FRONTEND_URL, credentials: true },
});

// Only a connection handshake for now; workspace events require future authentication.
io.on("connection", (socket) => {
  socket.emit("server:ready", { service: "worknest-api" });
});

server.listen(config.PORT, () => {
  console.log(`WorkNest API: http://localhost:${config.PORT}`);
});

// Release sockets and the HTTP listener when the development process stops.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    io.close();
    server.close();
  });
}
