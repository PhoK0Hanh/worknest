import { verifyFirebaseIdToken } from "./firebase-admin.js";
import { WorkspaceError } from "../services/workspaces.js";

type Identity = { uid: string; auth_time: number; firebase: { sign_in_provider: string } };
export type VerifyOwnerToken = (token: string) => Promise<Identity>;

export async function verifyOwnerConfirmation(uid: string, token: unknown, verify: VerifyOwnerToken = verifyFirebaseIdToken) {
  const invalid = () => new WorkspaceError("OWNER_REAUTH_REQUIRED", 401, "Hãy nhập lại mật khẩu tài khoản Owner để xác nhận thao tác.");
  if (typeof token !== "string" || !token || token.length > 16384) throw invalid();
  try {
    const identity = await verify(token);
    const age = Date.now() / 1000 - identity.auth_time;
    // Token refresh alone does not refresh auth_time; require a recent password authentication.
    if (identity.uid !== uid || identity.firebase?.sign_in_provider !== "password" || !Number.isFinite(age) || age < -5 || age > 120) throw invalid();
  } catch { throw invalid(); }
}
