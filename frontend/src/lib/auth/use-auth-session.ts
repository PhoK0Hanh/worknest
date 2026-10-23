"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase/client";

export function useAuthSession() {
  const [session, setSession] = useState<{ ready: boolean; user: User | null; failed: boolean }>({ ready: false, user: null, failed: false });
  useEffect(() => {
    let disposed = false;
    let unsubscribe: (() => void) | undefined;
    // Recover the browser session before deciding whether to show protected UI.
    void Promise.resolve().then(() => {
      if (disposed) return;
      unsubscribe = onAuthStateChanged(getFirebaseAuth(), user => {
        if (!disposed) setSession({ ready: true, user, failed: false });
      }, () => {
        if (!disposed) setSession({ ready: true, user: null, failed: true });
      });
    }).catch(() => {
      if (!disposed) setSession({ ready: true, user: null, failed: true });
    });
    return () => { disposed = true; unsubscribe?.(); };
  }, []);
  return session;
}
