"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Activity, Columns3, LayoutGrid, ShieldCheck, Settings, Users } from "lucide-react";
import { WorkNestShell, WorkspaceMenuButton } from "@/components/workspaces/worknest-shell";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { WorkspaceInsights } from "@/components/workspaces/management";
import { WorkspaceOverview } from "@/components/workspaces/workspace-overview";
import { TaskBoard } from "@/components/workspaces/task-board";
import type { WorkspaceDetail } from "@/lib/workspaces";

const tabs = [
  { id: "board", label: "Bảng công việc", icon: Columns3 },
  { id: "members", label: "Thành viên", icon: Users },
  { id: "overview", label: "Tổng quan", icon: LayoutGrid },
  { id: "activity", label: "Hoạt động", icon: Activity },
  { id: "settings", label: "Cài đặt", icon: Settings },
] as const;
type Tab = typeof tabs[number]["id"];
const roles: Record<string, string> = { OWNER: "Owner", ADMIN: "Admin", MEMBER: "Member" };

export function WorkspaceShell({ workspace, profileName, children, settingsContent }: {
  workspace: WorkspaceDetail;
  profileName: string;
  children: ReactNode;
  settingsContent: ReactNode;
}) {
  // Open the task board by default when entering a workspace.
  const [tab, setTab] = useState<Tab>("board");
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
            <TabsContent value="overview" className="m-0 p-5 lg:p-8"><WorkspaceOverview workspace={workspace} onBoard={() => setTab("board")} onActivity={() => setTab("activity")} /></TabsContent>
            {/* The task board loads authorized records; activity rendering is still pending. */}
            <TabsContent value="board" className="m-0 p-5 lg:p-8"><TaskBoard workspace={workspace} /></TabsContent>
            <TabsContent value="activity" className="m-0 p-5 lg:p-8"><WorkspaceInsights id={workspace.id} activity /></TabsContent>
            <TabsContent value="settings" className="m-0 p-5 lg:p-8">{settingsContent}</TabsContent>
          </Tabs>
    </WorkNestShell>
  );
}
