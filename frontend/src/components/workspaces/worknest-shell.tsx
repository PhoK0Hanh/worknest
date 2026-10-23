"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import Link from "next/link";
import { LayoutGrid, Leaf, Menu, Settings, LogOut, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HoverCard, HoverCardTrigger, HoverCardContent } from "@/components/ui/hover-card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { AccountAvatar } from "@/components/examples/c-avatar-14";
import { cn } from "@/lib/utils";

import { signOut } from "firebase/auth";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { getFirebaseAuth } from "@/lib/firebase/client";

const SidebarContext = createContext<(() => void) | null>(null);

// Render the mobile trigger inside each page header instead of a separate toolbar.
export function WorkspaceMenuButton() {
  const openSidebar = useContext(SidebarContext);
  return <Button size="icon" variant="outline" className="shrink-0 md:hidden" aria-label="Menu" onClick={() => openSidebar?.()}><Menu /></Button>;
}

// Shared application frame: visible on the home screen and inside each workspace.
export function WorkNestShell({ profileName, accountActions, children }: {
  profileName: string;
  accountActions?: ReactNode;
  children: ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [email, setEmail] = useState("");
  const router = useRouter();
  const client = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function logout() {
    setBusy(true);
    setError("");
    try {
      await signOut(getFirebaseAuth());
      client.clear();
      router.replace("/login");
    } catch { setError("SIGN_OUT_FAILED"); }
    finally { setBusy(false); }
  }
  return (
    <div className="h-dvh overflow-hidden bg-white">
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Cài đặt tài khoản</DialogTitle><DialogDescription>Chức năng chỉnh sửa tài khoản sẽ được bổ sung sau.</DialogDescription></DialogHeader>
          <p className="break-words text-sm">{profileName}</p><p className="break-all text-sm text-muted-foreground">{email}</p>
          <DialogFooter><DialogClose asChild><Button variant="outline">Đóng</Button></DialogClose></DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Bound the flex layout to the viewport; each pane scrolls independently. */}
      <div className="flex h-full min-h-0 w-full overflow-hidden bg-white">
        {/* On small screens the sidebar stays in normal flow, without a modal focus trap. */}
        <aside className={cn("h-full min-h-0 w-60 shrink-0 flex-col overflow-hidden border-r border-slate-200 bg-white/90", sidebarOpen ? "flex w-full md:w-60" : "hidden md:flex")}>
          <div className="flex h-20 shrink-0 items-center justify-between gap-2 border-b border-slate-200 px-5">
            <Link href="/workspaces" onClick={() => setSidebarOpen(false)} className="flex items-center gap-3 text-xl font-semibold tracking-tight"><span className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm"><Leaf className="size-6" aria-hidden="true" /></span>WorkNest</Link>
            <Button size="icon" variant="ghost" className="md:hidden" aria-label="Đóng menu" onClick={() => setSidebarOpen(false)}><X /></Button>
          </div>
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-3 py-5">
            {/* Global navigation stays the same on the list and inside a workspace. */}
            <nav aria-label="WorkNest">
              <Link href="/workspaces" onClick={() => setSidebarOpen(false)} className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-white px-3 py-2.5 text-sm font-medium text-primary shadow-xs"><LayoutGrid className="size-4" />Workspace</Link>
            </nav>
            {/* Shadcn Hover Card handles hover timing and positions the account card beside its trigger. */}
            <div className="mt-auto pt-12">
              <HoverCard open={accountOpen} onOpenChange={setAccountOpen} openDelay={150} closeDelay={200}>
                <HoverCardTrigger asChild>
                  <button type="button" onClick={() => setAccountOpen(current => !current)} onFocus={() => setAccountOpen(true)} onKeyDown={event => { if (event.key === "Escape") setAccountOpen(false); }} className="flex w-full items-center gap-3 border-t border-slate-200 px-3 pt-5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <AccountAvatar name={profileName} />
                    <span className="min-w-0"><span className="block truncate text-sm font-medium">{profileName}</span><span className="mt-0.5 block text-xs text-muted-foreground">WorkNest</span></span>
                  </button>
                </HoverCardTrigger>
                {/* Clear the sidebar's 12px inner padding and border before the flyout starts. */}
                <HoverCardContent side="right" align="end" sideOffset={24} collisionPadding={8} className="w-60 max-w-[calc(100vw-1rem)]" aria-label="Account options">
                  <Button variant="ghost" className="justify-start" onClick={() => { setEmail(getFirebaseAuth().currentUser?.email ?? ""); setAccountOpen(false); setSettingsOpen(true); }}><Settings />Cài đặt tài khoản</Button>
                  {accountActions ?? <Button variant="ghost" className="justify-start" disabled={busy} onClick={() => void logout()}><LogOut />Đăng xuất</Button>}
                  {error && <p role="alert" className="text-xs text-destructive">Chưa thể đăng xuất. Hãy thử lại.</p>}
                </HoverCardContent>
              </HoverCard>
            </div>
          </div>
        </aside>

        <main className={cn("h-full min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain bg-white", sidebarOpen && "hidden md:block")}>
          <SidebarContext.Provider value={() => setSidebarOpen(true)}>{children}</SidebarContext.Provider>
        </main>
      </div>
    </div>
  );
}
