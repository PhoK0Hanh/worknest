"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { User } from "firebase/auth";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, ClipboardList, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/reui/badge";
import { AccountAvatar } from "@/components/examples/c-avatar-14";
import { WorkNestShell, WorkspaceMenuButton } from "@/components/workspaces/worknest-shell";
import { TaskEditor } from "@/components/workspaces/task-editor";
import type { Task } from "@/components/workspaces/task-board";
import { useAuthSession } from "@/lib/auth/use-auth-session";
import { useWorkNestProfile, profileErrorMessage } from "@/lib/auth/profile";
import { getWorkspaces, getWorkspace, workspaceErrorMessage } from "@/lib/workspaces";
import { getMyTasks, type MyTaskFilters, type PersonalTask } from "@/lib/my-tasks";
import { useTaskRealtime } from "@/lib/use-task-realtime";
import { formatDateTime } from "@/lib/date-time";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { taskPriorityLabels, taskStatusLabels } from "@/lib/task-labels";
import { SaveFeedback } from "@/components/ui/save-feedback";
import { useTaskSaveFeedback } from "@/lib/use-task-save-feedback";

const states: Record<string, string> = { OPEN: "Chưa hoàn thành", ALL: "Tất cả trạng thái", ...taskStatusLabels };
const priorities: Record<string, string> = { ALL: "Tất cả mức ưu tiên", ...taskPriorityLabels };
const initialFilters: MyTaskFilters = { scope: "assigned", workspaceId: "ALL", status: "OPEN", priority: "ALL", page: 1 };

export function MyTasks() {
  const session = useAuthSession();
  const profile = useWorkNestProfile(session.user, true);
  const router = useRouter();
  useEffect(() => {
    if (session.ready && !session.user && !session.failed) router.replace("/login");
  }, [session.ready, session.user, session.failed, router]);
  const ready = !!session.user && profile.isSuccess && !profile.isFetching;
  return <WorkNestShell profileName={profile.data?.name || session.user?.email || "WorkNest"}>
    <header className="sticky top-0 z-20 flex h-20 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-5 lg:px-8">
      <WorkspaceMenuButton /><h1 className="truncate text-lg font-semibold tracking-tight">Công việc của tôi</h1>
    </header>
    <div className="space-y-6 px-5 py-8 lg:px-8 lg:py-10">
      <div><h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Công việc của tôi</h2><p className="mt-2 text-sm text-muted-foreground">Theo dõi việc được giao và việc bạn tạo trong các workspace đang tham gia.</p></div>
      {session.failed ? <p role="alert" className="text-sm text-destructive">Chưa khôi phục được phiên đăng nhập. Hãy tải lại trang.</p>
        : profile.isError ? <div role="alert" className="space-y-3"><p className="text-sm text-destructive">{profileErrorMessage(profile.error)}</p><Button variant="outline" onClick={() => void profile.refetch()}>Thử lại</Button></div>
        : ready ? <PersonalTaskList key={session.user!.uid} user={session.user!} /> : <MyTasksSkeleton />}
    </div>
  </WorkNestShell>;
}

function Filter({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Record<string, string> }) {
  const inputId = useId();
  return <div className="min-w-0 space-y-2"><Label htmlFor={inputId}>{label}</Label><Select value={value} onValueChange={onChange}><SelectTrigger id={inputId} aria-label={label} className="w-full"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(options).map(([id, text]) => <SelectItem key={id} value={id}>{text}</SelectItem>)}</SelectContent></Select></div>;
}

function MyTaskScopeTabs({ value }: { value: string }) {
  const listRef = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    // Measure the real trigger bounds so the pill follows clicks, keyboard navigation and resizing.
    function measure() {
      const active = list?.querySelector<HTMLElement>('[role="tab"][data-state="active"]');
      if (!list || !active) return;
      const bounds = list.getBoundingClientRect();
      const target = active.getBoundingClientRect();
      const next = { left: target.left - bounds.left, top: target.top - bounds.top, width: target.width, height: target.height };
      setIndicator(current => current && current.left === next.left && current.top === next.top && current.width === next.width && current.height === next.height ? current : next);
    }
    const frame = requestAnimationFrame(measure);
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    for (const trigger of list.querySelectorAll('[role="tab"]')) observer.observe(trigger);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); };
  }, [value]);

  return <TabsList ref={listRef} aria-label="Phạm vi công việc" data-indicator-ready={indicator ? "true" : "false"} className="worknest-sliding-tabs relative isolate h-11 max-w-full p-1">
    {indicator && <span aria-hidden="true" className="pointer-events-none absolute top-0 left-0 z-0 rounded-md bg-background shadow-sm transition-[transform,width,height] duration-200 ease-out motion-reduce:transition-none" style={{ width: indicator.width, height: indicator.height, top: indicator.top, transform: `translateX(${indicator.left}px)` }} />}
    <TabsTrigger value="assigned" className="relative z-10 px-3 sm:px-5">Được giao cho tôi</TabsTrigger>
    <TabsTrigger value="created" className="relative z-10 px-3 sm:px-5">Do tôi tạo</TabsTrigger>
  </TabsList>;
}

