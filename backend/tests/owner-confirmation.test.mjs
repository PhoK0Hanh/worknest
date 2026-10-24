import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyOwnerConfirmation } from '../dist/lib/owner-confirmation.js';
const now=()=>Math.floor(Date.now()/1000);
const identity=()=>({uid:'owner',auth_time:now(),firebase:{sign_in_provider:'password'}});
test('Owner proof requires the same UID and recent password authentication', async()=>{
 await verifyOwnerConfirmation('owner','token',async()=>identity());
 for(const value of [{...identity(),uid:'other'},{...identity(),auth_time:now()-121},{...identity(),auth_time:now()+60},{...identity(),auth_time:undefined},{...identity(),firebase:{sign_in_provider:'google.com'}}]) {
  await assert.rejects(verifyOwnerConfirmation('owner','token',async()=>value),error=>error.code==='OWNER_REAUTH_REQUIRED');
 }
});
test('Missing, forged and revoked confirmation tokens are rejected', async()=>{
 for(const token of [undefined,'',12,'x'.repeat(16385)]) await assert.rejects(verifyOwnerConfirmation('owner',token,async()=>{assert.fail('invalid input must not verify');}),error=>error.code==='OWNER_REAUTH_REQUIRED');
 await assert.rejects(verifyOwnerConfirmation('owner','revoked',async()=>{throw new Error('auth/id-token-revoked');}),error=>error.code==='OWNER_REAUTH_REQUIRED');
});
