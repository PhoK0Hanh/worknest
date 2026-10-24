"use client";
import { formatDateTime } from "@/lib/date-time";
import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel } from "@/components/ui/alert-dialog";
import { Trash2 } from "lucide-react";
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
  const [confirmDelete, setConfirmDelete] = useState(false);
  const currentUserId = client.getQueryData<{ id: string }>(["worknest-profile", uid])?.id;
  const canDelete = ["OWNER", "ADMIN"].includes(workspace.role) || currentUserId === task.createdBy;
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
  const remove = useMutation({
    retry: false,
    mutationFn: async () => {
      const user = getFirebaseAuth().currentUser;
      if (!user || user.uid !== uid) throw new Error("Session changed");
      await api.delete(`/workspaces/${workspace.id}/tasks/${task.id}`, { data: { expectedUpdatedAt: task.updatedAt }, headers: { Authorization: `Bearer ${await user.getIdToken()}` } });
    },
    onSuccess: async () => {
      await Promise.all(["tasks", "dashboard", "activity"].map(key => client.invalidateQueries({ queryKey: [key, uid, workspace.id] })));
      onClose();
    },
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (save.isPending) return;
    const data = new FormData(event.currentTarget);
    const due = String(data.get("dueAt") ?? "");
    save.mutate({ title: String(data.get("title") ?? "").trim(), description: String(data.get("description") ?? "").trim() || null, priority, assigneeId: assignee === "none" ? null : assignee, status, dueAt: due ? new Date(due).toISOString() : null, expectedUpdatedAt: task.updatedAt });
  }
  // Creator identity comes from the authorized API, including creators who have left the group.
  // Preserve the edit snapshot; conflicts require reopening instead of overwriting newer data.
  const conflict = axios.isAxiosError(save.error) && save.error.response?.status === 409;
  return <Sheet open onOpenChange={value => { if (!value && !save.isPending && !remove.isPending) onClose(); }}><SheetContent className="overflow-y-auto data-[side=right]:sm:max-w-lg"><SheetHeader><SheetTitle>Chi tiết task</SheetTitle><SheetDescription>Xem và cập nhật công việc trong nhóm.</SheetDescription></SheetHeader><div className="px-4 pb-6"><p className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground"><span className="break-words">Tạo bởi <span className="font-medium text-foreground">{task.creatorName}</span></span><span aria-hidden="true">·</span><time dateTime={task.createdAt}>{formatDateTime(task.createdAt)}</time></p>{task.completedAt && <p className="mb-4 text-xs text-muted-foreground">Hoàn thành: {formatDateTime(task.completedAt)}</p>}<form id="edit-task-form" onSubmit={submit} className="space-y-4"><fieldset disabled={save.isPending || remove.isPending || conflict} className="space-y-4">
      <div className="space-y-2"><Label htmlFor="edit-task-title">Tiêu đề</Label><Input id="edit-task-title" name="title" required maxLength={200} defaultValue={task.title} /></div>
      <div className="space-y-2"><Label htmlFor="edit-task-description">Mô tả</Label><Textarea id="edit-task-description" name="description" maxLength={5000} defaultValue={task.description ?? ""} /></div>
      <div className="space-y-2"><Label htmlFor="edit-task-priority">Độ ưu tiên</Label><Select value={priority} onValueChange={setPriority}><SelectTrigger id="edit-task-priority" className="w-full"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(priorities).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-2"><Label htmlFor="edit-task-assignee">Người phụ trách</Label><Select value={assignee} onValueChange={setAssignee}><SelectTrigger id="edit-task-assignee" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Chưa được giao</SelectItem>{workspace.members.map(member => <SelectItem key={member.id} value={member.id}>{member.name}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-2"><Label htmlFor="edit-task-due">Hạn hoàn thành</Label><Input id="edit-task-due" name="dueAt" type="datetime-local" defaultValue={localDate(task.dueAt)} /></div>
<div className="space-y-2"><Label htmlFor="edit-task-status">Trạng thái</Label><Select value={status} onValueChange={setStatus}><SelectTrigger id="edit-task-status" className="w-full"><SelectValue /></SelectTrigger><SelectContent>{["TODO", "IN_PROGRESS", "DONE"].map(value => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div>
</fieldset>{save.isError && <p role="alert" className="text-sm text-destructive">{conflict ? "Task đã thay đổi. Đóng, tải lại bảng và mở lại task." : workspaceErrorMessage(save.error)}</p>}{conflict && <Button type="button" variant="outline" onClick={() => { void client.invalidateQueries({ queryKey: ["tasks", uid, workspace.id] }); onClose(); }}>Tải lại bảng</Button>}</form>
{/* Keep primary and destructive actions together without submitting the form on delete. */}
<div className="mt-5 flex flex-wrap items-center justify-between gap-3">
<Button type="submit" form="edit-task-form" disabled={save.isPending || remove.isPending || conflict}>{save.isPending ? "Đang lưu..." : "Lưu thay đổi"}</Button>
{canDelete && <>
  {/* Keep confirmation open on errors; deletion is never retried automatically. */}
  <AlertDialog open={confirmDelete} onOpenChange={value => { if (!remove.isPending) setConfirmDelete(value); }}>
    <AlertDialogTrigger asChild><Button variant="destructive" disabled={save.isPending} onClick={() => remove.reset()}><Trash2 />Xóa task</Button></AlertDialogTrigger>
    <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Xóa task?</AlertDialogTitle><AlertDialogDescription>Bạn sẽ xóa vĩnh viễn task “{task.title}”. Thao tác này không thể hoàn tác.</AlertDialogDescription></AlertDialogHeader>
      {remove.isError && <p role="alert" className="text-sm text-destructive">{axios.isAxiosError(remove.error) && remove.error.response?.status === 409 ? "Task đã thay đổi. Hãy đóng và tải lại bảng trước khi xóa." : "Chưa thể xóa task. Kiểm tra quyền hoặc tải lại bảng trước khi thử lại."}</p>}
      <AlertDialogFooter><AlertDialogCancel disabled={remove.isPending}>Hủy</AlertDialogCancel><Button variant="destructive" disabled={remove.isPending} onClick={() => remove.mutate()}>{remove.isPending ? "Đang xóa..." : "Xóa task"}</Button></AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</>}
</div>
</div></SheetContent></Sheet>;
}
