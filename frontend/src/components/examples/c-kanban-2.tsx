"use client"

import { ComponentProps, useEffect, useState } from "react"
import { Badge } from "@/components/reui/badge"
import {
  Kanban,
  KanbanBoard,
  KanbanColumn,
  KanbanColumnContent,
  KanbanItem,
  KanbanItemHandle,
  KanbanOverlay,
} from "@/components/reui/kanban"

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar"
import { Card, CardContent, CardHeader } from "@/components/ui/card"

export interface KanbanTask {
  id: string
  title: string
  priority: "low" | "medium" | "high"
  description?: string
  assignee?: string
  assigneeAvatar?: string
  dueDate?: string
}

const COLUMN_TITLES: Record<string, string> = {
  TODO: "Todo",
  IN_PROGRESS: "In Progress",
  DONE: "Done",
}

interface TaskCardProps extends Omit<
  ComponentProps<typeof KanbanItem>,
  "value" | "children"
> {
  task: KanbanTask
  asHandle?: boolean
  onTaskClick?: (id: string) => void
  isOverlay?: boolean
}

function TaskCard({ task, asHandle, isOverlay, onTaskClick, ...props }: TaskCardProps) {
  const cardContent = (
    <Card className="min-w-0 gap-0 rounded-lg py-3 shadow-none [--card-spacing:--spacing(3)]">
      {/* Compact two-row layout shared by the board card and its dynamic drag overlay. */}
      <CardContent className="space-y-2">
        {/* Keep the title button content-sized so empty header space remains draggable. */}
        <div className="flex min-w-0 items-center justify-between gap-3">
          <button type="button" title={task.title} className="min-w-0 max-w-full truncate rounded-sm text-left text-sm font-semibold leading-5 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" disabled={isOverlay} onPointerDown={event => event.stopPropagation()} onMouseDown={event => event.stopPropagation()} onTouchStart={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()} onClick={() => onTaskClick?.(task.id)}>{task.title}</button>
          <Badge variant="outline" className={`pointer-events-none h-6 shrink-0 rounded-md px-2 text-xs font-medium capitalize ${task.priority === "high" ? "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400" : task.priority === "medium" ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"}`}>
            {task.priority}
          </Badge>
        </div>
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 text-xs text-muted-foreground">
          <div className="flex min-w-0 items-center gap-1.5">
            <Avatar className="size-5 shrink-0">
              {task.assigneeAvatar && <AvatarImage src={task.assigneeAvatar} alt="" />}
              <AvatarFallback className="text-[10px]">{task.assignee?.trim().charAt(0).toUpperCase() || "?"}</AvatarFallback>
            </Avatar>
            <span className="truncate" title={task.assignee ?? "Chưa được giao"}>{task.assignee ?? "Chưa được giao"}</span>
          </div>
          {task.dueDate && <time title={task.dueDate} className="whitespace-nowrap text-[11px] tabular-nums">{task.dueDate}</time>}
        </div>
      </CardContent>
    </Card>
  )

  return (
    <KanbanItem value={task.id} {...props}>
      {asHandle && !isOverlay ? (
        <KanbanItemHandle>{cardContent}</KanbanItemHandle>
      ) : (
        cardContent
      )}
    </KanbanItem>
  )
}

interface TaskColumnProps extends Omit<
  ComponentProps<typeof KanbanColumn>,
  "children"
> {
  tasks: KanbanTask[]
  onTaskClick?: (id: string) => void
  isOverlay?: boolean
}

function TaskColumn({ value, tasks, isOverlay, onTaskClick, ...props }: TaskColumnProps) {
  return (
    <KanbanColumn value={value} {...props}>
      {/* One border around the column; task cards retain their own lighter outlines. */}
      <Card className="min-h-80 gap-0 border border-slate-300 bg-slate-50/80 py-0 shadow-sm ring-0">
        <CardHeader className="flex items-center justify-between border-b border-slate-200 bg-white/80 px-4 py-4">
          <div className="flex items-center gap-2.5">
            <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${value === "DONE" ? "bg-emerald-500" : value === "IN_PROGRESS" ? "bg-amber-500" : "bg-slate-400"}`} />
            <span className="text-sm font-semibold">
              {COLUMN_TITLES[value]}
            </span>
            <Badge variant="outline" className="border-slate-200 bg-white text-muted-foreground">{tasks.length}</Badge>
          </div>

        </CardHeader>
        <CardContent className="flex-1 px-3 py-3">
          <KanbanColumnContent
            value={value}
            className="flex min-h-56 flex-col gap-3 p-0.5"
          >
            {tasks.map((task) => (
              <TaskCard key={task.id} task={task} onTaskClick={onTaskClick} asHandle={!isOverlay} />
            ))}
          </KanbanColumnContent>
        </CardContent>
      </Card>
    </KanbanColumn>
  )
}

// Adapted from ReUI c-kanban-2: dynamic overlay with real WorkNest tasks.
export function DynamicTaskKanban({ initial, onSave, onTaskClick }: { onTaskClick: (id: string) => void; initial: Record<string, KanbanTask[]>; onSave: (next: Record<string, KanbanTask[]>, previous: Record<string, KanbanTask[]>) => Promise<void> }) {
  const [columns, setColumns] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    // Losing the window can swallow mouseup; ask dnd-kit to cancel and release its sensors.
    const cancel = () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true }));
    window.addEventListener("blur", cancel);
    return () => window.removeEventListener("blur", cancel);
  }, []);

  return (
    <div><div role="status" className="mb-3 min-h-5 text-sm text-muted-foreground">{saving ? "Đang lưu..." : failed ? "Lưu lỗi. Hãy tải lại bảng trước khi thử lại." : ""}</div><div inert={saving || failed}><Kanban
      restoreOnCancel
      value={columns}
      onValueChange={setColumns}
      onValueCommit={(next, meta) => {
        setSaving(true);
        setFailed(false);
        void onSave(next, meta.previousValue).catch(() => { setColumns(meta.previousValue); setFailed(true); }).finally(() => setSaving(false));
      }}
      getItemValue={(item) => item.id}
    >
      {/* Keep columns side by side on mobile so nearby drop targets remain reachable. */}
      <div className="max-w-full overflow-x-auto overscroll-x-contain pb-2">
      <KanbanBoard className="grid min-w-[840px] items-start grid-cols-3 gap-4">
        {Object.entries(columns).map(([columnValue, tasks]) => (
          <TaskColumn key={columnValue} value={columnValue} tasks={tasks} onTaskClick={onTaskClick} />
        ))}
      </KanbanBoard>
      </div>
      <KanbanOverlay style={{ pointerEvents: "none" }}>
        {({ value, variant }) => {
          if (variant === "column") {
            const tasks = columns[value] ?? []
            return <TaskColumn value={String(value)} tasks={tasks} isOverlay />
          }

          const task = Object.values(columns)
            .flat()
            .find((task) => task.id === value)

          if (!task) return null

          return <TaskCard task={task} isOverlay />
        }}
      </KanbanOverlay>
    </Kanban></div></div>
  )
}