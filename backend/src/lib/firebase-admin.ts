import "dotenv/config";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { z } from "zod";

const appName = "worknest-admin";

export class FirebaseAdminConfigError extends Error {
  constructor() {
    super("Firebase Admin chưa được cấu hình hợp lệ.");
  }
}

export function getFirebaseAdminAuth() {
  // Lazy initialization keeps health checks independent of Firebase credentials.
  let app = getApps().find((candidate) => candidate.name === appName);
  if (!app) {
    const parsed = z.object({
      FIREBASE_ADMIN_PROJECT_ID: z.string().trim().min(1),
      FIREBASE_ADMIN_CLIENT_EMAIL: z.email(),
      FIREBASE_ADMIN_PRIVATE_KEY: z.string().min(1),
    }).safeParse(process.env);
    if (!parsed.success) throw new FirebaseAdminConfigError();

    try {
      app = initializeApp({
        credential: cert({
          projectId: parsed.data.FIREBASE_ADMIN_PROJECT_ID,
          clientEmail: parsed.data.FIREBASE_ADMIN_CLIENT_EMAIL,
          // Accept both actual newlines from dotenv and escaped newlines from hosting.
          privateKey: parsed.data.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, "\n"),
        }),
      }, appName);
    } catch {
      // Do not expose credential contents or SDK parsing errors to logs or clients.
      throw new FirebaseAdminConfigError();
    }
  }
  return getAuth(app);
}

export async function verifyFirebaseIdToken(token: string) {
  // Revocation checks also reject disabled/deleted Firebase accounts.
  return getFirebaseAdminAuth().verifyIdToken(token, true);
}
