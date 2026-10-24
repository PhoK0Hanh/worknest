"use client";

import { WorkspaceManagement, WorkspaceInviteButton, MemberActions } from "@/components/workspaces/management";
import { CopyWorkspaceCode } from "@/components/workspaces/copy-workspace-code";
import { WorkspaceDetailSkeleton, WorkspaceTabsSkeleton } from "@/components/workspaces/workspace-skeleton";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import type { User } from "firebase/auth";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  DoorOpen,
  LoaderCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuthSession } from "@/lib/auth/use-auth-session";
import { profileErrorMessage, useWorkNestProfile } from "@/lib/auth/profile";
import { getFirebaseAuth } from "@/lib/firebase/client";
import {
  getWorkspace,
  postLeaveWorkspace,
  workspaceErrorMessage,
  type Workspace,
} from "@/lib/workspaces";

import {
  WorkNestShell,
  WorkspaceMenuButton,
} from "@/components/workspaces/worknest-shell";
import { WorkspaceShell } from "@/components/workspaces/workspace-shell";

const roleLabels: Record<string, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  MEMBER: "Member",
};

function displayDate(value: string) {
  return new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium" }).format(
    new Date(value),
  );
}

export function WorkspaceDetailView() {
  const { id } = useParams<{ id: string }>();
  const session = useAuthSession();
  // Reset confirmation and local UI when switching workspace or Firebase account.
  return (
    <WorkspaceDetailContent
      key={`${session.user?.uid ?? "guest"}:${id}`}
      id={id}
      session={session}
    />
  );
}

