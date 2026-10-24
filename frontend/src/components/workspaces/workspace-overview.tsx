"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, CheckCircle2, Clock3, ListTodo } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { TaskEditor } from "@/components/workspaces/task-editor";
import type { Task } from "@/components/workspaces/task-board";
import type { WorkspaceDetail } from "@/lib/workspaces";
import { useAuthSession } from "@/lib/auth/use-auth-session";
import { useTaskRealtime } from "@/lib/use-task-realtime";
import { formatDateTime } from "@/lib/date-time";
import { api } from "@/lib/api";

type Overview = {
  total: number; done: number; inProgress: number; todo: number; overdue: number;
  asOf: string; attention: Task[];
  recentActivity: Array<{ id: string; content: string; createdAt: string }>;
};

export function WorkspaceOverview({ workspace, onBoard, onActivity }: {
  workspace: WorkspaceDetail; onBoard: () => void; onActivity: () => void;
}) {
  const session = useAuthSession();
  const [selected, setSelected] = useState<Task | null>(null);
  useTaskRealtime(session.user, workspace.id);
  const query = useQuery({
    queryKey: ["dashboard", session.user?.uid, workspace.id],
    enabled: !!session.user,
    retry: false,
    refetchInterval: 60000,
    queryFn: async ({ signal }) => {
      const token = await session.user!.getIdToken();
      return (await api.get<Overview>(`/workspaces/${workspace.id}/dashboard`, { signal, headers: { Authorization: `Bearer ${token}` } })).data;
    },
  });
  if (query.isPending) return <div role="status" aria-label="Đang tải tổng quan" className="space-y-6"><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map(index => <Skeleton key={index} className="h-28" />)}</div><Skeleton className="h-64" /></div>;
  if (query.isError) return <div role="alert" className="space-y-3"><p>Chưa tải được tổng quan. Hãy kiểm tra kết nối và quyền truy cập.</p><Button variant="outline" onClick={() => void query.refetch()}>Thử lại</Button></div>;
  const data = query.data;
  const percent = data.total ? Math.round(data.done / data.total * 100) : 0;
  const stats = [
    { label: "Tổng task", value: data.total, icon: ListTodo },
    { label: "Đang thực hiện", value: data.inProgress, icon: Clock3 },
    { label: "Đã hoàn thành", value: data.done, icon: CheckCircle2 },
    { label: "Quá hạn", value: data.overdue, icon: AlertTriangle },
  ];
  return <section className="space-y-6">
    <div><h2 className="text-xl font-semibold">Tổng quan</h2><p className="mt-2 text-sm text-muted-foreground">Thống kê toàn bộ workspace · Cập nhật {formatDateTime(data.asOf)}</p></div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {stats.map(stat => <Card key={stat.label} className={stat.label === "Quá hạn" && stat.value > 0 ? "ring-destructive/30" : ""}><CardContent><div className="flex items-center justify-between gap-3 text-muted-foreground"><span>{stat.label}</span><stat.icon className="size-4" aria-hidden="true" /></div><p className={`mt-3 text-3xl font-semibold tabular-nums ${stat.label === "Quá hạn" && stat.value > 0 ? "text-destructive" : ""}`}>{stat.value}</p></CardContent></Card>)}
    </div>
    {!data.total && <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-dashed p-5"><p className="text-sm text-muted-foreground">Nhóm chưa có công việc. Tạo task đầu tiên để bắt đầu theo dõi tiến độ.</p><Button onClick={onBoard}>Đến bảng công việc<ArrowRight /></Button></div>}
    <div className="grid items-start gap-6 xl:grid-cols-2">
      <Card><CardHeader><CardTitle>Tiến độ hoàn thành</CardTitle><CardDescription>{data.done}/{data.total} task · {percent}%</CardDescription></CardHeader><CardContent className="space-y-5"><Progress value={percent} aria-label="Tiến độ hoàn thành" /><div className="grid grid-cols-3 gap-3">{[["Todo", data.todo], ["In Progress", data.inProgress], ["Done", data.done]].map(([label, count]) => <div key={label} className="rounded-lg bg-muted/60 p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-2 text-xl font-semibold tabular-nums">{count}</p></div>)}</div></CardContent></Card>
      <Card><CardHeader><CardTitle>Cần chú ý</CardTitle><CardDescription>Tối đa 5 task quá hạn hoặc đến hạn trong 7 ngày tới, ưu tiên hạn gần nhất.</CardDescription></CardHeader><CardContent>
        {data.attention.length ? <ul className="divide-y">{data.attention.map(task => {
          // Classify using the server's summary timestamp so counts and labels agree.
          const overdue = task.dueAt && new Date(task.dueAt) < new Date(data.asOf);
          return <li key={task.id}><button type="button" onClick={() => setSelected(task)} className="flex w-full items-center justify-between gap-4 rounded-sm py-3 text-left hover:text-primary focus-visible:outline-2 focus-visible:outline-ring"><span className="min-w-0"><span className="block truncate font-medium">{task.title}</span><span className={`mt-1 block text-xs ${overdue ? "text-destructive" : "text-muted-foreground"}`}>{overdue ? "Quá hạn" : "Sắp đến hạn"} · {task.dueAt && formatDateTime(task.dueAt)}</span></span><ArrowRight className="size-4 shrink-0" aria-hidden="true" /></button></li>;
        })}</ul> : <p className="py-4 text-sm text-muted-foreground">Không có task quá hạn hoặc sắp đến hạn trong 7 ngày tới.</p>}
      </CardContent></Card>
    </div>
    <Card><CardHeader className="flex flex-wrap items-center justify-between gap-3"><CardTitle>Hoạt động gần đây</CardTitle><Button variant="ghost" size="sm" onClick={onActivity}>Xem tất cả<ArrowRight /></Button></CardHeader><CardContent>{data.recentActivity.length ? <ul className="divide-y">{data.recentActivity.map(log => <li key={log.id} className="space-y-1 py-3"><p className="break-words text-sm">{log.content}</p><time dateTime={log.createdAt} className="text-xs text-muted-foreground">{formatDateTime(log.createdAt)}</time></li>)}</ul> : <p className="text-sm text-muted-foreground">Chưa có hoạt động nào.</p>}</CardContent></Card>
    {selected && session.user && <TaskEditor key={selected.id} task={selected} workspace={workspace} uid={session.user.uid} onClose={() => setSelected(null)} />}
  </section>;
}
