"use client";

import { useEffect, useState } from "react";
import { io } from "socket.io-client";
import type { User } from "firebase/auth";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getFirebaseAuth } from "@/lib/firebase/client";

export function useTaskRealtime(user: User | null, workspaceId?: string) {
  const client = useQueryClient();
  const [state, setState] = useState<"connecting" | "connected" | "offline">("connecting");
  useEffect(() => {
    if (!user) return;
    let disposed = false;
    const socket = io(process.env.NEXT_PUBLIC_SOCKET_URL ?? new URL(api.defaults.baseURL!, window.location.origin).origin, {
      autoConnect: false,
      // Retrieve a fresh token for every connection attempt; never keep credentials in storage here.
      auth: async callback => {
        try {
          const token = await user.getIdToken();
          if (!disposed && getFirebaseAuth().currentUser?.uid === user.uid) callback({ token });
        } catch { if (!disposed) callback({ token: "" }); }
      },
    });
    const refresh = () => {
      if (disposed) return;
      void client.invalidateQueries({ queryKey: ["my-tasks", user.uid] });
      if (!workspaceId) {
        void client.invalidateQueries({ queryKey: ["my-task-detail", user.uid] });
        void client.invalidateQueries({ queryKey: ["workspaces", user.uid] });
        return;
      }
      void client.invalidateQueries({ queryKey: ["tasks", user.uid, workspaceId] });
      void client.invalidateQueries({ queryKey: ["dashboard", user.uid, workspaceId] });
      void client.invalidateQueries({ queryKey: ["activity", user.uid, workspaceId] });
    };
    socket.on("connect", () => {
      socket.emit(workspaceId ? "workspace:subscribe" : "my-tasks:subscribe", { workspaceId }, (result: { ok: boolean }) => {
        if (disposed) return;
        if (result.ok) { setState("connected"); refresh(); }
        else setState("offline");
      });
    });
    socket.on("tasks:changed", (event: { workspaceId: string }) => {
      if (event.workspaceId === workspaceId) refresh();
    });
    socket.on("my-tasks:changed", refresh);
    socket.on("connect_error", () => { if (!disposed) setState("offline"); });
    socket.on("disconnect", () => {
      if (!disposed) {
        setState("offline");
        refresh();
        if (workspaceId) void client.invalidateQueries({ queryKey: ["workspace", user.uid, workspaceId] });
      }
    });
    // Server disconnects (expired tokens or lost permission) need an explicit reconnect with fresh auth.
    const reconnect = setInterval(() => {
      if (!disposed && !socket.connected && getFirebaseAuth().currentUser?.uid === user.uid) socket.connect();
    }, 5000);
    socket.connect();
    return () => { disposed = true; clearInterval(reconnect); socket.removeAllListeners(); socket.disconnect(); };
  }, [user, workspaceId, client]);
  return state;
}
