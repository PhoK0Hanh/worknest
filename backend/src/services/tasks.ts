import { z } from "zod";
import type { Prisma, PrismaClient } from "../generated/prisma/client.js";
import { getPrisma } from "../lib/prisma.js";
import { WorkspaceError } from "./workspaces.js";

type Database = Pick<PrismaClient, "$transaction">;
const boardSchema = z.object({ TODO: z.array(z.uuid()).max(500), IN_PROGRESS: z.array(z.uuid()).max(500), DONE: z.array(z.uuid()).max(500) }).strict();

export async function reorderTasks(uid: string, workspaceId: unknown, body: unknown, database?: Database) {
  const id = z.uuid().parse(workspaceId);
  const { previous, next } = z.object({ previous: boardSchema, next: boardSchema }).strict().parse(body);
  return (database ?? getPrisma()).$transaction(async tx => {
    const user = await authorize(tx, uid, id);
    const rows = await tx.$queryRaw<Array<{ id: string; status: string }>>`SELECT id, status FROM public.tasks WHERE workspace_id=${id}::uuid ORDER BY position, created_at, id`;
    const current = { TODO: [] as string[], IN_PROGRESS: [] as string[], DONE: [] as string[] };
    for (const row of rows) current[row.status as keyof typeof current].push(row.id);
    const states = ["TODO", "IN_PROGRESS", "DONE"] as const;
    if (states.some(state => JSON.stringify(previous[state]) !== JSON.stringify(current[state]))) {
      throw new WorkspaceError("BOARD_CONFLICT", 409, "Bảng đã thay đổi. Hãy tải lại.");
    }
    const ids = states.flatMap(state => next[state]);
    if (ids.length !== rows.length || new Set(ids).size !== ids.length || ids.some(taskId => !rows.some(row => row.id === taskId))) {
      throw new WorkspaceError("TASK_INVALID", 400, "Danh sách task không hợp lệ.");
    }
    if (states.every(state => JSON.stringify(previous[state]) === JSON.stringify(next[state]))) return { saved: true };
    const changes = states.flatMap(status => next[status].map((taskId, index) => ({ id: taskId, status, position: index + 1 })));
    // Preserve completion time when reordering Done; clear it when reopening a task.
    await tx.$executeRaw`UPDATE public.tasks t SET status=c.status, position=c.position, updated_at=clock_timestamp(),
      completed_at=CASE WHEN c.status='DONE' THEN COALESCE(t.completed_at,clock_timestamp()) ELSE NULL END
      FROM jsonb_to_recordset(${JSON.stringify(changes)}::jsonb) AS c(id uuid,status text,position int)
      WHERE t.id=c.id AND t.workspace_id=${id}::uuid AND (t.status<>c.status OR t.position<>c.position)`;
    await tx.$executeRaw`INSERT INTO public.activity_logs(workspace_id,content) VALUES (${id}::uuid, ${`${user.name} đã cập nhật trạng thái hoặc thứ tự task.`})`;
    return { saved: true };
  });
}
export const taskSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).nullable().optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]).default("MEDIUM"),
  assigneeId: z.uuid().nullable().optional(),
  dueAt: z.iso.datetime({ offset: true }).nullable().optional(),
}).strict();

