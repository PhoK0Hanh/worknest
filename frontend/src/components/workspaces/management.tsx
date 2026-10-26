"use client";
import { formatDateTime } from "@/lib/date-time";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { EmailAuthProvider, reauthenticateWithCredential } from "firebase/auth";
import { FirebaseError } from "firebase/app";
import { authErrorMessage } from "@/lib/auth/error-message";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ChevronDown, Mail, MoreHorizontal, UserPlus } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/reui/badge";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { SaveFeedback } from "@/components/ui/save-feedback";
import { api } from "@/lib/api";
import { useAuthSession } from "@/lib/auth/use-auth-session";
import { getFirebaseAuth } from "@/lib/firebase/client";
import type { WorkspaceDetail, WorkspaceMember } from "@/lib/workspaces";
async function request(path: string, method = "GET", data?: unknown) {
  const user=getFirebaseAuth().currentUser;
  if(!user) throw new Error("Login required");
  return (await api.request({url:path,method,data,headers:{Authorization:`Bearer ${await user.getIdToken()}`}})).data;
}
function errorText(error: unknown) { if (error instanceof FirebaseError) return authErrorMessage(error); return axios.isAxiosError(error) ? error.response?.data?.error ?? "Request failed. Please retry." : "Request failed. Please retry."; }
type ActionProps = {
  label: string;
  path: string;
  payload: Record<string, string>;
  field?: string;
  type?: string;
  help?: string;
  onDone?: () => void;
  externalOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  inline?: boolean;
  defaultValue?: string;
};

