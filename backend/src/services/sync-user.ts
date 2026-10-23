import { z } from "zod";
import type { PrismaClient } from "../generated/prisma/client.js";
import { getPrisma } from "../lib/prisma.js";

export class UserSyncError extends Error {
  constructor(public code: string, public status: number, message: string) { super(message); }
}

export type SyncIdentity = { uid: string; email: string | null; name?: string };
type Profile = { id: string; firebaseUid: string; name: string; email: string; createdAt: Date; updatedAt: Date };

function isUniqueViolation(error: unknown, depth = 0): boolean {
  if (!error || typeof error !== "object" || depth > 5) return false;
  const details = error as Record<string, unknown>;
  if (details.code === "P2002" || details.code === "23505" || details.originalCode === "23505" || details.kind === "UniqueConstraintViolation") return true;
  // Prisma 7 driver adapters may wrap SQLSTATE in a nested driver error.
  return [details.meta, details.driverAdapterError, details.cause].some(value => isUniqueViolation(value, depth + 1));
}

export async function syncUser(identity: SyncIdentity, database?: Pick<PrismaClient, "$queryRaw">) {
  const parsed = z.object({
    uid: z.string().min(1).max(128),
    email: z.string().trim().toLowerCase().max(254).pipe(z.email()),
    name: z.string().trim().max(100).optional(),
  }).safeParse(identity);
  if (!parsed.success) throw new UserSyncError("PROFILE_INVALID", 400, "Tài khoản cần có UID và email hợp lệ.");
  const { uid, email, name } = parsed.data;
  const initialName = name || email.split("@")[0]!.slice(0, 100);

  try {
    // Parameterized atomic upsert serializes concurrent calls for the same UID.
    // Deleted profiles never enter the update branch; email is never used to merge accounts.
    const rows = await (database ?? getPrisma()).$queryRaw<Profile[]>`
      INSERT INTO "public"."users" (firebase_uid, name, email)
      VALUES (${uid}, ${initialName}, ${email})
      ON CONFLICT (firebase_uid) DO UPDATE
      SET email = EXCLUDED.email,
          updated_at = CASE WHEN "users".email IS DISTINCT FROM EXCLUDED.email
                            THEN CURRENT_TIMESTAMP ELSE "users".updated_at END
      WHERE "users".is_active = true
      RETURNING id, firebase_uid AS "firebaseUid", name, email,
                created_at AS "createdAt", updated_at AS "updatedAt"
    `;
    if (!rows[0]) throw new UserSyncError("ACCOUNT_INACTIVE", 403, "Tài khoản WorkNest đã ngừng hoạt động.");
    return rows[0];
  } catch (error) {
    if (error instanceof UserSyncError) throw error;
    if (isUniqueViolation(error)) {
      throw new UserSyncError("EMAIL_CONFLICT", 409, "Email đang liên kết với hồ sơ khác. Không thể tự động ghép tài khoản.");
    }
    throw new UserSyncError("PROFILE_UNAVAILABLE", 503, "Chưa thể tải hồ sơ WorkNest. Vui lòng thử lại.");
  }
}