function WorkspaceDetailContent({
  id,
  session,
}: {
  id: string;
  session: ReturnType<typeof useAuthSession>;
}) {
  const profile = useWorkNestProfile(session.user, true);
  const router = useRouter();
  const client = useQueryClient();
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [left, setLeft] = useState(false);
  const ready = !!session.user && profile.isSuccess && !profile.isFetching;
  const detail = useQuery({
    queryKey: ["workspace", session.user?.uid ?? null, id],
    enabled: ready && !left,
    queryFn: ({ signal }) => getWorkspace(session.user!, id, signal),
    retry: false,
  });
  const leave = useMutation({
    mutationFn: ({ user, workspaceId }: { user: User; workspaceId: string }) =>
      postLeaveWorkspace(user, workspaceId),
    retry: false,
    onSuccess: (_result, submitted) => {
      // Never update the new account's UI if auth changed while the request was running.
      if (getFirebaseAuth().currentUser?.uid !== submitted.user.uid) return;
      setLeft(true);
      client.setQueryData<Workspace[]>(
        ["workspaces", submitted.user.uid],
        (current) =>
          current?.filter((item) => item.id !== submitted.workspaceId),
      );
      client.removeQueries({
        queryKey: ["workspace", submitted.user.uid, submitted.workspaceId],
      });
      void client.invalidateQueries({
        queryKey: ["workspaces", submitted.user.uid],
      });
      router.replace("/workspaces");
    },
  });

  useEffect(() => {
    if (session.ready && !session.user && !session.failed)
      router.replace("/login");
  }, [session.ready, session.user, session.failed, router]);

  const loading =
    !session.ready ||
    (!session.user && !session.failed) ||
    (!!session.user && (profile.isPending || profile.isFetching)) ||
    (ready && detail.isPending);
  const error = session.failed
    ? "Chưa thể xác minh đăng nhập. Vui lòng đăng nhập lại."
    : profile.isError
      ? profileErrorMessage(profile.error)
      : detail.isError
        ? workspaceErrorMessage(detail.error)
        : undefined;
  const workspace = detail.data;

  if (ready && workspace && !error && !left) {
    return (
      <WorkspaceShell
        workspace={workspace}
        profileName={profile.data?.name ?? session.user?.displayName ?? "Bạn"}
        settingsContent={<>
          {/* Group settings are separate from member management; permissions stay enforced by each action. */}
          <div className="mb-6"><h2 className="text-xl font-semibold">Cài đặt workspace</h2><p className="mt-2 text-sm text-muted-foreground">Thông tin nhóm và các thiết lập theo vai trò của bạn.</p></div>
          <div className="grid items-start gap-6 md:grid-cols-2 xl:grid-cols-3">
            <WorkspaceManagement workspace={workspace} />
            <Card className="gap-0 py-5 [--card-spacing:--spacing(5)]">
              <CardContent className="space-y-5">
                <h2 className="font-semibold">Thông tin workspace</h2>
                <div>
                  <p className="mb-2 text-xs text-muted-foreground">
                    Mã tham gia nhóm
                  </p>
                  <CopyWorkspaceCode key={workspace.joinCode} code={workspace.joinCode} />
                </div>
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <CalendarDays className="size-4" />
                  Tạo ngày {displayDate(workspace.createdAt)}
                </p>
              </CardContent>
            </Card>
            <Card className="gap-0 py-5 [--card-spacing:--spacing(5)]">
              <CardContent className="space-y-4">
                <h2 className="font-semibold">Rời workspace</h2>
                {workspace.role === "OWNER" ? (
                  <>
                    <p className="text-sm leading-6 text-muted-foreground">
                      Owner cần chuyển quyền sở hữu cho thành viên khác trước
                      khi rời nhóm.
                    </p>
                    <Button variant="outline" disabled className="w-full">
                      <DoorOpen />
                      Rời nhóm
                    </Button>
                  </>
                ) : confirmLeave ? (
                  <section
                    aria-label="Xác nhận rời workspace"
                    className="space-y-4"
                  >
                    <p className="text-sm leading-6">
                      Bạn sẽ mất quyền truy cập nhóm. Task chưa hoàn thành đang
                      giao cho bạn sẽ trở thành chưa được giao.
                    </p>
                    <p className="text-xs leading-5 text-muted-foreground">
                      Bạn có thể tham gia lại bằng mã và mật khẩu hiện tại của
                      nhóm.
                    </p>
                    {leave.isError && (
                      <p role="alert" className="text-sm text-destructive">
                        {workspaceErrorMessage(leave.error)}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="destructive"
                        disabled={leave.isPending}
                        onClick={() => {
                          if (session.user)
                            leave.mutate({
                              user: session.user,
                              workspaceId: id,
                            });
                        }}
                      >
                        {leave.isPending ? (
                          <LoaderCircle className="animate-spin" />
                        ) : (
                          <DoorOpen />
                        )}
                        {leave.isPending ? "Đang rời..." : "Xác nhận rời"}
                      </Button>
                      <Button
                        variant="outline"
                        disabled={leave.isPending}
                        onClick={() => {
                          setConfirmLeave(false);
                          leave.reset();
                        }}
                      >
                        Ở lại
                      </Button>
                    </div>
                  </section>
                ) : (
                  <>
                    <p className="text-sm leading-6 text-muted-foreground">
                      Bạn sẽ không còn xem được thông tin và công việc trong
                      workspace này.
                    </p>
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => {
                        leave.reset();
                        setConfirmLeave(true);
                      }}
                    >
                      <DoorOpen />
                      Rời nhóm
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </>}
      >
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div><h2 className="text-xl font-semibold">Thành viên <span className="ml-2 text-sm font-normal text-muted-foreground">({workspace.memberCount})</span></h2><p className="mt-2 text-sm text-muted-foreground">Những người đang cùng làm việc trong workspace.</p></div>
          <WorkspaceInviteButton workspace={workspace} />
        </div>
        <div className="min-w-0">
          <Card className="min-w-0 gap-0 py-1 [--card-spacing:--spacing(5)]">
            <CardContent>
              <ul className="divide-y">
                {workspace.members.map((member) => (
                  <li
                    key={member.id}
                    className="grid grid-cols-[2.5rem_minmax(0,1fr)] sm:grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 py-4"
                  >
                    <span
                      aria-hidden="true"
                      className="flex size-10 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-sm font-semibold text-primary"
                    >
                      {member.name.trim().slice(0, 1).toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="wrap-break-word text-sm font-medium">
                        {member.name}
                        {member.id === profile.data?.id && (
                          <span className="ml-2 font-normal text-muted-foreground">
                            (Bạn)
                          </span>
                        )}
                      </p>
                      <p className="mt-1 break-all text-xs text-muted-foreground">
                        {member.email}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Tham gia {displayDate(member.joinedAt)}
                      </p>
                    </div>
                    <div className="col-start-2 row-start-2 flex items-center gap-1.5 sm:col-start-3 sm:row-start-1"><span className="rounded-full bg-slate-50 px-2.5 py-1 text-xs font-medium">{roleLabels[member.role] || member.role}</span><MemberActions workspace={workspace} member={member} currentUserId={profile.data!.id} /></div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

        </div>
      </WorkspaceShell>
    );
  }

  return (
    <WorkNestShell
      profileName={
        profile.data?.name ?? session.user?.displayName ?? "WorkNest"
      }
    >
      {/* Loading and errors use the application frame without exposing unverified group details. */}
      <header className="sticky top-0 z-20 flex h-20 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-5 lg:px-8">
        <WorkspaceMenuButton />
        <span className="text-xl font-semibold">Workspace</span>
      </header>
      {loading && <WorkspaceTabsSkeleton />}
      <div className="p-5 lg:p-8">
        {left ? (
          <p role="status">Đã rời nhóm. Đang trở về danh sách workspace...</p>
        ) : loading ? (
          <WorkspaceDetailSkeleton />
        ) : error ? (
          <Card>
            <CardContent className="space-y-4 pt-6">
              <h1 className="text-xl font-semibold">Chưa thể mở workspace</h1>
              <p role="alert" className="text-sm text-muted-foreground">
                {error}
              </p>
              <div className="flex flex-wrap gap-3">
                <Button
                  variant="outline"
                  onClick={() =>
                    void (profile.isError
                      ? profile.refetch()
                      : detail.refetch())
                  }
                >
                  Thử lại
                </Button>
                <Button asChild variant="ghost">
                  <Link href="/workspaces">Về danh sách</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </WorkNestShell>
  );
}
