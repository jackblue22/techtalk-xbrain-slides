import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import os from 'node:os';
import path from 'node:path';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { LifecycleGate, type LifecycleOperation, type MutationExecutor, type PlanManifest } from '../src/lifecycle.js';

const hash=(value:string)=>crypto.createHash('sha256').update(value).digest('hex');
async function fixture(operation:LifecycleOperation='APPLY'){
  const root=await mkdtemp(path.join(os.tmpdir(),'hanoi-lifecycle-'));
  const environment=path.join(root,'infrastructure','terraform','environments','cost_minimal');
  const modules=path.join(root,'infrastructure','terraform','modules','example');
  const artifacts=path.join(root,'infrastructure','terraform','artifacts');
  const dist=path.join(root,'app','frontend','dist');
  const evidence=path.join(root,'evidence','lifecycle');
  await Promise.all([environment,modules,artifacts,dist,evidence].map(item=>mkdir(item,{recursive:true})));
  const files:Record<string,string>={
    'infrastructure/terraform/environments/cost_minimal/main.tf':'resource "terraform_data" "gate" {}',
    'infrastructure/terraform/environments/cost_minimal/.terraform.lock.hcl':'provider-lock',
    'infrastructure/terraform/modules/example/main.tf':'variable "example" {}',
    'infrastructure/terraform/artifacts/minimal-images.tar':'artifact',
    'app/frontend/dist/index.html':'<html>lab</html>',
  };
  for(const [relative,content] of Object.entries(files))await writeFile(path.join(root,relative),content);
  const planName=operation==='APPLY'?'clone-review.tfplan':'destroy-review.tfplan';
  const planRelative=`infrastructure/terraform/environments/cost_minimal/${planName}`;const planContent=`immutable-${operation}-plan`;await writeFile(path.join(root,planRelative),planContent);
  const manifest:PlanManifest={schemaVersion:1,operation,generatedAt:new Date().toISOString(),deploymentIdentity:'hanoi-lz-live-demo/cost_minimal',accountId:'123456789012',region:'ap-southeast-1',planPath:planRelative,planSha256:hash(planContent),configurationFiles:Object.fromEntries(Object.entries(files).map(([name,content])=>[name,hash(content)])),changes:{create:operation==='APPLY'?48:0,update:0,delete:operation==='DESTROY'?48:0,addresses:[{address:'terraform_data.gate',actions:[operation==='APPLY'?'create':'delete']}]},exactCommand:`terraform apply -input=false ${planName}`,expectedEffects:'fixture'};
  await writeFile(path.join(evidence,operation==='APPLY'?'active-apply-plan.json':'active-destroy-plan.json'),JSON.stringify(manifest));return{root,manifest};
}

test('approval is bound to exact phrase, plan hash, account, region and deployment identity',async()=>{
  const {root,manifest}=await fixture();const gate=new LifecycleGate(root);
  assert.equal((await gate.planStatus('APPLY')).fresh,true);
  await assert.rejects(()=>gate.approve({operation:'APPLY',planSha256:manifest.planSha256,phrase:'yes'}),/CONFIRMATION_MISMATCH/);
  await assert.rejects(()=>gate.approve({operation:'APPLY',planSha256:'0'.repeat(64),phrase:`APPROVE APPLY ${'0'.repeat(12)}`}),/PLAN_HASH_MISMATCH/);
  const approval=await gate.approve({operation:'APPLY',planSha256:manifest.planSha256,phrase:`APPROVE APPLY ${manifest.planSha256.slice(0,12)}`});
  assert.equal(approval.accountId,'123456789012');assert.equal(approval.region,'ap-southeast-1');assert.equal(approval.deploymentIdentity,'hanoi-lz-live-demo/cost_minimal');
});

test('fake executor receives only the exact approved saved plan and approval is one-use',async()=>{
  const {root,manifest}=await fixture();const calls:Array<{operation:LifecycleOperation;plan:string}>=[];
  const executor:MutationExecutor={run:async(operation,plan)=>{calls.push({operation,plan});return{exitCode:0,stdout:'fake only',stderr:''};}};
  const gate=new LifecycleGate(root,executor);const approval=await gate.approve({operation:'APPLY',planSha256:manifest.planSha256,phrase:`APPROVE APPLY ${manifest.planSha256.slice(0,12)}`});
  assert.equal((await gate.execute(approval.id)).exitCode,0);assert.equal(calls.length,1);assert.equal(calls[0]?.operation,'APPLY');assert.equal(calls[0]?.plan,path.join(root,manifest.planPath));
  await assert.rejects(()=>gate.execute(approval.id),/ALREADY_USED/);
});

test('changed configuration or saved plan invalidates approval before execution',async()=>{
  const {root,manifest}=await fixture();const executor:MutationExecutor={run:async()=>({exitCode:0,stdout:'',stderr:''})};const gate=new LifecycleGate(root,executor);
  const approval=await gate.approve({operation:'APPLY',planSha256:manifest.planSha256,phrase:`APPROVE APPLY ${manifest.planSha256.slice(0,12)}`});
  await writeFile(path.join(root,'infrastructure','terraform','modules','example','main.tf'),'changed');
  await assert.rejects(()=>gate.execute(approval.id),/PLAN_STALE/);
});

test('destroy approval always requires an explicit protected-volume retention decision',async()=>{
  const {root,manifest}=await fixture('DESTROY');const gate=new LifecycleGate(root);
  const phrase=`APPROVE DESTROY ${manifest.planSha256.slice(0,12)}`;
  await assert.rejects(()=>gate.approve({operation:'DESTROY',planSha256:manifest.planSha256,phrase}),/RETENTION_DECISION_REQUIRED/);
  const approval=await gate.approve({operation:'DESTROY',planSha256:manifest.planSha256,phrase,retentionDecision:'RETAIN_PROTECTED_VOLUMES'});assert.equal(approval.retentionDecision,'RETAIN_PROTECTED_VOLUMES');
});

test('production gate cannot execute mutations without an injected executor',async()=>{
  const {root,manifest}=await fixture();const gate=new LifecycleGate(root);const approval=await gate.approve({operation:'APPLY',planSha256:manifest.planSha256,phrase:`APPROVE APPLY ${manifest.planSha256.slice(0,12)}`});
  await assert.rejects(()=>gate.execute(approval.id),/MUTATION_EXECUTION_DISABLED/);
});

test('overlapping lifecycle mutations are rejected by the global lifecycle lock',async()=>{
  const {root,manifest}=await fixture();let release!:()=>void;const blocked=new Promise<void>(resolve=>{release=resolve});
  const executor:MutationExecutor={run:async()=>{await blocked;return{exitCode:0,stdout:'',stderr:''};}};const gate=new LifecycleGate(root,executor);const phrase=`APPROVE APPLY ${manifest.planSha256.slice(0,12)}`;
  const first=await gate.approve({operation:'APPLY',planSha256:manifest.planSha256,phrase});const second=await gate.approve({operation:'APPLY',planSha256:manifest.planSha256,phrase});
  const running=gate.execute(first.id);for(let attempt=0;attempt<200&&!gate.locked;attempt++)await new Promise(resolve=>setTimeout(resolve,5));assert.equal(gate.locked,true);await assert.rejects(()=>gate.execute(second.id),/LIFECYCLE_LOCKED/);release();await running;
});
