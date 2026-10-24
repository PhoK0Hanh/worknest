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
import { MoreHorizontal, Settings, UserPlus } from "lucide-react";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
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
};

// The confirmation dialog lives outside dropdown content so closing the menu cannot unmount it.
function Action({ label, path, payload, field, type = "text", help, onDone, externalOpen, onOpenChange }: ActionProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const client = useQueryClient();
  const open = externalOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;
  const ownerPasswordInput = useRef<HTMLInputElement>(null);
  const sensitive = ["delete", "transfer", "password"].includes(payload.action);
  const mutation = useMutation({
    mutationFn: async (data: object) => {
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
      await client.invalidateQueries();
      setOpen(false);
      onDone?.();
    },
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    mutation.mutate({ ...payload, ...(field ? { [field]: data.get(field) } : {}) });
  }
  const labels: Record<string, string> = { email: "Email thành viên", name: "Tên workspace mới", password: "Mật khẩu mới", confirmation: "Tên workspace để xác nhận" };
  return <Dialog open={open} onOpenChange={value => { if (!mutation.isPending) setOpen(value); }}>
    {externalOpen === undefined && <DialogTrigger asChild><Button size="sm" variant={payload.action === "delete" ? "destructive" : "outline"} onClick={() => mutation.reset()}>{payload.action === "invite" && <UserPlus />}{label}</Button></DialogTrigger>}
    <DialogContent>
      <DialogHeader><DialogTitle>{label}</DialogTitle><DialogDescription>{help ?? "Xác nhận thao tác này cho workspace."}</DialogDescription></DialogHeader>
      <form onSubmit={submit} className="space-y-4">
        {field && <div className="space-y-2"><Label htmlFor={`${payload.action}-${field}`}>{labels[field] ?? field}</Label><Input id={`${payload.action}-${field}`} name={field} type={type} required disabled={mutation.isPending} maxLength={field === "password" ? 128 : 200} minLength={field === "password" ? 8 : 1} /></div>}
        {sensitive && <div className="space-y-2"><Label htmlFor={`${payload.action}-owner-password`}>Mật khẩu tài khoản Owner</Label><Input id={`${payload.action}-owner-password`} ref={ownerPasswordInput} name="ownerPassword" type="password" autoComplete="current-password" required disabled={mutation.isPending} /><p className="text-xs text-muted-foreground">Nhập mật khẩu đăng nhập của bạn, không phải mật khẩu tham gia nhóm.</p></div>}
        {mutation.isError && <p role="alert" className="text-sm text-destructive">{errorText(mutation.error)}</p>}
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={mutation.isPending} onClick={() => setOpen(false)}>Hủy</Button><Button variant={["remove", "delete"].includes(payload.action) ? "destructive" : "default"} disabled={mutation.isPending}>{mutation.isPending ? "Đang lưu..." : "Xác nhận"}</Button></div>
      </form>
    </DialogContent>
  </Dialog>;
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
  const router = useRouter();
  if (workspace.role !== "OWNER") return null;
  const path = `/workspaces/${workspace.id}/manage`;
  return <Card className="gap-0 py-5 [--card-spacing:--spacing(5)]"><CardContent className="space-y-4">
    <h3 className="font-semibold">Cài đặt workspace</h3>
    <p className="text-sm leading-6 text-muted-foreground">Quản lý tên, mật khẩu tham gia và dữ liệu của nhóm.</p>
    <Dialog><DialogTrigger asChild><Button variant="outline" className="w-full"><Settings />Mở cài đặt</Button></DialogTrigger><DialogContent>
      <DialogHeader><DialogTitle>Cài đặt workspace</DialogTitle><DialogDescription>Chỉ Owner có thể thay đổi các thiết lập này.</DialogDescription></DialogHeader>
      <div className="flex flex-col items-start gap-3">
        <Action label="Đổi tên" path={path} payload={{ action: "rename" }} field="name" />
        <Action label="Đổi mật khẩu nhóm" path={path} payload={{ action: "password" }} field="password" type="password" />
        <div className="w-full space-y-3 border-t pt-4"><p className="text-sm text-muted-foreground">Xóa workspace sẽ xóa toàn bộ task, lời mời và lịch sử nhóm.</p><Action label="Xóa workspace" path={path} payload={{ action: "delete" }} field="confirmation" help={`Nhập chính xác tên ${workspace.name} để xác nhận xóa vĩnh viễn.`} onDone={() => router.replace("/workspaces")} /></div>
      </div>
    </DialogContent></Dialog>
  </CardContent></Card>;
}

type Invitation={id:string;workspace:{name:string};inviter:{name:string};expiresAt:string};
export function Invitations(){const session=useAuthSession();const client=useQueryClient();const query=useQuery<Invitation[]>({queryKey:["invitations",session.user?.uid],enabled:!!session.user,queryFn:()=>request("/invitations"),retry:false});const mutation=useMutation({mutationFn:({id,accept}:{id:string;accept:boolean})=>request(`/invitations/${id}`,"PATCH",{accept}),onSuccess:()=>client.invalidateQueries()});return <section className="mb-6 space-y-3"><h2 className="font-semibold">Lời mời của bạn</h2>{query.isPending?<Skeleton className="h-16 w-full"/>:query.isError?<Button variant="outline" onClick={()=>void query.refetch()}>Tải lại lời mời</Button>:query.data?.length?query.data.map(invite=><Card key={invite.id}><CardContent className="flex flex-wrap items-center justify-between gap-3"><div><p>{invite.workspace.name} · {invite.inviter.name}</p><p className="text-xs text-muted-foreground">Hết hạn: {formatDateTime(invite.expiresAt)}</p></div><div className="flex gap-2"><Button disabled={mutation.isPending} onClick={()=>mutation.mutate({id:invite.id,accept:true})}>Chấp nhận</Button><Button variant="outline" disabled={mutation.isPending} onClick={()=>mutation.mutate({id:invite.id,accept:false})}>Từ chối</Button></div></CardContent></Card>):<p className="text-sm text-muted-foreground">Không có lời mời còn hạn.</p>}{mutation.isError&&<p role="alert">{errorText(mutation.error)}</p>}</section>}
export function WorkspaceInsights({id,activity=false}:{id:string;activity?:boolean}){const session=useAuthSession();const query=useQuery({queryKey:[activity?"activity":"dashboard",session.user?.uid,id],enabled:!!session.user,queryFn:()=>request(`/workspaces/${id}/${activity?"activity":"dashboard"}`)});if(query.isPending)return <Skeleton className="h-48 w-full"/>;if(query.isError)return <div role="alert">{errorText(query.error)}<Button onClick={()=>void query.refetch()}>Thử lại</Button></div>;if(activity)return <section><h2 className="mb-4 text-xl font-semibold">Hoạt động gần đây</h2><p className="mb-3 text-xs text-muted-foreground">Tối đa 100 hoạt động mới nhất.</p><ul className="divide-y">{query.data.map((log:{id:string;content:string;createdAt:string})=><li key={log.id} className="py-4"><p>{log.content}</p><time className="text-xs text-muted-foreground">{formatDateTime(log.createdAt)}</time></li>)}</ul></section>;const d=query.data;return <section><h2 className="mb-5 text-xl font-semibold">Tổng quan</h2><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[["Tổng task",d.total],["Hoàn thành",d.done],["Đang làm",d.inProgress],["Quá hạn",d.overdue]].map(([label,value])=><Card key={label}><CardContent><p className="text-sm text-muted-foreground">{label}</p><p className="mt-3 text-3xl font-semibold">{value}</p></CardContent></Card>)}</div><p className="mt-5">Tiến độ: {d.total?Math.round(d.done/d.total*100):0}%</p></section>}
