import type { User } from "firebase/auth";
import { api } from "@/lib/api";
import type { Task } from "@/components/workspaces/task-board";

export type PersonalTask = Task & { workspaceId: string; workspaceName: string; assigneeName: string | null };
export type MyTaskFilters = { scope: string; status: string; priority: string; workspaceId: string; page: number };
export type MyTaskPage = { tasks: PersonalTask[]; total: number; page: number; pageCount: number; pageSize: number };

export async function getMyTasks(user: User, filters: MyTaskFilters, signal: AbortSignal) {
  const token = await user.getIdToken();
  signal.throwIfAborted();
  // Each filter and account gets its own cache entry; never reuse another view's rows while loading.
  return (await api.get<MyTaskPage>("/my-tasks", {
    signal, headers: { Authorization: `Bearer ${token}` },
    params: { ...filters, workspaceId: filters.workspaceId === "ALL" ? undefined : filters.workspaceId },
  })).data;
}
