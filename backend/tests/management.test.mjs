import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import express from 'express';
import { createManagementRouter } from '../dist/routes/management.js';

// Permission boundaries run against injected transactions, without changing real accounts.
async function scenario(role, action) {
 const userId=randomUUID(), targetId=randomUUID(), group=randomUUID(), inviteId=randomUUID(); const calls=[];
 const tx={
  $queryRaw:async strings=>strings.join('').includes('public.users')?[{id:userId,name:'Owner'}]:[{id:group}],
  membership:{findUnique:async args=>args.where.userId_workspaceId.userId===userId?{userId,role,leftAt:null,isBanned:false}:{userId:targetId,role:'MEMBER',leftAt:null,isBanned:false,user:{isActive:true}},update:async args=>{calls.push(args);return args;},count:async()=>role==='OWNER'?1:0},
  activityLog:{create:async args=>{calls.push(args);return args;}},
  invitation:{findUnique:async()=>({id:inviteId,inviteeId:targetId,workspaceId:group})},
  workspace:{findUniqueOrThrow:async()=>({name:'My group'}),delete:async()=>calls.push('deleted')},
 };
 const app=express();app.use(express.json());app.use('/api',createManagementRouter({$transaction:async fn=>fn(tx)},(_req,res,next)=>{res.locals.firebaseIdentity={uid:'test'};next();}));
 const server=app.listen(0,'127.0.0.1');await once(server,'listening');
 try {await action({url:`http://127.0.0.1:${server.address().port}/api`,group,targetId,userId,inviteId,calls});}finally{await new Promise(resolve=>server.close(resolve));}
}
function post(url,body,method='POST'){return fetch(url,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});}
test('Member cannot invite, promote, remove or transfer ownership',async()=>scenario('MEMBER',async({url,group,targetId,calls})=>{
 for(const action of ['promote','remove','transfer'])assert.equal((await post(`${url}/workspaces/${group}/manage`,{action,userId:targetId})).status,403);
 assert.equal((await post(`${url}/workspaces/${group}/manage`,{action:'invite',email:'test@example.com'})).status,403);assert.equal(calls.length,0);
}));
test('Admin cannot promote or delete workspace',async()=>scenario('ADMIN',async({url,group,targetId,calls})=>{
 assert.equal((await post(`${url}/workspaces/${group}/manage`,{action:'promote',userId:targetId})).status,403);
 assert.equal((await post(`${url}/workspaces/${group}/manage`,{action:'delete',confirmation:'My group'})).status,403);assert.equal(calls.length,0);
}));
test('Owner transfer demotes caller before promoting successor',async()=>scenario('OWNER',async({url,group,targetId,userId,calls})=>{
 assert.equal((await post(`${url}/workspaces/${group}/manage`,{action:'transfer',userId:targetId})).status,200);
 assert.equal(calls[0].where.userId_workspaceId.userId,userId);assert.equal(calls[0].data.role,'ADMIN');assert.equal(calls[1].data.role,'OWNER');
}));
test('Invitation recipient and workspace delete confirmation are enforced',async()=>scenario('OWNER',async({url,group,inviteId,calls})=>{
 assert.equal((await post(`${url}/invitations/${inviteId}`,{accept:true},'PATCH')).status,404);
 assert.equal((await post(`${url}/workspaces/${group}/manage`,{action:'delete',confirmation:'wrong'})).status,400);
 assert.equal((await post(`${url}/account`,{confirmation:'DELETE'},'DELETE')).status,409);assert.equal(calls.length,0);
}));
