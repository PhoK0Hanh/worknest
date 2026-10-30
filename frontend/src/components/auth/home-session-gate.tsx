"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuthSession } from "@/lib/auth/use-auth-session";

export function HomeSessionGate({ children }: { children: ReactNode }) {
  const session = useAuthSession();
  const router = useRouter();

  useEffect(() => {
    // Wait for persisted Firebase auth; workspace access still checks the backend profile.
    if (session.ready && session.user && !session.failed) {
      router.replace("/workspaces");
    }
  }, [session.ready, session.user, session.failed, router]);

  // Keep the introduction hidden until auth is known or navigation has completed.
  if (!session.ready || (session.user && !session.failed)) {
    return (
      <main className="flex min-h-svh items-center justify-center gap-3 px-6 text-sm text-muted-foreground" role="status">
        <LoaderCircle className="size-5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        <p>{session.user ? "Đang mở workspace của bạn..." : "Đang kiểm tra đăng nhập..."}</p>
      </main>
    );
  }

  return (
    <>
      {session.failed && (
        <div role="alert" className="mx-auto flex max-w-5xl flex-wrap items-center gap-3 px-6 pt-6 text-sm">
          <p>Chưa kiểm tra được phiên đăng nhập. Bạn có thể thử lại hoặc tiếp tục đến trang đăng nhập.</p>
          <Button variant="outline" size="sm" onClick={() => window.location.reload()}>Thử lại</Button>
        </div>
      )}
      {children}
    </>
  );
}