// The confirmation dialog lives outside dropdown content so closing the menu cannot unmount it.
function Action({ label, path, payload, field, type = "text", help, onDone, externalOpen, onOpenChange, inline = false, defaultValue }: ActionProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const client = useQueryClient();
  const open = externalOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;
  const ownerPasswordInput = useRef<HTMLInputElement>(null);
  const inlineForm = useRef<HTMLFormElement>(null);
  const pendingInput = useRef<Record<string, unknown> | null>(null);
  const submittedUid = useRef("");
  const [saved, setSaved] = useState(false);
  const sensitive = ["delete", "transfer", "password"].includes(payload.action);
  const mutation = useMutation({
    mutationFn: async (data: object) => {
      submittedUid.current = getFirebaseAuth().currentUser?.uid ?? "";
      if (!sensitive) return request(path, "POST", data);
      // Read and clear the DOM input here so the password never enters mutation variables/cache.
      const ownerPassword = ownerPasswordInput.current?.value ?? "";
      if (ownerPasswordInput.current) ownerPasswordInput.current.value = "";
      const auth = getFirebaseAuth();
      const user = auth.currentUser;
      if (!user?.email) throw new Error("Login required");
      const uid = user.uid;
      // Password goes only to Firebase. The API receives proof of fresh password authentication.
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, ownerPassword));
      if (auth.currentUser?.uid !== uid) throw new Error("Session changed");
      const token = await user.getIdToken(true);
      return (await api.post(path, { ...data, ownerConfirmationToken: token }, { headers: { Authorization: `Bearer ${token}` } })).data;
    },
    onSuccess: async () => {
      // Finish refreshing before closing so focus can return to the enabled inline form.
      await client.invalidateQueries({ predicate: query => ["workspace", "workspaces", "tasks", "dashboard", "activity", "my-tasks", "my-task-detail", "invitations"].includes(String(query.queryKey[0])) && query.queryKey[1] === submittedUid.current });
      setOpen(false);
      pendingInput.current = null;
      if (sensitive) inlineForm.current?.reset();
      setSaved(true);
      onDone?.();
    },
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mutation.isPending) return;
    const data = new FormData(event.currentTarget);
    mutation.mutate(inline && sensitive ? pendingInput.current ?? payload : { ...payload, ...(field ? { [field]: data.get(field) } : {}) });
  }
  const labels: Record<string, string> = { email: "Email thành viên", name: "Tên workspace mới", password: "Mật khẩu mới", confirmation: "Tên workspace để xác nhận" };
  return <>
    {inline && field && <form ref={inlineForm} onSubmit={event => {
      event.preventDefault();
      if (mutation.isPending) return;
      mutation.reset(); setSaved(false);
      const data = new FormData(event.currentTarget);
      const input = { ...payload, [field]: data.get(field) };
      if (sensitive) { pendingInput.current = input; setOpen(true); }
      else mutation.mutate(input);
    }} className="space-y-3">
      <div className="space-y-2"><Label htmlFor={`inline-${payload.action}`}>{labels[field]}</Label><Input id={`inline-${payload.action}`} name={field} type={type} defaultValue={defaultValue} required minLength={field === "password" ? 8 : 1} maxLength={field === "password" ? 128 : 100} autoComplete={field === "password" ? "new-password" : undefined} disabled={mutation.isPending || open} onChange={() => setSaved(false)} /></div>
      {help && <p className="text-xs leading-5 text-muted-foreground">{help}</p>}
      <div className="flex flex-wrap items-center justify-between gap-3"><SaveFeedback visible={saved} /><Button type="submit" size="sm" disabled={mutation.isPending || open}>{mutation.isPending ? "Đang lưu..." : label}</Button></div>
      {!sensitive && mutation.isError && <p role="alert" className="text-sm text-destructive">{errorText(mutation.error)}</p>}
    </form>}
    <Dialog open={open} onOpenChange={value => {
      if (mutation.isPending) return;
      setOpen(value);
      if (!value && inline) { pendingInput.current = null; if (sensitive) inlineForm.current?.reset(); }
    }}>
    {!inline && externalOpen === undefined && <DialogTrigger asChild><Button size="sm" variant={payload.action === "delete" ? "destructive" : "outline"} onClick={() => mutation.reset()}>{payload.action === "invite" && <UserPlus />}{label}</Button></DialogTrigger>}
    <DialogContent onCloseAutoFocus={event => {
      // Inline settings do not have a DialogTrigger; restore keyboard focus explicitly.
      if (inline) {
        event.preventDefault();
        requestAnimationFrame(() => inlineForm.current?.querySelector<HTMLInputElement>("input")?.focus());
      }
    }}>
      <DialogHeader><DialogTitle>{label}</DialogTitle><DialogDescription>{inline ? "Xác nhận thay đổi bằng mật khẩu đăng nhập của Owner." : help ?? "Xác nhận thao tác này cho workspace."}</DialogDescription></DialogHeader>
      <form onSubmit={submit} className="space-y-4">
        {!inline && field && <div className="space-y-2"><Label htmlFor={`${payload.action}-${field}`}>{labels[field] ?? field}</Label><Input id={`${payload.action}-${field}`} name={field} type={type} required disabled={mutation.isPending} maxLength={field === "password" ? 128 : 200} minLength={field === "password" ? 8 : 1} /></div>}
        {sensitive && <div className="space-y-2"><Label htmlFor={`${payload.action}-owner-password`}>Mật khẩu tài khoản Owner</Label><Input id={`${payload.action}-owner-password`} ref={ownerPasswordInput} name="ownerPassword" type="password" autoComplete="current-password" required disabled={mutation.isPending} /><p className="text-xs text-muted-foreground">Nhập mật khẩu đăng nhập của bạn, không phải mật khẩu tham gia nhóm.</p></div>}
        {mutation.isError && <p role="alert" className="text-sm text-destructive">{errorText(mutation.error)}</p>}
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={mutation.isPending} onClick={() => { setOpen(false); if (inline) { pendingInput.current = null; inlineForm.current?.reset(); } }}>Hủy</Button><Button variant={["remove", "delete"].includes(payload.action) ? "destructive" : "default"} disabled={mutation.isPending}>{mutation.isPending ? "Đang lưu..." : "Xác nhận"}</Button></div>
      </form>
    </DialogContent>
  </Dialog></>;
}