function PersonalTaskList({ user }: { user: User }) {
  const feedback = useTaskSaveFeedback();
  const [filters, setFilters] = useState(initialFilters);
  const [selected, setSelected] = useState<PersonalTask | null>(null);
  useTaskRealtime(user);
  const workspaces = useQuery({
    queryKey: ["workspaces", user.uid], queryFn: ({ signal }) => getWorkspaces(user, signal), retry: false,
    refetchInterval: 30000,
  });
  const query = useQuery({
    queryKey: ["my-tasks", user.uid, filters], queryFn: ({ signal }) => getMyTasks(user, filters, signal), retry: false, staleTime: 0,
    // Polling also repairs missed socket events and advances overdue ordering as time passes.
    refetchInterval: 15000,
  });
  const change = (name: keyof MyTaskFilters, value: string) => setFilters(current => ({ ...current, [name]: value, page: 1 }));
  const workspaceOptions = { ALL: "Tất cả workspace", ...Object.fromEntries((workspaces.data ?? []).map(item => [item.id, item.name])) };
  const data = query.data;
  return <>
    <Tabs value={filters.scope} onValueChange={scope => change("scope", scope)} className="gap-6">
      <MyTaskScopeTabs value={filters.scope} />
      <div className="grid items-end gap-4 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
        <Filter label="Workspace" value={filters.workspaceId} options={filters.workspaceId !== "ALL" && !workspaceOptions[filters.workspaceId as keyof typeof workspaceOptions] ? { ...workspaceOptions, [filters.workspaceId]: "Workspace đã chọn" } : workspaceOptions} onChange={value => change("workspaceId", value)} />
        <Filter label="Trạng thái" value={filters.status} options={states} onChange={value => change("status", value)} />
        <Filter label="Độ ưu tiên" value={filters.priority} options={priorities} onChange={value => change("priority", value)} />
        <div className="flex gap-2"><Button variant="outline" onClick={() => setFilters({ ...initialFilters, scope: filters.scope })}>Đặt lại</Button><Button variant="outline" size="icon" aria-label="Tải lại công việc" disabled={query.isFetching} onClick={() => { void query.refetch(); void workspaces.refetch(); }}><RefreshCw className={cn("size-4", query.isFetching && "animate-spin motion-reduce:animate-none")} /></Button></div>
      </div>
      {workspaces.isError && <p role="alert" className="text-sm text-destructive">Chưa tải được bộ lọc workspace. <button className="underline" onClick={() => void workspaces.refetch()}>Thử lại</button></p>}
      {/* One active panel keeps list behavior identical in both ownership views. */}
      {["assigned", "created"].map(scope => <TabsContent key={scope} value={scope} className="space-y-4">
        {query.isError ? <div role="alert" className="space-y-3 rounded-xl border p-5"><p>{workspaceErrorMessage(query.error)}</p><Button variant="outline" onClick={() => void query.refetch()}>Thử lại</Button></div>
          : query.isPending ? <MyTasksSkeleton rowsOnly />
          : data && <>
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm"><div className="flex flex-wrap items-center gap-4"><p className="font-medium">{data.total} công việc</p><SaveFeedback visible={!!feedback.taskId} /></div><p className="text-xs text-muted-foreground">Ưu tiên quá hạn, sau đó hạn gần nhất</p></div>
            {data.tasks.length ? <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <div aria-hidden="true" className="hidden grid-cols-[minmax(0,2fr)_minmax(0,1fr)_8rem_6rem_10rem] gap-4 border-b bg-slate-50 px-5 py-3 text-xs font-medium text-muted-foreground lg:grid"><span>Công việc / Workspace</span><span>Người thực hiện</span><span>Trạng thái</span><span>Ưu tiên</span><span>Hạn hoàn thành</span></div>
              <ul className="divide-y divide-slate-100">{data.tasks.map(task => <TaskRow key={task.id} task={task} highlighted={feedback.taskId === task.id} now={query.dataUpdatedAt} onOpen={() => setSelected(task)} />)}</ul>
            </div> : <div className="flex flex-col items-center rounded-xl border border-dashed px-5 py-14 text-center"><ClipboardList className="mb-4 size-9 text-muted-foreground" aria-hidden="true" /><h3 className="font-medium">Không có công việc phù hợp</h3><p className="mt-2 max-w-sm text-sm text-muted-foreground">{filters.scope === "assigned" ? "Các task được giao cho bạn sẽ xuất hiện tại đây." : "Các task bạn tạo trong nhóm đang tham gia sẽ xuất hiện tại đây."} Thử đổi bộ lọc để xem thêm.</p></div>}
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm"><p className="text-muted-foreground">Trang {data.page} / {data.pageCount}{data.total > 0 && ` · ${(data.page - 1) * data.pageSize + 1}–${Math.min(data.page * data.pageSize, data.total)} / ${data.total}`}</p><div className="flex gap-2"><Button variant="outline" disabled={query.isFetching || data.page <= 1} onClick={() => setFilters(current => ({ ...current, page: data.page - 1 }))}><ArrowLeft />Trước</Button><Button variant="outline" disabled={query.isFetching || data.page >= data.pageCount} onClick={() => setFilters(current => ({ ...current, page: data.page + 1 }))}>Sau<ArrowRight /></Button></div></div>
          </>}
      </TabsContent>)}
    </Tabs>
    {selected && <PersonalTaskDetail key={selected.id} task={selected} user={user} onSaved={() => feedback.markSaved(selected.id)} onClose={() => setSelected(null)} />}
  </>;
}

