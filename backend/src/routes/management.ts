import { summarizeTasks } from "../lib/dashboard.js";
import { notifyTasksChanged } from "../lib/realtime.js";
import { verifyOwnerConfirmation, type VerifyOwnerToken } from "../lib/owner-confirmation.js";
import { verifyFirebaseIdToken } from "../lib/firebase-admin.js";
import { cleanupDeletedAccounts } from "../lib/account-cleanup.js";
import { rateLimit } from "express-rate-limit";
import { Router, type RequestHandler } from "express";
import { z } from "zod";
import { hash } from "argon2";
import { getPrisma } from "../lib/prisma.js";
import { requireFirebaseAuth } from "../middleware/require-firebase-auth.js";
import { WorkspaceError } from "../services/workspaces.js";
import type { Prisma, PrismaClient } from "../generated/prisma/client.js";

async function context(tx: Prisma.TransactionClient, uid: string, id?: string) {
  const users = await tx.$queryRaw<Array<{ id: string; name: string }>>`SELECT id,name FROM public.users WHERE firebase_uid=${uid} AND is_active FOR UPDATE`;
  const user = users[0];
  if (!user) throw new WorkspaceError("ACCOUNT_UNAVAILABLE",403,"Tài khoản không hoạt động.");
  if (!id) return { user, role: "" };
  await tx.$queryRaw`SELECT id FROM public.workspaces WHERE id=${id}::uuid FOR UPDATE`;
  const m = await tx.membership.findUnique({ where: { userId_workspaceId: { userId: user.id, workspaceId: id } } });
  if (!m || m.leftAt || m.isBanned) throw new WorkspaceError("WORKSPACE_NOT_FOUND",404,"Không có quyền truy cập.");
  return { user, role: m.role };
}
function requireRole(role: string, owner = false) {
  if (owner ? role !== "OWNER" : !["OWNER","ADMIN"].includes(role)) throw new WorkspaceError("FORBIDDEN",403,"Bạn không có quyền thực hiện thao tác này.");
}