export function WorkspaceInviteButton({ workspace }: { workspace: WorkspaceDetail }) {
  if (!["OWNER", "ADMIN"].includes(workspace.role)) return null;
  return <Action label="Mời thành viên" path={`/workspaces/${workspace.id}/manage`} payload={{ action: "invite" }} field="email" type="email" help="Mời tài khoản WorkNest có sẵn. Lời mời có hạn 3 ngày." />;
}

export function MemberActions({ workspace, member, currentUserId }: { workspace: WorkspaceDetail; member: WorkspaceMember; currentUserId: string }) {
  const [selected, setSelected] = useState<ActionProps | null>(null);
  const owner = workspace.role === "OWNER";
  const allowed = member.id !== currentUserId && member.role !== "OWNER" && (owner || (workspace.role === "ADMIN" && member.role === "MEMBER"));
  if (!allowed) return null;
  const path = `/workspaces/${workspace.id}/manage`;
  const choose = (action: string, label: string, help: string) => setSelected({ label, help, path, payload: { action, userId: member.id } });
  return <>
    <DropdownMenu>
      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label={`Thao tác với ${member.name}`}><MoreHorizontal /></Button></DropdownMenuTrigger>
      <DropdownMenuContent align="end" onCloseAutoFocus={event => { if (selected) event.preventDefault(); }}>
        {owner && <>
          <DropdownMenuItem onSelect={() => choose(member.role === "ADMIN" ? "demote" : "promote", member.role === "ADMIN" ? "Hạ xuống Member" : "Nâng lên Admin", `Thay đổi vai trò của ${member.name} trong nhóm.`)}>{member.role === "ADMIN" ? "Hạ xuống Member" : "Nâng lên Admin"}</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => choose("transfer", "Chuyển Owner", `Chuyển quyền sở hữu cho ${member.name}. Bạn sẽ trở thành Admin.`)}>Chuyển Owner</DropdownMenuItem>
          <DropdownMenuSeparator />
        </>}
        <DropdownMenuItem variant="destructive" onSelect={() => choose("remove", "Loại thành viên", `${member.name} sẽ mất quyền truy cập. Chỉ có thể quay lại khi chấp nhận lời mời mới.`)}>Loại thành viên</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    {selected && <Action {...selected} externalOpen onOpenChange={value => { if (!value) setSelected(null); }} />}
  </>;
}

export function WorkspaceManagement({ workspace }: { workspace: WorkspaceDetail }) {
  if (workspace.role !== "OWNER") return null;
  const path = `/workspaces/${workspace.id}/manage`;
  return <Card className="gap-0 py-5 [--card-spacing:--spacing(5)]"><CardContent className="space-y-5">
    <div><h3 className="font-semibold">Thiết lập chung</h3><p className="mt-1 text-sm text-muted-foreground">Chỉ Owner có thể thay đổi tên và mật khẩu tham gia.</p></div>
    <Action inline label="Lưu tên" path={path} payload={{ action: "rename" }} field="name" defaultValue={workspace.name} />
    <div className="border-t pt-5"><Action inline label="Đổi mật khẩu nhóm" path={path} payload={{ action: "password" }} field="password" type="password" help="Mật khẩu mới từ 8–128 ký tự. Bạn sẽ xác nhận bằng mật khẩu tài khoản Owner trước khi lưu." /></div>
  </CardContent></Card>;
}

export function WorkspaceDeleteButton({ workspace }: { workspace: WorkspaceDetail }) {
  const router = useRouter();
  if (workspace.role !== "OWNER") return null;
  return <Action label="Xóa workspace" path={`/workspaces/${workspace.id}/manage`} payload={{ action: "delete" }} field="confirmation" help={`Nhập chính xác tên ${workspace.name} để xác nhận xóa vĩnh viễn.`} onDone={() => router.replace("/workspaces")} />;
}

