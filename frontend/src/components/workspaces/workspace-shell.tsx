"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Activity, CalendarDays, Columns3, LayoutGrid, ShieldCheck, Users } from "lucide-react";
import { WorkNestShell, WorkspaceMenuButton } from "@/components/workspaces/worknest-shell";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type { WorkspaceDetail } from "@/lib/workspaces";

const tabs = [
  { id: "board", label: "Bảng công việc", icon: Columns3 },
  { id: "members", label: "Thành viên", icon: Users },
  { id: "overview", label: "Tổng quan", icon: LayoutGrid },
  { id: "activity", label: "Hoạt động", icon: Activity },
] as const;
type Tab = typeof tabs[number]["id"];
const roles: Record<string, string> = { OWNER: "Owner", ADMIN: "Admin", MEMBER: "Member" };

export function WorkspaceShell({ workspace, profileName, children }: {
  workspace: WorkspaceDetail;
  profileName: string;
  children: ReactNode;
}) {
  const [tab, setTab] = useState<Tab>("members");
  const tabList = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);
  useEffect(() => {
    const list = tabList.current;
    if (!list) return;
    // Measure actual label widths so the sliding underline survives resizing and member count changes.
    function measure() {
      const active = list?.querySelector<HTMLElement>('[role="tab"][data-state="active"]');
      if (active && list) {
        const bounds = list.getBoundingClientRect();
        const item = active.getBoundingClientRect();
        setIndicator({ left: item.left - bounds.left, width: item.width });
      }
    }
    const frame = requestAnimationFrame(measure);
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    for (const item of list.querySelectorAll('[role="tab"]')) observer.observe(item);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); };
  }, [tab, workspace.memberCount]);


  return (
    <WorkNestShell profileName={profileName}>
          <Tabs value={tab} onValueChange={value => setTab(value as Tab)} className="gap-0">
          {/* Keep workspace navigation visible within the main scrolling pane. */}
          <header className="sticky top-0 z-20 border-b border-slate-200 bg-white">
            {/* Match the sidebar logo row height; tabs occupy a separate row below. */}
            <div className="flex h-20 shrink-0 items-center gap-3 border-b border-slate-200 px-5 lg:px-8">
              <WorkspaceMenuButton />
              <h1 className="min-w-0 truncate text-xl font-semibold tracking-tight sm:text-2xl" title={workspace.name}>{workspace.name}</h1>
              <span className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-primary"><ShieldCheck className="size-4" />{roles[workspace.role] || workspace.role}</span>
            </div>
            {/* Use underline-only tabs; reserve outlines for keyboard focus. */}
            {/* Prevent tab decorations from creating a nested vertical scroll area. */}
            <div className="overflow-x-auto overflow-y-hidden px-5 lg:px-8">
              <TabsList ref={tabList} variant="line" aria-label="Workspace" className="relative gap-2 rounded-none p-0 group-data-horizontal/tabs:h-12">
                {tabs.map(item => <TabsTrigger key={item.id} value={item.id} className="h-full flex-none gap-2 after:hidden rounded-none border-0 bg-transparent px-3 py-3 text-sm shadow-none data-active:bg-transparent data-active:text-primary data-active:shadow-none data-[state=active]:bg-transparent data-[state=active]:text-primary data-[state=active]:shadow-none data-[state=active]:after:bg-primary data-[state=active]:after:opacity-100 dark:data-active:bg-transparent dark:data-[state=active]:bg-transparent after:bottom-0 group-data-horizontal/tabs:after:bottom-0"><item.icon className="size-4" />{item.label}{item.id === "members" && <span className="rounded bg-slate-50 px-1.5 py-0.5 text-[11px] text-muted-foreground">{workspace.memberCount}</span>}</TabsTrigger>)}
                {indicator && <span aria-hidden="true" className="pointer-events-none absolute bottom-0 left-0 h-0.5 bg-primary transition-[transform,width] duration-200 ease-out motion-reduce:transition-none" style={{ width: indicator.width, transform: `translateX(${indicator.left}px)` }} />}
              </TabsList>
            </div>
          </header>

          {/* Each trigger owns a stable panel for keyboard and screen-reader navigation. */}
          <TabsContent value="members" className="m-0 p-5 lg:p-8">{children}</TabsContent>
            <TabsContent value="overview" className="m-0 p-5 lg:p-8"><section aria-label="Tổng quan workspace" className="space-y-6"><div><h2 className="text-xl font-semibold">Tổng quan</h2><p className="mt-2 text-sm text-muted-foreground">Thông tin chung về không gian làm việc của nhóm.</p></div><div className="grid gap-4 sm:grid-cols-2"><div className="rounded-xl border border-slate-200 p-6"><Users className="mb-4 size-5 text-primary" /><p className="text-3xl font-semibold">{workspace.memberCount}</p><p className="mt-2 text-sm text-muted-foreground">Thành viên đang tham gia</p></div><div className="rounded-xl border border-slate-200 p-6"><CalendarDays className="mb-4 size-5 text-primary" /><p className="text-xl font-semibold">{new Intl.DateTimeFormat("vi-VN", { dateStyle: "long" }).format(new Date(workspace.createdAt))}</p><p className="mt-2 text-sm text-muted-foreground">Ngày tạo workspace</p></div></div></section></TabsContent>
            {/* Task and activity APIs are not available yet; never present sample records as real data. */}
            <TabsContent value="board" className="m-0 p-5 lg:p-8"><section aria-label="Bảng công việc"><div className="mb-6"><h2 className="text-xl font-semibold">Bảng công việc</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Đây là bố cục Kanban của nhóm. Chức năng tạo task và kéo thả sẽ được bổ sung ở bước tiếp theo.</p></div><div className="grid gap-4 xl:grid-cols-3">{[{ title: "Todo", color: "bg-slate-400" }, { title: "In Progress", color: "bg-amber-400" }, { title: "Done", color: "bg-primary" }].map(column => <div key={column.title} className="min-h-64 rounded-xl border border-slate-200 bg-white p-4"><h3 className="flex items-center gap-2 text-sm font-semibold"><span className={cn("size-2 rounded-full", column.color)} />{column.title}</h3><div className="mt-4 rounded-lg border border-dashed border-slate-200 bg-white px-4 py-10 text-center text-xs leading-5 text-muted-foreground">Task sẽ hiển thị tại đây.</div></div>)}</div></section></TabsContent>
            <TabsContent value="activity" className="m-0 p-5 lg:p-8"><section aria-label="Hoạt động workspace" className="rounded-xl border border-dashed border-slate-200 px-6 py-16 text-center"><Activity className="mx-auto mb-4 size-8 text-primary" /><h2 className="text-lg font-semibold">Hoạt động của nhóm</h2><p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted-foreground">Các thay đổi đã được backend ghi lại. Phần hiển thị lịch sử hoạt động sẽ được bổ sung sau.</p></section></TabsContent>
          </Tabs>
    </WorkNestShell>
  );
}