function TaskRow({ task, now, onOpen, highlighted }: { task: PersonalTask; now: number; onOpen: () => void; highlighted: boolean }) {
  const overdue = task.status !== "DONE" && task.dueAt && new Date(task.dueAt).getTime() < now;
  return <li className={cn("grid items-center gap-3 px-4 py-4 transition-[background-color,box-shadow] duration-200 motion-reduce:transition-none hover:bg-slate-50/60 sm:px-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_8rem_6rem_10rem] lg:gap-4", highlighted && "worknest-task-highlight")}>
    <div className="min-w-0"><button onClick={onOpen} className="block max-w-full truncate rounded-sm text-left text-sm font-semibold hover:text-primary hover:underline focus-visible:outline-2 focus-visible:outline-ring">{task.title}</button><Link href={`/workspaces/${task.workspaceId}`} className="mt-1 block max-w-full truncate text-xs text-muted-foreground hover:text-primary hover:underline">{task.workspaceName}</Link></div>
    <div className="flex min-w-0 items-center gap-2 text-sm"><AccountAvatar name={task.assigneeName || "?"} /><span className="truncate text-muted-foreground">{task.assigneeName || "Chưa được giao"}</span></div>
    <div className="flex flex-wrap items-center gap-2 lg:contents"><span><Badge variant={task.status === "DONE" ? "primary-light" : "secondary"}>{states[task.status] ?? task.status}</Badge></span><span><Badge variant={task.priority === "HIGH" ? "destructive-light" : task.priority === "MEDIUM" ? "warning-light" : "secondary"}>{priorities[task.priority] ?? task.priority}</Badge></span><span className={cn("text-xs", overdue ? "font-medium text-destructive" : "text-muted-foreground")}>{task.dueAt ? <><time dateTime={task.dueAt}>{formatDateTime(task.dueAt)}</time>{overdue && <span className="ml-1 lg:ml-0 lg:block">Quá hạn</span>}</> : "Chưa có hạn"}</span></div>
  </li>;
}

function PersonalTaskDetail({ task, user, onClose, onSaved }: { task: PersonalTask; user: User; onClose: () => void; onSaved: () => void }) {
  const query = useQuery({
    // Discard closed edit snapshots so reopening always starts with a fresh version for conflict checks.
    queryKey: ["my-task-detail", user.uid, task.workspaceId, task.id], retry: false, staleTime: 0, gcTime: 0, refetchInterval: 15000,
    queryFn: async ({ signal }) => {
      const token = await user.getIdToken();
      const [workspace, response] = await Promise.all([
        getWorkspace(user, task.workspaceId, signal),
        api.get<{ task: Task }>(`/workspaces/${task.workspaceId}/tasks/${task.id}`, { signal, headers: { Authorization: `Bearer ${token}` } }),
      ]);
      return { workspace, task: response.data.task };
    },
  });
  // An authorization error hides even previously cached detail after removal from the workspace.
  if (!query.isError && query.data) return <TaskEditor task={query.data.task} workspace={query.data.workspace} uid={user.uid} onClose={onClose} onSaved={onSaved} />;
  return <Sheet open onOpenChange={open => { if (!open) onClose(); }}><SheetContent className="data-[side=right]:sm:max-w-lg"><SheetHeader><SheetTitle>Chi tiết task</SheetTitle><SheetDescription>Đang kiểm tra thông tin và quyền truy cập workspace.</SheetDescription></SheetHeader><div className="space-y-4 px-4">{query.isError ? <div role="alert" className="space-y-3"><p className="text-sm text-destructive">Task không còn tồn tại, bạn không còn quyền truy cập hoặc kết nối bị gián đoạn.</p><Button variant="outline" onClick={() => void query.refetch()}>Thử lại</Button></div> : <><Skeleton className="h-8" /><Skeleton className="h-28" /><Skeleton className="h-10" /></>}</div></SheetContent></Sheet>;
}

function MyTasksSkeleton({ rowsOnly = false }: { rowsOnly?: boolean }) {
  return <div role="status" aria-label="Đang tải công việc" className="space-y-5">{!rowsOnly && <><Skeleton className="h-11 w-80 max-w-full" /><div className="grid gap-4 sm:grid-cols-3">{[0, 1, 2].map(index => <Skeleton key={index} className="h-16" />)}</div></>}<div className="divide-y rounded-xl border px-5">{[0, 1, 2, 3, 4].map(index => <div key={index} className="flex items-center justify-between gap-6 py-5"><div className="w-full max-w-sm space-y-2"><Skeleton className="h-5 w-3/4" /><Skeleton className="h-4 w-1/3" /></div><Skeleton className="h-6 w-24 shrink-0" /></div>)}</div></div>;
}
