"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut, type User } from "firebase/auth";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowRight,
  DoorOpen,
  Layers3,
  LoaderCircle,
  LogOut,
  Plus,
  RefreshCw,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  WorkNestShell,
  WorkspaceMenuButton,
} from "@/components/workspaces/worknest-shell";
import { WorkspaceListSkeleton } from "@/components/workspaces/workspace-skeleton";
import { CopyWorkspaceCode } from "@/components/workspaces/copy-workspace-code";
import { Invitations } from "@/components/workspaces/management";
import { JoinWorkspaceForm } from "@/components/workspaces/join-workspace-form";
import { useAuthSession } from "@/lib/auth/use-auth-session";
import { profileErrorMessage, useWorkNestProfile } from "@/lib/auth/profile";
import { getFirebaseAuth } from "@/lib/firebase/client";
import {
  createWorkspaceSchema,
  getWorkspaces,
  postWorkspace,
  workspaceErrorMessage,
  type CreateWorkspaceValues,
  type Workspace,
} from "@/lib/workspaces";

const roleLabels: Record<string, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  MEMBER: "Member",
};

export function WorkspaceList() {
  const session = useAuthSession();
  const profile = useWorkNestProfile(session.user, true);
  const router = useRouter();
  const client = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [showJoinForm, setShowJoinForm] = useState(false);
  const [joining, setJoining] = useState(false);
  const [notice, setNotice] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateWorkspaceValues>({
    resolver: zodResolver(createWorkspaceSchema),
    defaultValues: { name: "", password: "" },
  });
  const queryKey = ["workspaces", session.user?.uid ?? null];
  const workspaces = useQuery({
    queryKey,
    enabled:
      !!session.user && profile.isSuccess && !profile.isFetching && !loggingOut,
    queryFn: ({ signal }) => getWorkspaces(session.user!, signal),
    retry: false,
  });
  const create = useMutation({
    mutationFn: ({
      values,
      user,
    }: {
      values: CreateWorkspaceValues;
      user: User;
    }) => postWorkspace(user, values),
    retry: false,
    onSuccess: (workspace, submitted) => {
      // Ignore results if a different account signed in from another tab while creating.
      if (getFirebaseAuth().currentUser?.uid !== submitted.user.uid) return;
      const submittedKey = ["workspaces", submitted.user.uid];
      // Show the committed result immediately and then refresh authoritative membership data.
      client.setQueryData<Workspace[]>(submittedKey, (current) => [
        workspace,
        ...(current ?? []).filter((item) => item.id !== workspace.id),
      ]);
      void client.invalidateQueries({ queryKey: submittedKey });
      reset();
      setShowForm(false);
      setNotice(`Đã tạo workspace “${workspace.name}”. Bạn là Owner của nhóm.`);
    },
  });

  useEffect(() => {
    if (session.ready && !session.user && !session.failed)
      router.replace("/login");
  }, [session.ready, session.user, session.failed, router]);

  async function logout() {
    setLoggingOut(true);
    try {
      await signOut(getFirebaseAuth());
      client.clear();
      router.replace("/login");
    } catch {
      setNotice("Chưa thể đăng xuất. Vui lòng thử lại.");
    } finally {
      setLoggingOut(false);
    }
  }

  // Keep the application frame visible while Firebase restores the browser session.
  const sessionLoading = !session.ready || (!session.user && !session.failed);
  const profileLoading =
    sessionLoading || (!!session.user && (profile.isPending || profile.isFetching));
  const ready = session.ready && !!session.user && profile.isSuccess && !profile.isFetching;

  return (
    <WorkNestShell
      profileName={profile.data?.name || session.user?.email || "WorkNest"}
      accountActions={
        <Button
          variant="outline"
          className="mt-4 w-full"
          onClick={() => void logout()}
          disabled={loggingOut || create.isPending || joining}
        >
          <LogOut className="size-4" />
          Đăng xuất
        </Button>
      }
    >
      {/* Keep the mobile menu trigger in the same row as the page title. */}
      <header className="sticky top-0 z-20 flex h-20 shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 lg:px-8">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <WorkspaceMenuButton />
          <h1 className="truncate text-lg font-semibold tracking-tight">Workspace của tôi</h1>
        </div>
          {/* Keep primary actions reachable without repeating the page heading below. */}
          <div className="flex shrink-0 gap-2">
            <Button
              variant="outline"
              className="size-9 p-0 sm:w-auto sm:px-3"
              aria-label="Tham gia workspace"
              disabled={!ready || create.isPending || joining}
              onClick={() => {
                reset();
                create.reset();
                setShowForm(false);
                setShowJoinForm(true);
                setNotice("");
              }}
            >
              <DoorOpen className="size-4" />
              <span className="hidden sm:inline">Tham gia workspace</span>
            </Button>
            <Button
              disabled={!ready || create.isPending || joining}
              className="size-9 p-0 sm:w-auto sm:px-3"
              aria-label="Tạo workspace"
              onClick={() => {
                create.reset();
                setShowJoinForm(false);
                setShowForm(true);
                setNotice("");
              }}
            >
              <Plus className="size-4" />
              <span className="hidden sm:inline">Tạo workspace</span>
            </Button>
          </div>
      </header>
      <div className="px-5 py-6 lg:px-8 lg:py-8">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
          <p>Các nhóm bạn đang tham gia.</p>
          {ready && workspaces.isSuccess && <span>{workspaces.data.length} workspace</span>}
        </div>
        {ready && <Invitations />}
        {notice && (
          <p
            role="status"
            className="worknest-notice mb-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"
          >
            {notice}
          </p>
        )}
        {profileLoading && <WorkspaceListSkeleton />}
        {(session.failed || profile.isError) && (
          <Card>
            <CardContent className="space-y-4 pt-6">
              <p role="alert">
                {session.failed
                  ? "Chưa thể xác minh đăng nhập. Vui lòng đăng nhập lại."
                  : profileErrorMessage(profile.error)}
              </p>
              {profile.isError && (
                <Button
                  variant="outline"
                  onClick={() => void profile.refetch()}
                >
                  Thử lại
                </Button>
              )}
              <Link
                href="/login"
                className="ml-4 text-sm text-primary underline"
              >
                Về đăng nhập
              </Link>
            </CardContent>
          </Card>
        )}

        {showJoinForm && ready && session.user && (
          <Dialog open onOpenChange={value => { if (!value && !joining) setShowJoinForm(false); }}>
            <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
              <DialogHeader><DialogTitle>Tham gia workspace</DialogTitle><DialogDescription>Nhập mã và mật khẩu được người trong nhóm chia sẻ.</DialogDescription></DialogHeader>
          <JoinWorkspaceForm
            key={session.user.uid}
            user={session.user}
            onClose={() => setShowJoinForm(false)}
            onBusyChange={setJoining}
            onJoined={(name, alreadyMember) => {
              setShowJoinForm(false);
              setNotice(
                alreadyMember
                  ? `Bạn đã là thành viên của “${name}”.`
                  : `Đã tham gia workspace “${name}” với quyền Member.`,
              );
            }}
          />
            </DialogContent>
          </Dialog>
        )}

        {showForm && ready && (
          <Dialog open onOpenChange={value => { if (!value && !create.isPending && !isSubmitting) { setShowForm(false); reset(); create.reset(); } }}>
            {/* Forms open above the list so workspace cards never shift when a dialog opens. */}
            <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
              <DialogHeader><DialogTitle>Tạo workspace mới</DialogTitle><DialogDescription>Đặt tên và mật khẩu tham gia cho nhóm của bạn.</DialogDescription></DialogHeader>
              <form
                noValidate
                onSubmit={handleSubmit(async (values) => {
                  if (!session.user) return;
                  try {
                    await create.mutateAsync({ values, user: session.user });
                  } catch {
                    /* Mutation state displays the error without retrying creation. */
                  }
                })}
                className="space-y-5"
              >
                <fieldset
                  disabled={create.isPending || isSubmitting}
                  className="grid gap-5"
                >
                  <div className="space-y-2">
                    <Label htmlFor="workspace-name">Tên workspace</Label>
                    <Input
                      id="workspace-name"
                      className="h-10"
                      placeholder="Ví dụ: Nhóm phát triển website"
                      maxLength={100}
                      aria-invalid={!!errors.name}
                      aria-describedby={
                        errors.name ? "workspace-name-error" : undefined
                      }
                      {...register("name")}
                    />
                    {errors.name && (
                      <p
                        id="workspace-name-error"
                        role="alert"
                        className="text-xs text-destructive"
                      >
                        {errors.name.message}
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="workspace-password">
                      Mật khẩu tham gia
                    </Label>
                    <Input
                      id="workspace-password"
                      className="h-10"
                      type="password"
                      autoComplete="new-password"
                      placeholder="Từ 8 đến 128 ký tự"
                      maxLength={128}
                      aria-invalid={!!errors.password}
                      aria-describedby={
                        errors.password
                          ? "workspace-password-error"
                          : "workspace-password-help"
                      }
                      {...register("password")}
                    />
                    {errors.password ? (
                      <p
                        id="workspace-password-error"
                        role="alert"
                        className="text-xs text-destructive"
                      >
                        {errors.password.message}
                      </p>
                    ) : (
                      <p
                        id="workspace-password-help"
                        className="text-xs text-muted-foreground"
                      >
                        Chọn mật khẩu riêng cho nhóm, khác với mật khẩu tài
                        khoản.
                      </p>
                    )}
                  </div>
                </fieldset>
                {create.isError && (
                  <p role="alert" className="text-sm text-destructive">
                    {workspaceErrorMessage(create.error)}
                  </p>
                )}
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs text-muted-foreground">
                    Mã nhóm được tạo tự động. Bạn sẽ là Owner.
                  </p>
                  <Button
                    type="submit"
                    disabled={create.isPending || isSubmitting}
                  >
                    {create.isPending ? (
                      <LoaderCircle className="animate-spin" />
                    ) : (
                      <Plus />
                    )}
                    {create.isPending ? "Đang tạo..." : "Tạo workspace"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        )}

        {ready && workspaces.isPending && <WorkspaceListSkeleton />}
        {ready && workspaces.isError && (
          <Card>
            <CardContent className="space-y-4 pt-6">
              <p role="alert">{workspaceErrorMessage(workspaces.error)}</p>
              <Button
                variant="outline"
                onClick={() => void workspaces.refetch()}
              >
                <RefreshCw />
                Tải lại danh sách
              </Button>
            </CardContent>
          </Card>
        )}
        {ready &&
          workspaces.isSuccess &&
          workspaces.data.length === 0 &&
          (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-16 text-center">
              <span className="mx-auto mb-5 flex size-14 items-center justify-center rounded-2xl bg-slate-50 text-primary">
                <Layers3 />
              </span>
              <h2 className="text-xl font-semibold">
                Bắt đầu với nhóm đầu tiên
              </h2>
              <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-muted-foreground">
                Bạn chưa tham gia workspace nào. Tạo nhóm mới hoặc dùng mã và
                mật khẩu để tham gia nhóm có sẵn.
              </p>
              <Button
                className="mt-6"
                onClick={() => {
                  reset(); create.reset(); setShowJoinForm(false); setShowForm(true); setNotice("");
                }}
              >
                <Plus />
                Tạo workspace đầu tiên
                <ArrowRight />
              </Button>
              <Button
                variant="outline"
                className="mt-3 ml-3"
                onClick={() => { reset(); create.reset(); setShowForm(false); setShowJoinForm(true); setNotice(""); }}
              >
                <DoorOpen />
                Tham gia nhóm có sẵn
              </Button>
            </div>
          )}
        {ready && workspaces.data && (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {workspaces.data.map((workspace) => (
              <Card
                key={workspace.id}
                className="relative h-full min-w-0 gap-0 py-5 transition-[box-shadow] duration-150 ease-out motion-reduce:transition-none hover:shadow-sm hover:ring-emerald-300 [--card-spacing:--spacing(5)]"
              >
                <CardContent className="flex h-full flex-col">
                  <div className="flex items-start gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-primary">
                      <Layers3 className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <h2 className="min-h-12 wrap-break-word text-base leading-6 font-semibold">
                        {/* The stretched link covers the card; the code remains a separate interaction above it. */}
                        <Link href={`/workspaces/${workspace.id}`} title={workspace.name} className="after:absolute after:inset-0 after:rounded-xl hover:text-primary focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-ring"><span className="line-clamp-2">{workspace.name}</span></Link>
                      </h2>
                      <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground"><Users className="size-3.5" />{workspace.memberCount} thành viên</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-slate-50 px-2 py-1 text-[11px] font-medium">
                      {roleLabels[workspace.role] || workspace.role}
                    </span>
                  </div>
                  {/* Keep the join code aligned at the bottom, even with longer workspace names. */}
                  <div className="relative z-10 mt-auto pt-4">
                    {/* Share the same per-card clipboard animation as workspace settings. */}
                    <CopyWorkspaceCode key={workspace.joinCode} code={workspace.joinCode} label="Mã nhóm" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </WorkNestShell>
  );
}
