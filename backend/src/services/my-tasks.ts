import { z } from "zod";
import { Prisma, type PrismaClient } from "../generated/prisma/client.js";
import { getPrisma } from "../lib/prisma.js";
import { WorkspaceError } from "./workspaces.js";

const querySchema = z.object({
  scope: z.enum(["assigned", "created"]).default("assigned"),
  status: z.enum(["OPEN", "ALL", "TODO", "IN_PROGRESS", "DONE"]).default("OPEN"),
  priority: z.enum(["ALL", "LOW", "MEDIUM", "HIGH"]).default("ALL"),
  workspaceId: z.uuid().optional(),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
}).strict();

export async function listMyTasks(uid: string, query: unknown, database?: Pick<PrismaClient, "$transaction">) {
  const input = querySchema.parse(query);
  return (database ?? getPrisma()).$transaction(async tx => {
    const users = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM public.users WHERE firebase_uid=${uid} AND is_active=true`;
    const user = users[0];
    if (!user) throw new WorkspaceError("ACCOUNT_UNAVAILABLE", 403, "Tài khoản không hoạt động.");
    // Both views require a current membership; creating a task never grants lasting access.
    const where = Prisma.sql`m.user_id=${user.id}::uuid AND m.left_at IS NULL AND m.is_banned=false
      AND ${input.scope === "assigned" ? Prisma.sql`t.assignee_id=${user.id}::uuid` : Prisma.sql`t.created_by=${user.id}::uuid`}
      AND ${input.status === "ALL" ? Prisma.sql`true` : input.status === "OPEN" ? Prisma.sql`t.status<>'DONE'` : Prisma.sql`t.status=${input.status}`}
      AND ${input.priority === "ALL" ? Prisma.sql`true` : Prisma.sql`t.priority=${input.priority}`}
      AND ${input.workspaceId ? Prisma.sql`t.workspace_id=${input.workspaceId}::uuid` : Prisma.sql`true`}`;
    const from = Prisma.sql`FROM public.tasks t JOIN public.memberships m ON m.workspace_id=t.workspace_id
      JOIN public.workspaces w ON w.id=t.workspace_id`;
    const counts = await tx.$queryRaw<Array<{ total: number }>>(Prisma.sql`SELECT count(*)::int AS total ${from} WHERE ${where}`);
    const total = counts[0]!.total;
    const pageCount = Math.max(1, Math.ceil(total / input.pageSize));
    const page = Math.min(input.page, pageCount);
    const tasks = await tx.$queryRaw(Prisma.sql`SELECT t.id,t.title,t.description,t.priority,t.status,t.position,
      t.created_by AS "createdBy",t.assignee_id AS "assigneeId",t.workspace_id AS "workspaceId",w.name AS "workspaceName",
      (SELECT CASE WHEN u.is_active THEN u.name ELSE 'Tài khoản đã xóa' END FROM public.users u WHERE u.id=t.created_by) AS "creatorName",
      (SELECT CASE WHEN u.is_active THEN u.name ELSE 'Tài khoản đã xóa' END FROM public.users u WHERE u.id=t.assignee_id) AS "assigneeName",
      t.created_at AS "createdAt",t.updated_at AS "updatedAt",t.due_at AS "dueAt",t.completed_at AS "completedAt"
      ${from} WHERE ${where}
      ORDER BY CASE WHEN t.status<>'DONE' AND t.due_at<now() THEN 0 WHEN t.status<>'DONE' THEN 1 ELSE 2 END,
        t.due_at ASC NULLS LAST,t.created_at DESC,t.id
      LIMIT ${input.pageSize} OFFSET ${(page - 1) * input.pageSize}`);
    // Count and rows share one snapshot, including when tasks or memberships change concurrently.
    return { tasks, total, page, pageCount, pageSize: input.pageSize };
  }, { isolationLevel: "RepeatableRead" });
}