export async function updateTask(uid: string, workspaceId: unknown, taskId: unknown, body: unknown, database?: Database) {
  const id = z.uuid().parse(workspaceId);
  const target = z.uuid().parse(taskId);
  const input = taskSchema.extend({ status: z.enum(["TODO", "IN_PROGRESS", "DONE"]), expectedUpdatedAt: z.iso.datetime({ offset: true }) }).parse(body);
  return (database ?? getPrisma()).$transaction(async tx => {
    const user = await authorize(tx, uid, id);
    const rows = await tx.$queryRaw<Array<{ id: string; status: string; updatedAt: Date }>>`SELECT id,status,updated_at AS "updatedAt" FROM public.tasks WHERE id=${target}::uuid AND workspace_id=${id}::uuid FOR UPDATE`;
    const task = rows[0];
    if (!task) throw new WorkspaceError("TASK_NOT_FOUND", 404, "Task không tồn tại.");
    if (task.updatedAt.getTime() !== new Date(input.expectedUpdatedAt).getTime()) throw new WorkspaceError("TASK_CONFLICT", 409, "Task đã thay đổi. Hãy tải lại trước khi sửa.");
    if (input.assigneeId) {
      const members = await tx.$queryRaw<Array<{ user_id: string }>>`SELECT m.user_id FROM public.memberships m JOIN public.users u ON u.id=m.user_id WHERE m.workspace_id=${id}::uuid AND m.user_id=${input.assigneeId}::uuid AND m.left_at IS NULL AND m.is_banned=false AND u.is_active=true`;
      if (!members.length) throw new WorkspaceError("ASSIGNEE_INVALID", 400, "Người được giao không hợp lệ.");
    }
    // A status change appends to the destination column and preserves Done history on ordinary edits.
    await tx.$executeRaw`UPDATE public.tasks SET title=${input.title},description=${input.description || null},priority=${input.priority},assignee_id=${input.assigneeId ?? null}::uuid,due_at=${input.dueAt ? new Date(input.dueAt) : null},
      position=CASE WHEN status<>${input.status} THEN (SELECT COALESCE(MAX(position),0)+1 FROM public.tasks WHERE workspace_id=${id}::uuid AND status=${input.status}) ELSE position END,
      completed_at=CASE WHEN ${input.status}='DONE' THEN COALESCE(completed_at,clock_timestamp()) ELSE NULL END,
      status=${input.status},updated_at=clock_timestamp() WHERE id=${target}::uuid AND workspace_id=${id}::uuid`;
    await tx.$executeRaw`INSERT INTO public.activity_logs(workspace_id,content) VALUES (${id}::uuid,${`${user.name} đã cập nhật task “${input.title}”.`})`;
    return { saved: true };
  });
}

async function authorize(tx: Prisma.TransactionClient, uid: string, id: string) {
  const users = await tx.$queryRaw<Array<{ id: string; name: string }>>`SELECT id, name FROM public.users WHERE firebase_uid=${uid} AND is_active=true FOR SHARE`;
  if (!users[0]) throw new WorkspaceError("ACCOUNT_UNAVAILABLE", 403, "Tài khoản không hoạt động.");
  // Serialize task creation with joins/leaves to keep assignment and position consistent.
  const groups = await tx.$queryRaw`SELECT id FROM public.workspaces WHERE id=${id}::uuid FOR UPDATE`;
  const memberships = await tx.$queryRaw<Array<{ user_id: string; role: string }>>`SELECT user_id, role FROM public.memberships WHERE workspace_id=${id}::uuid AND user_id=${users[0].id}::uuid AND left_at IS NULL AND is_banned=false FOR SHARE`;
  if (!(groups as unknown[]).length || !memberships.length) throw new WorkspaceError("WORKSPACE_NOT_FOUND", 404, "Không có quyền truy cập workspace.");
  return { ...users[0], role: memberships[0]!.role };
}

export async function deleteTask(uid: string, workspaceId: unknown, taskId: unknown, body: unknown, database?: Database) {
  const id = z.uuid().parse(workspaceId);
  const target = z.uuid().parse(taskId);
  const input = z.object({ expectedUpdatedAt: z.iso.datetime({ offset: true }) }).strict().parse(body);
  return (database ?? getPrisma()).$transaction(async tx => {
    const user = await authorize(tx, uid, id);
    const rows = await tx.$queryRaw<Array<{ title: string; createdBy: string; updatedAt: Date }>>`SELECT title,created_by AS "createdBy",updated_at AS "updatedAt" FROM public.tasks WHERE id=${target}::uuid AND workspace_id=${id}::uuid FOR UPDATE`;
    const task = rows[0];
    if (!task) throw new WorkspaceError("TASK_NOT_FOUND", 404, "Task không tồn tại.");
    if (task.createdBy !== user.id && !["OWNER", "ADMIN"].includes(user.role)) throw new WorkspaceError("TASK_DELETE_FORBIDDEN", 403, "Chỉ người tạo task hoặc Owner/Admin được xóa task.");
    if (task.updatedAt.getTime() !== new Date(input.expectedUpdatedAt).getTime()) throw new WorkspaceError("TASK_CONFLICT", 409, "Task đã thay đổi. Hãy tải lại trước khi xóa.");
    // Deletion and its audit record commit together; task IDs never leave their workspace boundary.
    await tx.$executeRaw`DELETE FROM public.tasks WHERE id=${target}::uuid AND workspace_id=${id}::uuid`;
    await tx.$executeRaw`INSERT INTO public.activity_logs(workspace_id,content) VALUES (${id}::uuid, ${`${user.name} đã xóa task “${task.title}”.`})`;
    return { deleted: true };
  });
}

