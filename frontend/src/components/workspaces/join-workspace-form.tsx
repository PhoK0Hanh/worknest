"use client";

import type { User } from "firebase/auth";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { DoorOpen, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { joinWorkspaceSchema, postJoinWorkspace, workspaceErrorMessage, type JoinWorkspaceValues, type Workspace } from "@/lib/workspaces";

type Props = {
  user: User;
  onClose: () => void;
  onJoined: (name: string, alreadyMember: boolean) => void;
  onBusyChange: (busy: boolean) => void;
};

export function JoinWorkspaceForm({ user, onClose, onJoined, onBusyChange }: Props) {
  const client = useQueryClient();
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<JoinWorkspaceValues>({
    resolver: zodResolver(joinWorkspaceSchema),
    defaultValues: { joinCode: "", password: "" },
  });
  const join = useMutation({
    mutationFn: ({ values, account }: { values: JoinWorkspaceValues; account: User }) => postJoinWorkspace(account, values),
    retry: false,
    onMutate: () => onBusyChange(true),
    onSettled: () => onBusyChange(false),
    onSuccess: (result, submitted) => {
      // A cross-tab account switch must not expose the previous account's result.
      if (getFirebaseAuth().currentUser?.uid !== submitted.account.uid) return;
      const queryKey = ["workspaces", submitted.account.uid];
      client.setQueryData<Workspace[]>(queryKey, current => [result.workspace, ...(current ?? []).filter(item => item.id !== result.workspace.id)]);
      void client.invalidateQueries({ queryKey });
      reset();
      onJoined(result.workspace.name, result.alreadyMember);
    },
  });
  const busy = join.isPending || isSubmitting;

  return (
        <form noValidate className="space-y-5" onSubmit={handleSubmit(async values => {
          try { await join.mutateAsync({ values, account: user }); }
          catch { /* Mutation state displays errors; retrying a successful join is idempotent. */ }
        })}>
          <fieldset disabled={busy} className="grid gap-5">
            <div className="space-y-2">
              <Label htmlFor="join-code">Mã nhóm</Label>
              <Input id="join-code" className="h-10 uppercase" placeholder="Ví dụ: A1B2C3D4E5F6" autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={20} aria-invalid={!!errors.joinCode} aria-describedby={errors.joinCode ? "join-code-error" : undefined} {...register("joinCode")} />
              {errors.joinCode && <p id="join-code-error" role="alert" className="text-xs text-destructive">{errors.joinCode.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="join-password">Mật khẩu nhóm</Label>
              <Input id="join-password" className="h-10" type="password" autoComplete="off" placeholder="Nhập mật khẩu tham gia nhóm" maxLength={128} aria-invalid={!!errors.password} aria-describedby={errors.password ? "join-password-error" : undefined} {...register("password")} />
              {errors.password && <p id="join-password-error" role="alert" className="text-xs text-destructive">{errors.password.message}</p>}
            </div>
          </fieldset>
          {join.isError && <p role="alert" className="text-sm text-destructive">{workspaceErrorMessage(join.error)}</p>}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">Thành viên mới tham gia với quyền Member.</p>
            <div className="flex gap-2"><Button type="button" variant="outline" disabled={busy} onClick={onClose}>Hủy</Button><Button type="submit" disabled={busy}>{busy ? <LoaderCircle className="animate-spin" /> : <DoorOpen />}{busy ? "Đang tham gia..." : "Tham gia nhóm"}</Button></div>
          </div>
        </form>
  );
}
