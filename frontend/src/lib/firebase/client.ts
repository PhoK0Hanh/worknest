"use client";

import { getApp, getApps, initializeApp, type FirebaseOptions } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";

// Explicit property access lets Next.js embed public environment values in the browser bundle.
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
} satisfies FirebaseOptions;

const environmentNames = {
  apiKey: "NEXT_PUBLIC_FIREBASE_API_KEY",
  authDomain: "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
  projectId: "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  appId: "NEXT_PUBLIC_FIREBASE_APP_ID",
};

export function getFirebaseAuth(): Auth {
  // Initialize only in browser effects/handlers, not during server rendering.
  if (typeof window === "undefined") {
    throw new Error("Firebase Web Auth chỉ được sử dụng trong trình duyệt.");
  }

  const missing = (Object.keys(environmentNames) as Array<keyof typeof environmentNames>)
    .filter((key) => !firebaseConfig[key]?.trim());
  if (missing.length) {
    // Report missing variable names without exposing configuration values.
    throw new Error(`Thiếu cấu hình Firebase: ${missing.map((key) => environmentNames[key]).join(", ")}`);
  }

  // Reuse the default app during Next.js hot reload instead of initializing it twice.
  const app = getApps().some((app) => app.name === "[DEFAULT]")
    ? getApp()
    : initializeApp(firebaseConfig);
  return getAuth(app);
}