export function createManagementRouter(database: Pick<PrismaClient,"$transaction"> = { $transaction: (...args: Parameters<PrismaClient["$transaction"]>) => getPrisma().$transaction(...args) } as Pick<PrismaClient,"$transaction">, auth: RequestHandler = requireFirebaseAuth, verifyOwner: VerifyOwnerToken = verifyFirebaseIdToken) {
const management = Router();
management.use(auth);
management.use(rateLimit({ windowMs: 60000, limit: 120, standardHeaders: "draft-8", legacyHeaders: false, keyGenerator: (_req,res) => res.locals.firebaseIdentity.uid }));
// One dispatcher keeps every operation inside its authorization transaction.
management.all(["/invitations", "/invitations/:invitationId", "/workspaces/:id/manage", "/workspaces/:id/activity", "/workspaces/:id/dashboard", "/account"], async (req,res) => {
  res.set("Cache-Control","no-store");
  try {
    const id = req.params.id ? z.uuid().parse(req.params.id) : undefined;
    if (req.method !== "GET" && !req.is("application/json")) { res.status(415).json({ error:"Yêu cầu phải dùng JSON." }); return; }
    const body = req.body;
    const sensitive = id && req.method === "POST" && req.path.endsWith('/manage') && ["delete", "transfer", "password"].includes(body?.action);
    // Verify Firebase proof outside the database transaction, then enforce Owner role inside it.
    let confirmationError: unknown;
    if (sensitive) {
      try { await verifyOwnerConfirmation(res.locals.firebaseIdentity.uid, body?.ownerConfirmationToken, verifyOwner); }
      catch (error) { confirmationError = error; }
    }
    const passwordHash = !confirmationError && req.path.endsWith('/manage') && body?.action === 'password' && typeof body?.password === 'string' ? await hash(z.string().min(8).max(128).parse(body.password), { memoryCost: 19456, timeCost: 2, parallelism: 1 }) : undefined;
    const result = await database.$transaction(async tx => {
      const { user, role } = await context(tx,res.locals.firebaseIdentity.uid,id);
      const log = async (content: string) => { if (id) await tx.activityLog.create({ data: { workspaceId:id,content:`${user.name}: ${content}` } }); };
      if (req.path === "/account") {
        if (req.method === "PATCH") {
          const { name } = z.object({name:z.string().trim().min(1).max(100)}).strict().parse(body);
          return tx.user.update({where:{id:user.id},data:{name},select:{id:true,name:true}});
        }
        if (req.method === "DELETE") {
          z.object({confirmation:z.literal("DELETE")}).strict().parse(body);
          const owned = await tx.membership.count({where:{userId:user.id,role:"OWNER",leftAt:null}});
          if (owned) throw new WorkspaceError("OWNER_TRANSFER_REQUIRED",409,"Chuyển quyền Owner hoặc xóa các nhóm đang sở hữu trước.");
          const memberships=await tx.membership.findMany({where:{userId:user.id,leftAt:null},orderBy:{workspaceId:"asc"}});
          for(const membership of memberships){
            await tx.$queryRaw`SELECT id FROM public.workspaces WHERE id=${membership.workspaceId}::uuid FOR UPDATE`;
            await tx.activityLog.create({data:{workspaceId:membership.workspaceId,content:`${user.name} đã xóa tài khoản và rời nhóm.`}});
          }
          await tx.membership.updateMany({where:{userId:user.id,leftAt:null},data:{leftAt:new Date()}});
          await tx.task.updateMany({where:{assigneeId:user.id,status:{not:"DONE"}},data:{assigneeId:null}});
          await tx.invitation.updateMany({where:{OR:[{inviteeId:user.id},{inviterId:user.id}],status:"PENDING"},data:{status:"REJECTED"}});
          await tx.user.update({where:{id:user.id},data:{isActive:false,email:null,deletedAt:new Date()}});
          return {deleted:true};
        }
      }
      if (req.path === "/invitations" && req.method === "GET") return tx.invitation.findMany({where:{inviteeId:user.id,status:"PENDING",expiresAt:{gt:new Date()}},include:{workspace:{select:{id:true,name:true}},inviter:{select:{name:true}}},orderBy:{createdAt:"desc"},take:100});
      if (req.params.invitationId && req.method === "PATCH") {
        const inviteId=z.uuid().parse(req.params.invitationId);
        const {accept}=z.object({accept:z.boolean()}).strict().parse(body);
        // Lock the group before the invitation so acceptance and removal serialize together.
        const reference=await tx.invitation.findUnique({where:{id:inviteId}});
        if (!reference || reference.inviteeId!==user.id) throw new WorkspaceError("INVITATION_INVALID",404,"Không tìm thấy lời mời.");
        await tx.$queryRaw`SELECT id FROM public.workspaces WHERE id=${reference.workspaceId}::uuid FOR UPDATE`;
        const invite=await tx.invitation.findUniqueOrThrow({where:{id:inviteId}});
        if(invite.status!=="PENDING" || invite.expiresAt<=new Date()) throw new WorkspaceError("INVITATION_INVALID",409,"Lời mời đã được xử lý hoặc hết hạn.");
        const sender=await tx.membership.findUnique({where:{userId_workspaceId:{userId:invite.inviterId,workspaceId:invite.workspaceId}},include:{user:true}});
        if(accept && (!sender || sender.leftAt || sender.isBanned || !sender.user.isActive || !["OWNER","ADMIN"].includes(sender.role))) throw new WorkspaceError("INVITATION_INVALID",409,"Người gửi không còn quyền mời.");
        if(accept){
          const old=await tx.membership.findUnique({where:{userId_workspaceId:{userId:user.id,workspaceId:invite.workspaceId}}});
          if(!old || old.leftAt) await tx.membership.upsert({where:{userId_workspaceId:{userId:user.id,workspaceId:invite.workspaceId}},create:{userId:user.id,workspaceId:invite.workspaceId},update:{role:"MEMBER",leftAt:null,isBanned:false,joinedAt:new Date()}});
          await tx.activityLog.create({data:{workspaceId:invite.workspaceId,content:`${user.name} đã chấp nhận lời mời.`}});
        }
        await tx.invitation.update({where:{id:inviteId},data:{status:accept?"ACCEPTED":"REJECTED"}});
        return {saved:true};
      }
      if(id && req.method==="GET"){
        if(req.path.endsWith('/activity')) return tx.activityLog.findMany({where:{workspaceId:id},orderBy:[{createdAt:"desc"},{id:"desc"}],take:100});
        const tasks=await tx.task.findMany({where:{workspaceId:id},include:{creator:{select:{name:true,isActive:true}}},orderBy:[{dueAt:"asc"},{id:"asc"}]});
        const summary=summarizeTasks(tasks,new Date());
        const recentActivity=await tx.activityLog.findMany({where:{workspaceId:id},orderBy:[{createdAt:"desc"},{id:"desc"}],take:5});
        return {...summary,attention:summary.attention.map(({creator,...task})=>({...task,creatorName:creator.isActive?creator.name:"Tài khoản đã xóa"})),recentActivity};
      }
      if(id && req.path.endsWith('/manage') && req.method==="POST"){
        const input=z.discriminatedUnion("action",[
          z.object({action:z.literal("invite"),email:z.email()}),z.object({action:z.literal("rename"),name:z.string().trim().min(1).max(100)}),
          z.object({action:z.literal("password"),password:z.string().min(8).max(128)}),z.object({action:z.literal("delete"),confirmation:z.string()}),
          z.object({action:z.enum(["promote","demote","remove","transfer"]),userId:z.uuid()})]).parse(body);
        requireRole(role,["rename","password","delete","transfer","promote","demote"].includes(input.action));
        if (sensitive && confirmationError) throw confirmationError;
        if(input.action==="invite"){
          const target=await tx.user.findFirst({where:{email:{equals:input.email,mode:"insensitive"},isActive:true}});
          if(!target) throw new WorkspaceError("USER_NOT_FOUND",404,"Người nhận cần có tài khoản WorkNest.");
          const member=await tx.membership.findUnique({where:{userId_workspaceId:{userId:target.id,workspaceId:id}}});
          if(member&&!member.leftAt) throw new WorkspaceError("ALREADY_MEMBER",409,"Người này đã ở trong nhóm.");
          if(await tx.invitation.count({where:{workspaceId:id,inviteeId:target.id,status:"PENDING",expiresAt:{gt:new Date()}}})) throw new WorkspaceError("INVITATION_PENDING",409,"Đã có lời mời còn hạn.");
          await tx.invitation.create({data:{workspaceId:id,inviteeId:target.id,inviterId:user.id}});
        } else if(input.action==="rename") await tx.workspace.update({where:{id},data:{name:input.name}});
        else if(input.action==="password") await tx.workspace.update({where:{id},data:{joinPasswordHash:passwordHash!}});
        else if(input.action==="delete"){
          const group=await tx.workspace.findUniqueOrThrow({where:{id}});
          if(input.confirmation!==group.name) throw new WorkspaceError("CONFIRMATION_REQUIRED",400,"Nhập đúng tên nhóm để xác nhận.");
          await tx.workspace.delete({where:{id}}); return {deleted:true};
        }else{
          const target=await tx.membership.findUnique({where:{userId_workspaceId:{userId:input.userId,workspaceId:id}},include:{user:true}});
          if(!target||target.leftAt||target.isBanned||!target.user.isActive||target.userId===user.id||target.role==="OWNER"||(role==="ADMIN"&&target.role!=="MEMBER")) throw new WorkspaceError("MEMBER_INVALID",400,"Không thể thao tác với thành viên này.");
          if(input.action==="transfer") await tx.membership.update({where:{userId_workspaceId:{userId:user.id,workspaceId:id}},data:{role:"ADMIN"}});
          await tx.membership.update({where:{userId_workspaceId:{userId:target.userId,workspaceId:id}},data: input.action==="remove"?{leftAt:new Date(),isBanned:true}: {role:input.action==="transfer"?"OWNER":input.action==="promote"?"ADMIN":"MEMBER"}});
          if(input.action==="remove") await tx.task.updateMany({where:{workspaceId:id,assigneeId:target.userId,status:{not:"DONE"}},data:{assigneeId:null}});
        }
        await log(`đã thực hiện ${input.action}.`); return {saved:true};
      }
      throw new WorkspaceError("NOT_FOUND",404,"Không tìm thấy thao tác.");
    });
    if (req.path === "/account" && req.method === "DELETE") void cleanupDeletedAccounts();
    res.json(result);
    // Notify only after commit so personal lists lose removed memberships and deleted workspaces.
    if (id && req.method === "POST") notifyTasksChanged(id);
  } catch(error) {
    res.status(error instanceof z.ZodError?400:error instanceof WorkspaceError?error.status:503).json({error:error instanceof WorkspaceError?error.message:"Chưa thể xử lý yêu cầu.",code:error instanceof WorkspaceError?error.code:"MANAGEMENT_ERROR"});
  }
});

return management;
}
export const management = createManagementRouter();
