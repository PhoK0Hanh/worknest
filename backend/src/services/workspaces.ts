import { randomBytes } from "node:crypto";
import { hash, verify, argon2id } from "argon2";
import { z } from "zod";
import type { PrismaClient, Prisma } from "../generated/prisma/client.js";
import { getPrisma } from "../lib/prisma.js";
import { isUniqueViolation } from "../lib/database-error.js";

export class WorkspaceError extends Error {
  constructor(public code: string, public status: number, message: string) { super(message); }
}

const createSchema = z.object({
  name: z.string().trim().min(1).max(100),
  password: z.string().min(8).max(128),
}).strict();

const joinSchema = z.object({
  joinCode: z.string().trim().toUpperCase().regex(/^[0-9A-F]{12}$/),
  password: z.string().min(1).max(128),
}).strict();

type Database = Pick<PrismaClient, "$transaction">;
type WorkspaceRow = { id: string; name: string; joinCode: string; createdAt: Date; updatedAt: Date };
type UserRow = { id: string; name: string };

async function requireActiveUser(tx: Prisma.TransactionClient, firebaseUid: string) {
  // Hold a shared lock until commit so account deletion cannot race workspace creation.
  const users = await tx.$queryRaw<UserRow[]>`
    SELECT id, name FROM "public"."users"
    WHERE firebase_uid = ${firebaseUid} AND is_active = true FOR SHARE
  `;
  if (!users[0]) throw new WorkspaceError("ACCOUNT_UNAVAILABLE", 403, "Tài khoản WorkNest chưa sẵn sàng hoặc đã ngừng hoạt động.");
  return users[0];
}

export async function listWorkspaces(firebaseUid: string, database?: Database) {
  return (database ?? getPrisma()).$transaction(async tx => {
    const user = await requireActiveUser(tx, firebaseUid);
    // Filter by the caller's active membership; never select or return password hashes.
    return tx.$queryRaw<Array<WorkspaceRow & { role: string; memberCount: number }>>`
      SELECT w.id, w.name, w.join_code AS "joinCode", w.created_at AS "createdAt",
             w.updated_at AS "updatedAt", m.role,
             (SELECT count(*)::int FROM "public"."memberships" members
              JOIN "public"."users" u ON u.id = members.user_id
              WHERE members.workspace_id = w.id AND members.left_at IS NULL
                AND members.is_banned = false AND u.is_active = true) AS "memberCount"
      FROM "public"."workspaces" w
      JOIN "public"."memberships" m ON m.workspace_id = w.id
      WHERE m.user_id = ${user.id}::uuid AND m.left_at IS NULL AND m.is_banned = false
      ORDER BY w.created_at DESC, w.id
    `;
  });
}

