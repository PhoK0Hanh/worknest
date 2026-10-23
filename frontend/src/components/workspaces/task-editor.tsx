"use client";
import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/api";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { workspaceErrorMessage, type WorkspaceDetail } from "@/lib/workspaces";
import type { Task } from "./task-board";
import axios from "axios";
const priorities: Record<string, string> = { LOW: "LOW", MEDIUM: "MEDIUM", HIGH: "HIGH" };
function localDate(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
export function TaskEditor({ task, workspace, uid, onClose }: { task: Task; workspace: WorkspaceDetail; uid: string; onClose: () => void }) {
  const client = useQueryClient();
  const [priority, setPriority] = useState(task.priority);
  const [assignee, setAssignee] = useState(task.assigneeId ?? "none");
  const [status, setStatus] = useState(task.status);
  const save = useMutation({ retry: false, mutationFn: async (input: object) => {
    const user = getFirebaseAuth().currentUser;
    if (!user || user.uid !== uid) throw new Error("Session changed");
    await api.patch(`/workspaces/${workspace.id}/tasks/${task.id}`, input, { headers: { Authorization: `Bearer ${await user.getIdToken()}` } });
  }, onSuccess: async () => {
    await client.invalidateQueries({ queryKey: ["tasks", uid, workspace.id] });
    onClose();
  }});
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (save.isPending) return;
    const data = new FormData(event.currentTarget);
    const due = String(data.get("dueAt") ?? "");
    save.mutate({ title: String(data.get("title") ?? "").trim(), description: String(data.get("description") ?? "").trim() || null, priority, assigneeId: assignee === "none" ? null : assignee, status, dueAt: due ? new Date(due).toISOString() : null, expectedUpdatedAt: task.updatedAt });
  }
  // Preserve the edit snapshot; conflicts require reopening instead of overwriting newer data.
  const conflict = axios.isAxiosError(save.error) && save.error.response?.status === 409;
  return <Sheet open onOpenChange={value => { if (!value && !save.isPending) onClose(); }}><SheetContent className="overflow-y-auto sm:max-w-lg"><SheetHeader><SheetTitle>Chi tiết task</SheetTitle><SheetDescription>Xem và cập nhật công việc trong nhóm.</SheetDescription></SheetHeader><div className="px-4 pb-6"><p className="mb-2 text-xs text-muted-foreground">Tạo lúc: {new Date(task.createdAt).toLocaleString("vi-VN")}</p>{task.completedAt && <p className="mb-4 text-xs text-muted-foreground">Hoàn thành: {new Date(task.completedAt).toLocaleString("vi-VN")}</p>}<form onSubmit={submit} className="space-y-4"><fieldset disabled={save.isPending || conflict} className="space-y-4">
      <div className="space-y-2"><Label htmlFor="edit-task-title">Tiêu đề</Label><Input id="edit-task-title" name="title" required maxLength={200} defaultValue={task.title} /></div>
      <div className="space-y-2"><Label htmlFor="edit-task-description">Mô tả</Label><Textarea id="edit-task-description" name="description" maxLength={5000} defaultValue={task.description ?? ""} /></div>
      <div className="space-y-2"><Label htmlFor="edit-task-priority">Độ ưu tiên</Label><Select value={priority} onValueChange={setPriority}><SelectTrigger id="edit-task-priority" className="w-full"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(priorities).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-2"><Label htmlFor="edit-task-assignee">Người phụ trách</Label><Select value={assignee} onValueChange={setAssignee}><SelectTrigger id="edit-task-assignee" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Chưa được giao</SelectItem>{workspace.members.map(member => <SelectItem key={member.id} value={member.id}>{member.name}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-2"><Label htmlFor="edit-task-due">Hạn hoàn thành</Label><Input id="edit-task-due" name="dueAt" type="datetime-local" defaultValue={localDate(task.dueAt)} /></div>
<div className="space-y-2"><Label htmlFor="edit-task-status">Trạng thái</Label><Select value={status} onValueChange={setStatus}><SelectTrigger id="edit-task-status" className="w-full"><SelectValue /></SelectTrigger><SelectContent>{["TODO", "IN_PROGRESS", "DONE"].map(value => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div>
</fieldset>{save.isError && <p role="alert" className="text-sm text-destructive">{conflict ? "Task đã thay đổi. Đóng, tải lại bảng và mở lại task." : workspaceErrorMessage(save.error)}</p>}{conflict && <Button type="button" variant="outline" onClick={() => { void client.invalidateQueries({ queryKey: ["tasks", uid, workspace.id] }); onClose(); }}>Tải lại bảng</Button>}<Button type="submit" disabled={save.isPending || conflict}>{save.isPending ? "Đang lưu..." : "Lưu thay đổi"}</Button></form></div></SheetContent></Sheet>;
}
