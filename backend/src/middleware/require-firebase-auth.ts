import type { RequestHandler } from "express";
import type { DecodedIdToken } from "firebase-admin/auth";
import { FirebaseAdminConfigError, verifyFirebaseIdToken } from "../lib/firebase-admin.js";

type Identity = Pick<DecodedIdToken, "uid" | "email" | "email_verified">;
type VerifyToken = (token: string) => Promise<Identity>;

const invalidTokenCodes = new Set([
  "auth/argument-error",
  "auth/invalid-argument",
  "auth/invalid-id-token",
  "auth/id-token-expired",
  "auth/id-token-revoked",
  "auth/user-disabled",
  "auth/user-not-found",
]);

export function createRequireFirebaseAuth(verify: VerifyToken = verifyFirebaseIdToken): RequestHandler {
  return async (request, response, next) => {
    response.set("Cache-Control", "no-store");
    // Identity must come from a verified Bearer token, never a user ID in the body.
    const header = request.headers.authorization;
    const match = header && /^Bearer ([^\s]+)$/i.exec(header);
    const token = match?.[1];
    if (!token || token.length > 16_384) {
      response.status(401).json({ error: "Cần đăng nhập bằng Firebase ID token hợp lệ." });
      return;
    }

    try {
      const identity = await verify(token);
      response.locals.firebaseIdentity = {
        uid: identity.uid,
        email: identity.email ?? null,
        emailVerified: identity.email_verified === true,
      };
      next();
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
      if (typeof code === "string" && invalidTokenCodes.has(code)) {
        response.status(401).json({ error: "Phiên đăng nhập không hợp lệ hoặc đã hết hạn." });
        return;
      }
      // Configuration/network failures must not be mistaken for an invalid login.
      response.status(503).json({ error: error instanceof FirebaseAdminConfigError
        ? "Server chưa được cấu hình Firebase Admin hợp lệ."
        : "Chưa thể xác minh đăng nhập. Vui lòng thử lại." });
    }
  };
}

export const requireFirebaseAuth = createRequireFirebaseAuth();