export async function createWorkspace(firebaseUid: string, body: unknown, database?: Database) {
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) throw new WorkspaceError("WORKSPACE_INVALID", 400, "Tên nhóm cần từ 1–100 ký tự, mật khẩu từ 8–128 ký tự.");
  // Hash outside the transaction to avoid holding database locks during expensive work.
  const passwordHash = await hash(parsed.data.password, { type: argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
  for (let attempt = 0; attempt < 3; attempt++) {
    const joinCode = randomBytes(6).toString("hex").toUpperCase();
    try {
      return await (database ?? getPrisma()).$transaction(async tx => {
        const user = await requireActiveUser(tx, firebaseUid);
        const rows = await tx.$queryRaw<WorkspaceRow[]>`
          INSERT INTO "public"."workspaces" (name, join_code, join_password_hash)
          VALUES (${parsed.data.name}, ${joinCode}, ${passwordHash})
          RETURNING id, name, join_code AS "joinCode", created_at AS "createdAt", updated_at AS "updatedAt"
        `;
        const workspace = rows[0]!;
        await tx.$executeRaw`
          INSERT INTO "public"."memberships" (user_id, workspace_id, role)
          VALUES (${user.id}::uuid, ${workspace.id}::uuid, 'OWNER')
        `;
        const content = `${user.name} đã tạo workspace “${workspace.name}”.`;
        await tx.$executeRaw`
          INSERT INTO "public"."activity_logs" (workspace_id, content)
          VALUES (${workspace.id}::uuid, ${content})
        `;
        return { ...workspace, role: "OWNER", memberCount: 1 };
      });
    } catch (error) {
      if (isUniqueViolation(error) && attempt < 2) continue;
      throw error;
    }
  }
  throw new WorkspaceError("WORKSPACE_UNAVAILABLE", 503, "Chưa thể tạo mã nhóm. Vui lòng thử lại.");
}

export async function joinWorkspace(firebaseUid: string, body: unknown, database?: Database) {
  const parsed = joinSchema.safeParse(body);
  if (!parsed.success) throw new WorkspaceError("JOIN_INVALID", 400, "Mã nhóm gồm 12 ký tự; vui lòng nhập đầy đủ mã và mật khẩu.");

  return (database ?? getPrisma()).$transaction(async tx => {
    const user = await requireActiveUser(tx, firebaseUid);
    // Serialize joins/password changes per workspace, then lock the membership if present.
    const rows = await tx.$queryRaw<Array<WorkspaceRow & { passwordHash: string }>>`
      SELECT id, name, join_code AS "joinCode", join_password_hash AS "passwordHash",
             created_at AS "createdAt", updated_at AS "updatedAt"
      FROM "public"."workspaces" WHERE join_code = ${parsed.data.joinCode} FOR UPDATE
    `;
    const workspace = rows[0];
    // Use the same response for an unknown code and a wrong password.
    if (!workspace || !await verify(workspace.passwordHash, parsed.data.password)) {
      throw new WorkspaceError("JOIN_CREDENTIALS_INVALID", 400, "Mã nhóm hoặc mật khẩu chưa đúng.");
    }
    const memberships = await tx.$queryRaw<Array<{ role: string; leftAt: Date | null; isBanned: boolean }>>`
      SELECT role, left_at AS "leftAt", is_banned AS "isBanned"
      FROM "public"."memberships"
      WHERE user_id = ${user.id}::uuid AND workspace_id = ${workspace.id}::uuid FOR UPDATE
    `;
    const membership = memberships[0];
    if (membership?.isBanned) {
      throw new WorkspaceError("MEMBERSHIP_BANNED", 403, "Bạn đã bị loại khỏi nhóm. Chỉ có thể quay lại khi được mời.");
    }
    const alreadyMember = !!membership && membership.leftAt === null;
    let role = membership?.role ?? "MEMBER";
    if (!alreadyMember) {
      // Never reset a ban or downgrade an active membership if another operation raced us.
      const joined = await tx.$queryRaw<Array<{ role: string }>>`
        INSERT INTO "public"."memberships" AS existing_membership (user_id, workspace_id, role)
        VALUES (${user.id}::uuid, ${workspace.id}::uuid, 'MEMBER')
        ON CONFLICT (user_id, workspace_id) DO UPDATE
        SET role = 'MEMBER', joined_at = CURRENT_TIMESTAMP, left_at = NULL, is_banned = false
        WHERE existing_membership.is_banned = false AND existing_membership.left_at IS NOT NULL
        RETURNING role
      `;
      if (!joined[0]) throw new WorkspaceError("MEMBERSHIP_CHANGED", 409, "Trạng thái thành viên vừa thay đổi. Vui lòng tải lại danh sách.");
      role = joined[0].role;
      const content = `${user.name} đã ${membership ? "tham gia lại" : "tham gia"} workspace “${workspace.name}” bằng mã nhóm.`;
      await tx.$executeRaw`
        INSERT INTO "public"."activity_logs" (workspace_id, content)
        VALUES (${workspace.id}::uuid, ${content})
      `;
    }
    const counts = await tx.$queryRaw<Array<{ count: number }>>`
      SELECT count(*)::int AS count FROM "public"."memberships" m
      JOIN "public"."users" u ON u.id = m.user_id
      WHERE m.workspace_id = ${workspace.id}::uuid AND m.left_at IS NULL
        AND m.is_banned = false AND u.is_active = true
    `;
    // Explicit projection ensures hashes never leave the service.
    return {
      workspace: { id: workspace.id, name: workspace.name, joinCode: workspace.joinCode,
        createdAt: workspace.createdAt, updatedAt: workspace.updatedAt, role, memberCount: counts[0]!.count },
      alreadyMember,
    };
  });
}

function parseWorkspaceId(value: unknown) {
  const parsed = z.uuid().safeParse(value);
  if (!parsed.success) throw new WorkspaceError("WORKSPACE_ID_INVALID", 400, "Mã định danh workspace không hợp lệ.");
  return parsed.data;
}

export async function getWorkspace(firebaseUid: string, workspaceId: unknown, database?: Database) {
  const id = parseWorkspaceId(workspaceId);
  return (database ?? getPrisma()).$transaction(async tx => {
    const user = await requireActiveUser(tx, firebaseUid);
    // Authorize before selecting members; outsiders receive the same result as a missing group.
    const rows = await tx.$queryRaw<Array<WorkspaceRow & { role: string }>>`
      SELECT w.id, w.name, w.join_code AS "joinCode", w.created_at AS "createdAt",
             w.updated_at AS "updatedAt", m.role
      FROM "public"."workspaces" w
      JOIN "public"."memberships" m ON m.workspace_id = w.id
      WHERE w.id = ${id}::uuid AND m.user_id = ${user.id}::uuid
        AND m.left_at IS NULL AND m.is_banned = false
      FOR SHARE OF w, m
    `;
    if (!rows[0]) throw new WorkspaceError("WORKSPACE_NOT_FOUND", 404, "Workspace không tồn tại hoặc bạn không còn quyền truy cập.");
    const members = await tx.$queryRaw<Array<{ id: string; name: string; email: string; role: string; joinedAt: Date }>>`
      SELECT u.id, u.name, u.email, m.role, m.joined_at AS "joinedAt"
      FROM "public"."memberships" m
      JOIN "public"."users" u ON u.id = m.user_id
      WHERE m.workspace_id = ${id}::uuid AND m.left_at IS NULL
        AND m.is_banned = false AND u.is_active = true
      ORDER BY CASE m.role WHEN 'OWNER' THEN 0 WHEN 'ADMIN' THEN 1 ELSE 2 END,
               m.joined_at, u.id
    `;
    return { ...rows[0], memberCount: members.length, members };
  });
}

export async function leaveWorkspace(firebaseUid: string, workspaceId: unknown, database?: Database) {
  const id = parseWorkspaceId(workspaceId);
  return (database ?? getPrisma()).$transaction(async tx => {
    const user = await requireActiveUser(tx, firebaseUid);
    // Keep the same lock order as joining: user, workspace, then membership.
    const workspaces = await tx.$queryRaw<Array<{ id: string; name: string }>>`
      SELECT id, name FROM "public"."workspaces" WHERE id = ${id}::uuid FOR UPDATE
    `;
    const memberships = await tx.$queryRaw<Array<{ role: string; leftAt: Date | null; isBanned: boolean }>>`
      SELECT role, left_at AS "leftAt", is_banned AS "isBanned" FROM "public"."memberships"
      WHERE workspace_id = ${id}::uuid AND user_id = ${user.id}::uuid FOR UPDATE
    `;
    const membership = memberships[0];
    if (!workspaces[0] || !membership || membership.isBanned) {
      throw new WorkspaceError("WORKSPACE_NOT_FOUND", 404, "Workspace không tồn tại hoặc bạn không còn quyền truy cập.");
    }
    // Retried requests do not write duplicate logs or alter a former member's state.
    if (membership.leftAt !== null) return { workspaceId: id, alreadyLeft: true };
    if (membership.role === "OWNER") {
      throw new WorkspaceError("OWNER_TRANSFER_REQUIRED", 409, "Owner cần chuyển quyền sở hữu trước khi rời nhóm.");
    }
    await tx.$executeRaw`
      UPDATE "public"."memberships" SET left_at = clock_timestamp()
      WHERE workspace_id = ${id}::uuid AND user_id = ${user.id}::uuid
    `;
    // Preserve completed task ownership for history; unfinished work becomes unassigned.
    await tx.$executeRaw`
      UPDATE "public"."tasks" SET assignee_id = NULL, updated_at = clock_timestamp()
      WHERE workspace_id = ${id}::uuid AND assignee_id = ${user.id}::uuid AND status <> 'DONE'
    `;
    const content = `${user.name} đã rời workspace “${workspaces[0].name}”.`;
    await tx.$executeRaw`
      INSERT INTO "public"."activity_logs" (workspace_id, content)
      VALUES (${id}::uuid, ${content})
    `;
    return { workspaceId: id, alreadyLeft: false };
  });
}
