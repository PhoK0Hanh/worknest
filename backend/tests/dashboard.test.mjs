import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeTasks } from '../dist/lib/dashboard.js';
const now=new Date('2026-10-24T00:00:00Z');
test('dashboard counts, urgency order and seven-day boundary use one clock',()=>{
 const tasks=[
 {id:'done',status:'DONE',dueAt:new Date('2026-10-20')},
 {id:'overdue',status:'TODO',dueAt:new Date('2026-10-23')},
 {id:'now',status:'IN_PROGRESS',dueAt:now},
 {id:'edge',status:'TODO',dueAt:new Date('2026-10-31T00:00:00Z')},
 {id:'later',status:'TODO',dueAt:new Date('2026-11-01')},
 {id:'unset',status:'TODO',dueAt:null},
 ];
 const result=summarizeTasks(tasks,now);
 assert.equal(result.total,6);assert.equal(result.done,1);assert.equal(result.todo,4);assert.equal(result.inProgress,1);assert.equal(result.overdue,1);
 assert.deepEqual(result.attention.map(task=>task.id),['overdue','now','edge']);
});
test('dashboard caps attention at five and handles an empty workspace',()=>{
 const tasks=Array.from({length:8},(_,id)=>({id,status:'TODO',dueAt:new Date(now.getTime()+id*1000)}));
 assert.equal(summarizeTasks(tasks,now).attention.length,5);
 const empty=summarizeTasks([],now);assert.equal(empty.total,0);assert.equal(empty.overdue,0);assert.deepEqual(empty.attention,[]);
});
