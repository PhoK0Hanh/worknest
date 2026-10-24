"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DynamicTaskKanban, type KanbanTask } from "@/components/examples/c-kanban-2";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TaskColumnsSkeleton } from "@/components/workspaces/workspace-skeleton";
import { api } from "@/lib/api";
import { useAuthSession } from "@/lib/auth/use-auth-session";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { workspaceErrorMessage, type WorkspaceDetail } from "@/lib/workspaces";
import { TaskEditor } from "@/components/workspaces/task-editor";
import { useTaskRealtime } from "@/lib/use-task-realtime";
import axios from "axios";

export type Task = { createdBy: string; creatorName: string; id: string; title: string; description: string | null; priority: string; status: string; assigneeId: string | null; dueAt: string | null; createdAt: string; updatedAt: string; completedAt: string | null };
type TaskInput = { title: string; description: string | null; priority: string; assigneeId: string | null; dueAt: string | null };
const columns = [{ id: "TODO", label: "Todo" }, { id: "IN_PROGRESS", label: "In Progress" }, { id: "DONE", label: "Done" }];
const priorities: Record<string, string> = { LOW: "Thấp", MEDIUM: "Trung bình", HIGH: "Cao" };
function message(error: unknown) {
  if (axios.isAxiosError(error)) {
    if (error.response?.data?.code === "ASSIGNEE_INVALID") return "Người được giao không còn là thành viên hoạt động. Hãy tải lại trang.";
    if (error.response?.data?.code === "TASK_INVALID") return "Kiểm tra tiêu đề, mô tả và hạn hoàn thành.";
  }
  return workspaceErrorMessage(error);
}

