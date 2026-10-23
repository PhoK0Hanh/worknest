"use client"

import { ComponentProps, useState } from "react"
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
    <Card>
      <CardContent className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between gap-2">
          <button type="button" className="line-clamp-2 text-left text-sm font-medium hover:underline" disabled={isOverlay} onPointerDown={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()} onClick={() => onTaskClick?.(task.id)}>{task.title}</button>
          <Badge
            variant={
              task.priority === "high"
                ? "destructive-outline"
                : task.priority === "medium"
                  ? "primary-outline"
                  : "warning-outline"
            }
            className="pointer-events-none h-5 shrink-0 rounded-sm px-1.5 text-[11px] capitalize"
          >
            {task.priority}
          </Badge>
        </div>
        {task.description && <p className="line-clamp-3 whitespace-pre-wrap break-words text-sm text-muted-foreground">{task.description}</p>}
        <div className="text-muted-foreground flex items-center justify-between text-xs">
          {task.assignee && (
            <div className="flex items-center gap-1">
              <Avatar className="size-4">
                <AvatarImage src={task.assigneeAvatar} />
                <AvatarFallback>{task.assignee.charAt(0)}</AvatarFallback>
              </Avatar>
              <span className="line-clamp-1">{task.assignee}</span>
            </div>
          )}
          {task.dueDate && (
            <time className="text-[10px] whitespace-nowrap tabular-nums">
              {task.dueDate}
            </time>
          )}
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
      <Card className="mb-2.5">
        <CardHeader className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="text-sm font-semibold">
              {COLUMN_TITLES[value]}
            </span>
            <Badge variant="outline">{tasks.length}</Badge>
          </div>

        </CardHeader>
        <CardContent>
          <KanbanColumnContent
            value={value}
            className="flex min-h-32 flex-col gap-2.5 p-0.5"
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

  return (
    <div><div role="status" className="mb-3 min-h-5 text-sm text-muted-foreground">{saving ? "Đang lưu..." : failed ? "Lưu lỗi. Hãy tải lại bảng trước khi thử lại." : ""}</div><div inert={saving || failed}><Kanban
      value={columns}
      onValueChange={setColumns}
      onValueCommit={(next, meta) => {
        setSaving(true);
        setFailed(false);
        void onSave(next, meta.previousValue).catch(() => { setColumns(meta.previousValue); setFailed(true); }).finally(() => setSaving(false));
      }}
      getItemValue={(item) => item.id}
    >
      <KanbanBoard className="grid items-start grid-cols-1 gap-4 lg:grid-cols-3">
        {Object.entries(columns).map(([columnValue, tasks]) => (
          <TaskColumn key={columnValue} value={columnValue} tasks={tasks} onTaskClick={onTaskClick} />
        ))}
      </KanbanBoard>
      <KanbanOverlay>
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