type Invitation={id:string;workspace:{name:string};inviter:{name:string};expiresAt:string};
export function Invitations() {
  const session = useAuthSession();
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const query = useQuery<Invitation[]>({ queryKey: ["invitations", session.user?.uid], enabled: !!session.user, queryFn: () => request("/invitations"), retry: false });
  const mutation = useMutation({ mutationFn: ({ id, accept }: { id: string; accept: boolean }) => request(`/invitations/${id}`, "PATCH", { accept }), onSuccess: () => client.invalidateQueries({ predicate: query => ["invitations", "workspaces", "workspace", "my-tasks"].includes(String(query.queryKey[0])) && query.queryKey[1] === session.user?.uid }) });
  if (query.isPending) return <Skeleton aria-label="Đang tải lời mời" className="mb-5 h-12" />;
  if (query.isError) return <div role="alert" className="mb-5 flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm"><p>Chưa tải được lời mời.</p><Button size="sm" variant="outline" onClick={() => void query.refetch()}>Thử lại</Button></div>;
  if (!query.data.length) return null;
  return <Collapsible open={open} onOpenChange={setOpen} className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50/40">
    <CollapsibleTrigger asChild><Button variant="ghost" className="h-auto w-full justify-between gap-3 rounded-xl px-4 py-3 text-left hover:bg-emerald-50"><span className="flex items-center gap-2"><Mail className="size-4 text-primary" />Lời mời<Badge variant="primary-light">{query.data.length}</Badge></span><ChevronDown className={`size-4 transition-transform duration-200 ease-out motion-reduce:transition-none ${open ? "rotate-180" : ""}`} /></Button></CollapsibleTrigger>
    <CollapsibleContent><div className="space-y-3 px-3 pb-3">
      {/* Hide an empty invitation section; only expand actual pending invitations. */}
      {query.data.map(invite => <Card key={invite.id} className="gap-0 py-4"><CardContent className="flex flex-wrap items-center justify-between gap-3"><div className="min-w-0"><p className="wrap-break-word font-medium">{invite.workspace.name}</p><p className="mt-1 text-xs text-muted-foreground">{invite.inviter.name} mời bạn · Hết hạn {formatDateTime(invite.expiresAt)}</p></div><div className="flex gap-2"><Button size="sm" disabled={mutation.isPending} onClick={() => mutation.mutate({ id: invite.id, accept: true })}>Chấp nhận</Button><Button size="sm" variant="outline" disabled={mutation.isPending} onClick={() => mutation.mutate({ id: invite.id, accept: false })}>Từ chối</Button></div></CardContent></Card>)}
      {mutation.isError && <p role="alert" className="text-sm text-destructive">{errorText(mutation.error)}</p>}
    </div></CollapsibleContent>
  </Collapsible>;
}
export function WorkspaceInsights({id,activity=false}:{id:string;activity?:boolean}){const session=useAuthSession();const query=useQuery({queryKey:[activity?"activity":"dashboard",session.user?.uid,id],enabled:!!session.user,queryFn:()=>request(`/workspaces/${id}/${activity?"activity":"dashboard"}`)});if(query.isPending)return <Skeleton className="h-48 w-full"/>;if(query.isError)return <div role="alert">{errorText(query.error)}<Button onClick={()=>void query.refetch()}>Thử lại</Button></div>;if(activity)return <section><h2 className="mb-4 text-xl font-semibold">Hoạt động gần đây</h2><p className="mb-3 text-xs text-muted-foreground">Tối đa 100 hoạt động mới nhất.</p><ul className="divide-y">{query.data.map((log:{id:string;content:string;createdAt:string})=><li key={log.id} className="py-4"><p>{log.content}</p><time className="text-xs text-muted-foreground">{formatDateTime(log.createdAt)}</time></li>)}</ul></section>;const d=query.data;return <section><h2 className="mb-5 text-xl font-semibold">Tổng quan</h2><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[["Tổng task",d.total],["Hoàn thành",d.done],["Đang làm",d.inProgress],["Quá hạn",d.overdue]].map(([label,value])=><Card key={label}><CardContent><p className="text-sm text-muted-foreground">{label}</p><p className="mt-3 text-3xl font-semibold">{value}</p></CardContent></Card>)}</div><p className="mt-5">Tiến độ: {d.total?Math.round(d.done/d.total*100):0}%</p></section>}