export function TaskBoard({ workspace }: { workspace: WorkspaceDetail }) {
  const session = useAuthSession();
  const client = useQueryClient();
  // Keep receiving workspace updates without displaying connection status in the board.
  useTaskRealtime(session.user, workspace.id);
  const [moveError, setMoveError] = useState(false);
  const [selected, setSelected] = useState<Task | null>(null);
  const [open, setOpen] = useState(false);
  const [priority, setPriority] = useState("MEDIUM");
  const [assignee, setAssignee] = useState("none");
  const key = ["tasks", session.user?.uid ?? null, workspace.id];
  const tasks = useQuery({
    queryKey: key, enabled: !!session.user, retry: false, refetchOnWindowFocus: false,
    queryFn: async ({ signal }) => {
      const token = await session.user!.getIdToken();
      return (await api.get<{ tasks: Task[] }>(`/workspaces/${workspace.id}/tasks`, { signal, headers: { Authorization: `Bearer ${token}` } })).data.tasks;
    },
  });
  const create = useMutation({
    // A timed-out create may already be committed; never retry automatically.
    retry: false,
    mutationFn: async ({ input, uid }: { input: TaskInput; uid: string }) => {
      const user = getFirebaseAuth().currentUser;
      if (!user || user.uid !== uid) throw new Error("Session changed");
      await api.post(`/workspaces/${workspace.id}/tasks`, input, { headers: { Authorization: `Bearer ${await user.getIdToken()}` } });
    },
    onSuccess: async (_result, submitted) => {
      await client.invalidateQueries({ queryKey: ["tasks", submitted.uid, workspace.id] });
      if (getFirebaseAuth().currentUser?.uid === submitted.uid) setOpen(false);
    },
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session.user || create.isPending) return;
    const data = new FormData(event.currentTarget);
    const due = String(data.get("dueAt") ?? "");
    create.mutate({ uid: session.user.uid, input: { title: String(data.get("title") ?? "").trim(), description: String(data.get("description") ?? "").trim() || null, priority, assigneeId: assignee === "none" ? null : assignee, dueAt: due ? new Date(due).toISOString() : null } });
  }
  return <section aria-label="Bảng công việc" className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-4"><div><h2 className="text-xl font-semibold">Bảng công việc</h2><p className="mt-2 text-sm text-muted-foreground">Theo dõi công việc của nhóm theo trạng thái.</p></div><Button disabled={!session.user} onClick={() => { create.reset(); setPriority("MEDIUM"); setAssignee("none"); setOpen(true); }}><Plus />Tạo task</Button></div>
    {moveError && <p role="alert" className="rounded-lg border border-destructive/30 p-3 text-sm text-destructive">Chưa lưu được thao tác hoặc bảng đã thay đổi. Dữ liệu đang được tải lại từ máy chủ.</p>}
    {tasks.isError ? <div role="alert" className="space-y-3 rounded-xl border p-5"><p>{message(tasks.error)}</p><Button variant="outline" onClick={() => void tasks.refetch()}>Tải lại</Button></div> : tasks.isPending ? <TaskColumnsSkeleton /> : <DynamicTaskKanban onTaskClick={id => { const task = tasks.data?.find(item => item.id === id); if (task) setSelected(task); }} key={`${session.user?.uid}:${workspace.id}:${tasks.dataUpdatedAt}`} initial={Object.fromEntries(columns.map(column => [column.id, (tasks.data ?? []).filter(task => task.status === column.id).map(task => ({ id: task.id, title: task.title, description: task.description ?? undefined, priority: task.priority.toLowerCase() as KanbanTask["priority"], assignee: task.assigneeId ? workspace.members.find(member => member.id === task.assigneeId)?.name ?? "Thành viên cũ" : undefined, dueDate: task.dueAt ? new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium" }).format(new Date(task.dueAt)) : undefined }))]))} onSave={async (next, previous) => {
      const user = session.user;
      if (!user || getFirebaseAuth().currentUser?.uid !== user.uid) throw new Error("Session changed");
      const ids = (value: Record<string, KanbanTask[]>) => Object.fromEntries(columns.map(column => [column.id, value[column.id].map(task => task.id)]));
      setMoveError(false);
      try {
        await api.patch(`/workspaces/${workspace.id}/tasks/order`, { next: ids(next), previous: ids(previous) }, { headers: { Authorization: `Bearer ${await user.getIdToken()}` } });
      } catch (error) {
        setMoveError(true);
        throw error;
      } finally {
        // Refetch after success, conflict or timeout: the server is authoritative.
        await client.invalidateQueries({ queryKey: ["tasks", user.uid, workspace.id] });
      }
    }} />}
    {selected && session.user && <TaskEditor key={selected.id} task={selected} workspace={workspace} uid={session.user.uid} onClose={() => setSelected(null)} />}
    <Dialog open={open} onOpenChange={value => { if (!create.isPending) setOpen(value); }}><DialogContent className="max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle>Tạo task</DialogTitle><DialogDescription>Task mới được thêm vào cột Todo. Hạn hiển thị theo giờ địa phương của bạn.</DialogDescription></DialogHeader><form onSubmit={submit} className="space-y-4"><fieldset disabled={create.isPending} className="space-y-4">
      <div className="space-y-2"><Label htmlFor="task-title">Tiêu đề</Label><Input id="task-title" name="title" required maxLength={200} /></div>
      <div className="space-y-2"><Label htmlFor="task-description">Mô tả</Label><Textarea id="task-description" name="description" maxLength={5000} /></div>
      <div className="space-y-2"><Label htmlFor="task-priority">Độ ưu tiên</Label><Select value={priority} onValueChange={setPriority}><SelectTrigger id="task-priority" className="w-full"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(priorities).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-2"><Label htmlFor="task-assignee">Người phụ trách</Label><Select value={assignee} onValueChange={setAssignee}><SelectTrigger id="task-assignee" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Chưa được giao</SelectItem>{workspace.members.map(member => <SelectItem key={member.id} value={member.id}>{member.name}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-2"><Label htmlFor="task-due">Hạn hoàn thành</Label><Input id="task-due" name="dueAt" type="datetime-local" /></div>
    </fieldset>{create.isError && <p role="alert" className="text-sm text-destructive">{message(create.error)}</p>}<Button type="submit" disabled={create.isPending}>{create.isPending ? <LoaderCircle className="animate-spin" /> : <Plus />}{create.isPending ? "Đang tạo..." : "Tạo task"}</Button></form></DialogContent></Dialog>
  </section>;
}