export async function getTask(uid: string, workspaceId: unknown, taskId: unknown, database?: Database) {
  const id = z.uuid().parse(workspaceId);
  const target = z.uuid().parse(taskId);
  return (database ?? getPrisma()).$transaction(async tx => {
    await authorize(tx, uid, id);
    // Fetch a fresh edit snapshot without downloading every task in the workspace.
    const rows = await tx.$queryRaw<Array<Record<string, unknown>>>`SELECT id,title,description,priority,status,position,
      created_by AS "createdBy",assignee_id AS "assigneeId",workspace_id AS "workspaceId",
      (SELECT CASE WHEN u.is_active THEN u.name ELSE 'Tài khoản đã xóa' END FROM public.users u WHERE u.id=created_by) AS "creatorName",
      created_at AS "createdAt",updated_at AS "updatedAt",due_at AS "dueAt",completed_at AS "completedAt"
      FROM public.tasks WHERE id=${target}::uuid AND workspace_id=${id}::uuid`;
    if (!rows[0]) throw new WorkspaceError("TASK_NOT_FOUND", 404, "Task không tồn tại.");
    return rows[0];
  });
}

export async function listTasks(uid: string, workspaceId: unknown, database?: Database) {
  const id = z.uuid().parse(workspaceId);
  return (database ?? getPrisma()).$transaction(async tx => {
    await authorize(tx, uid, id);
    return tx.$queryRaw`SELECT id, title, description, priority, status, position,
      created_by AS "createdBy",
      (SELECT CASE WHEN u.is_active THEN u.name ELSE 'Tài khoản đã xóa' END FROM public.users u WHERE u.id=created_by) AS "creatorName",
      assignee_id AS "assigneeId", workspace_id AS "workspaceId",
      created_at AS "createdAt", updated_at AS "updatedAt", due_at AS "dueAt", completed_at AS "completedAt"
      FROM public.tasks WHERE workspace_id=${id}::uuid ORDER BY position, created_at, id`;
  });
}

export async function createTask(uid: string, workspaceId: unknown, body: unknown, database?: Database) {
  const id = z.uuid().parse(workspaceId);
  const input = taskSchema.parse(body);
  return (database ?? getPrisma()).$transaction(async tx => {
    const user = await authorize(tx, uid, id);
    if (input.assigneeId) {
      const assignees = await tx.$queryRaw`SELECT m.user_id FROM public.memberships m JOIN public.users u ON u.id=m.user_id
        WHERE m.workspace_id=${id}::uuid AND m.user_id=${input.assigneeId}::uuid
          AND m.left_at IS NULL AND m.is_banned=false AND u.is_active=true`;
      if (!(assignees as unknown[]).length) throw new WorkspaceError("ASSIGNEE_INVALID", 400, "Người được giao phải là thành viên đang hoạt động trong nhóm.");
    }
    const tasks = await tx.$queryRaw<Array<{ id: string }>>`INSERT INTO public.tasks
      (title, description, priority, created_by, assignee_id, workspace_id, due_at, position)
      VALUES (${input.title}, ${input.description || null}, ${input.priority}, ${user.id}::uuid,
        ${input.assigneeId ?? null}::uuid, ${id}::uuid, ${input.dueAt ? new Date(input.dueAt) : null},
        (SELECT COALESCE(MAX(position),0)+1 FROM public.tasks WHERE workspace_id=${id}::uuid AND status='TODO'))
      RETURNING id`;
    await tx.$executeRaw`INSERT INTO public.activity_logs(workspace_id, content) VALUES (${id}::uuid, ${`${user.name} đã tạo task “${input.title}”.`})`;
    return tasks[0]!;
  });
}
