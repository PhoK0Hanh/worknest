"use client";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { sendPasswordResetEmail, signOut } from "firebase/auth";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { api } from "@/lib/api";
import axios from "axios";
// Neon owns display names; Firebase owns credentials and password reset delivery.
export function AccountSettings({name,email}:{name:string;email:string}){
 const router=useRouter(); const client=useQueryClient();const [busy,setBusy]=useState(false);const [notice,setNotice]=useState("");
 async function run(action:()=>Promise<void>){setBusy(true);setNotice("");try{await action();}catch(error){setNotice(axios.isAxiosError(error)?error.response?.data?.error??"Không thể lưu. Hãy thử lại.":"Không thể xử lý. Hãy thử lại.");}finally{setBusy(false);}}
 function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();const data=new FormData(event.currentTarget);void run(async()=>{const user=getFirebaseAuth().currentUser;if(!user)return;await api.patch("/account",{name:data.get("name")},{headers:{Authorization:`Bearer ${await user.getIdToken()}`}});await client.invalidateQueries({queryKey:["worknest-profile",user.uid]});setNotice("Đã cập nhật tên.");});}
 return <div className="space-y-5"><form className="space-y-3" onSubmit={submit}><Label htmlFor="account-name">Tên hiển thị</Label><Input id="account-name" name="name" required maxLength={100} defaultValue={name}/><p className="break-all text-sm text-muted-foreground">{email}</p><Button disabled={busy}>Lưu tên</Button></form><Button variant="outline" disabled={busy} onClick={()=>void run(async()=>{const user=getFirebaseAuth().currentUser;if(!user?.email)return;await sendPasswordResetEmail(getFirebaseAuth(),user.email);setNotice("Đã gửi email đặt lại mật khẩu.");})}>Gửi email đặt lại mật khẩu</Button><details className="rounded-lg border p-3"><summary className="cursor-pointer text-sm text-destructive">Xóa tài khoản</summary><p className="my-3 text-sm text-muted-foreground">Bạn sẽ rời mọi nhóm, hồ sơ cũ được giữ cho lịch sử. Phải chuyển Owner hoặc xóa nhóm trước. Danh tính Firebase sẽ được xóa tự động; nếu dịch vụ gián đoạn, server sẽ thử lại mỗi phút. Không thể tự khôi phục tài khoản cũ.</p><form onSubmit={event=>{event.preventDefault();const confirmation=String(new FormData(event.currentTarget).get("confirmation"));void run(async()=>{const auth=getFirebaseAuth();if(!auth.currentUser)return;await api.delete("/account",{data:{confirmation},headers:{Authorization:`Bearer ${await auth.currentUser.getIdToken()}`}});await signOut(auth);client.clear();router.replace("/login");});}} className="space-y-3"><Label htmlFor="delete-confirm">Nhập DELETE để xác nhận</Label><Input id="delete-confirm" name="confirmation" required pattern="DELETE"/><Button variant="destructive" disabled={busy}>Xóa tài khoản</Button></form></details>{notice&&<p key={notice} role="status" className="worknest-notice text-sm">{notice}</p>}</div>;
}
