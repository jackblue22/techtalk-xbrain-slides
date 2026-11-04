import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import os from 'node:os';
import path from 'node:path';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { actions, getAction, publicAction, validateParameters } from '../src/actions.js';
import { buildServer, parseJsonText } from '../src/server.js';
import type { MutationExecutor, PlanManifest } from '../src/lifecycle.js';

test('all execution actions are predefined and no billable or destructive executor exists',()=>{
  assert.ok(actions.length>=10);
  assert.equal(actions.some(action=>action.risk==='BILLABLE'||action.risk==='DESTRUCTIVE'),false);
  assert.equal(getAction('arbitrary.shell'),undefined);
  assert.ok(actions.every(action=>action.preview&&action.timeoutMs>0));
});

test('public actions expose sanitized metadata but not process arguments or environment',()=>{
  const action=publicAction(actions[0]!);
  assert.equal('executor' in action,false);
  assert.equal('env' in action,false);
  assert.equal(action.risk,'READ_ONLY');
  assert.equal(typeof action.cancellable,'boolean');
});

test('safe automatic actions are read-only and never expose a mutation executor',()=>{
  const automatic=actions.filter(action=>action.safeAutomatic);
  assert.ok(automatic.length>=6);
  assert.ok(automatic.every(action=>action.risk==='READ_ONLY'));
  assert.notEqual(getAction('orders.create')?.safeAutomatic,true);
  assert.notEqual(getAction('local.migration')?.safeAutomatic,true);
  assert.notEqual(getAction('local.backup-restore')?.safeAutomatic,true);
  assert.equal(getAction('demo.preflight')?.safeAutomatic,true);
});

test('action parameters reject unknown fields, invalid samples and cross-environment scope',()=>{
  const action=getAction('local.case1')!;
  assert.throws(()=>validateParameters(action,{environment:'AWS_REAL_SINGAPORE',scenario:'CASE_1'}),/environment/);
  assert.throws(()=>validateParameters(action,{environment:'LOCAL_EMULATION',scenario:'CASE_1',samples:301}),/samples/);
  assert.throws(()=>validateParameters(action,{environment:'LOCAL_EMULATION',scenario:'CASE_1',command:'whoami'}),/Unsupported/);
  assert.equal(validateParameters(action,{environment:'LOCAL_EMULATION',scenario:'CASE_1',samples:100,warmups:5}).samples,100);
});

test('Terraform plan accepts only an explicit single-host presenter CIDR',()=>{
  const action=getAction('aws.plan')!;
  const base={environment:'AWS_REAL_SINGAPORE' as const,scenario:'CASE_1' as const};
  assert.throws(()=>validateParameters(action,base),/requires a verified presenterCidr/);
  assert.throws(()=>validateParameters(action,{...base,presenterCidr:'0.0.0.0/0'}),/forbidden/);
  assert.equal(validateParameters(action,{...base,presenterCidr:'203.0.113.10/32'}).presenterCidr,'203.0.113.10/32');
});

test('destroy-plan requires one explicit supported protected-volume decision',()=>{
  const action=getAction('aws.destroy-plan')!;
  const base={environment:'AWS_REAL_SINGAPORE' as const,scenario:'CASE_1' as const};
  assert.throws(()=>validateParameters(action,base),/explicit volumeDecision/);
  assert.throws(()=>validateParameters(action,{...base,volumeDecision:'KEEP_SOMETHING'}),/explicit protected-volume decision/);
  assert.equal(validateParameters(action,{...base,volumeDecision:'DELETE_PROTECTED_VOLUMES'}).volumeDecision,'DELETE_PROTECTED_VOLUMES');
});

test('AWS lifecycle allowlist exposes fixed plan, bootstrap, verification, benchmark and residual actions',()=>{
  for(const id of ['aws.plan','aws.plan-review','aws.bootstrap-readiness','aws.cleanup-preview','aws.lifecycle-reconcile','aws.destroy-plan','aws.residual-audit'])assert.equal(getAction(id)?.risk,'READ_ONLY');
  assert.equal(getAction('aws.verify-cost-minimal')?.risk,'TEST_WRITE');
  assert.equal(getAction('aws.benchmark-all')?.risk,'READ_ONLY');
  for(const id of ['aws.apply','aws.destroy','aws.bootstrap'])assert.equal(getAction(id),undefined);
});

test('bootstrap readiness is dynamic, read-only and validates Hanoi before Hybrid',async()=>{
  const script=await readFile(path.resolve(import.meta.dirname,'..','..','infrastructure','terraform','scripts','bootstrap-readiness.ps1'),'utf8');
  assert.doesNotMatch(script,/ssm\s+send-command/i);
  assert.doesNotMatch(script,/i-[0-9a-f]{17}/i);
  assert.match(script,/terraform @\('output','-json'\)/);
  assert.match(script,/head-object/);
  assert.ok(script.indexOf("Test-Api 'Hanoi API + Hanoi PostgreSQL'")<script.indexOf("Test-Api 'Singapore Hybrid API + Hanoi PostgreSQL'"));
  assert.ok(actions.every(action=>!action.preview.includes('phase2b5-reconcile-bootstrap.ps1')));
});

async function lifecycleApiFixture(){
  const root=await mkdtemp(path.join(os.tmpdir(),'hanoi-lifecycle-api-'));
  const directories=['infrastructure/terraform/environments/cost_minimal','infrastructure/terraform/modules/example','infrastructure/terraform/cleanup-overrides','infrastructure/terraform/artifacts','app/frontend/dist','evidence/lifecycle'];
  await Promise.all(directories.map(item=>mkdir(path.join(root,item),{recursive:true})));
  const files:Record<string,string>={
    'infrastructure/terraform/environments/cost_minimal/main.tf':'resource "terraform_data" "gate" {}',
    'infrastructure/terraform/environments/cost_minimal/.terraform.lock.hcl':'lock',
    'infrastructure/terraform/modules/example/main.tf':'variable "x" {}',
    'infrastructure/terraform/cleanup-overrides/reviewed.tf':'resource "terraform_data" "cleanup" {}',
    'infrastructure/terraform/artifacts/minimal-images.tar':'artifact',
    'app/frontend/dist/index.html':'<html></html>',
  };
  const digest=(value:string|Buffer)=>crypto.createHash('sha256').update(value).digest('hex');
  for(const [relative,content] of Object.entries(files))await writeFile(path.join(root,relative),content);
  const planRelative='infrastructure/terraform/environments/cost_minimal/clone-review.tfplan';const plan='api-fixture-plan';await writeFile(path.join(root,planRelative),plan);
  const exactArguments=['apply','-input=false','-no-color','clone-review.tfplan'];
  const manifest:PlanManifest={schemaVersion:2,operation:'APPLY',generatedAt:new Date().toISOString(),deploymentIdentity:'hanoi-lz-live-demo/cost_minimal',accountId:'123456789012',awsProfile:'lab-profile',region:'ap-southeast-1',terraformRoot:'infrastructure/terraform/environments/cost_minimal',planPath:planRelative,planSha256:digest(plan),configurationFiles:Object.fromEntries(Object.entries(files).map(([name,value])=>[name,digest(value)])),changes:{create:1,update:0,delete:0,addresses:[{address:'terraform_data.gate',actions:['create']}]},exactExecutable:'terraform',exactArguments,exactCommand:`terraform ${exactArguments.join(' ')}`,expectedEffects:'fixture'};
  await writeFile(path.join(root,'evidence/lifecycle/active-apply-plan.json'),JSON.stringify(manifest));return{root,manifest};
}

test('authorized fake lifecycle execution is returned as a real SSE run and stops at INFRA_DEPLOYED',async()=>{
  const {root,manifest}=await lifecycleApiFixture();
  const executor:MutationExecutor={run:async(_context,sink)=>{sink.onStdout?.('fake terraform apply output');return{exitCode:0,stdout:'fake terraform apply output',stderr:''};}};
  const app=await buildServer({lifecycleRepoRoot:root,mutationExecutor:executor,identityVerifier:{verify:async()=>({accountId:'123456789012',awsProfile:'lab-profile',region:'ap-southeast-1'})}});
  const origin='http://localhost:3000';const session=await app.inject({method:'GET',url:'/session',headers:{origin}});const token=(session.json() as{csrfToken:string}).csrfToken;const headers={origin,'x-lab-csrf':token};
  await app.inject({method:'GET',url:'/lifecycle',headers:{origin}});
  const approved=await app.inject({method:'POST',url:'/lifecycle/approvals',headers,payload:{operation:'APPLY',planSha256:manifest.planSha256,phrase:`APPROVE APPLY ${manifest.planSha256.slice(0,12)}`}});assert.equal(approved.statusCode,201);
  const approvalId=(approved.json() as{approval:{id:string}}).approval.id;
  const started=await app.inject({method:'POST',url:'/lifecycle/execute',headers,payload:{approvalId}});assert.equal(started.statusCode,202);
  const stream=await app.inject({method:'GET',url:(started.json() as{eventsUrl:string}).eventsUrl,headers:{origin}});assert.match(stream.body,/fake terraform apply output/);assert.match(stream.body,/INFRA_DEPLOYED, not READY/);
  const state=await app.inject({method:'GET',url:'/lifecycle',headers:{origin}});assert.equal((state.json() as{state:{phase:string}}).state.phase,'INFRA_DEPLOYED');
  await app.close();
});

test('live AWS verify and benchmark are blocked in NOT_DEPLOYED state',async()=>{
  const lifecycleRepoRoot=await mkdtemp(path.join(os.tmpdir(),'hanoi-agent-not-deployed-'));
  const app=await buildServer({lifecycleRepoRoot});
  const session=await app.inject({method:'GET',url:'/session',headers:{origin:'http://localhost:3000'}});const token=(session.json() as {csrfToken:string}).csrfToken;
  const headers={origin:'http://localhost:3000','x-lab-csrf':token};
  const verify=await app.inject({method:'POST',url:'/actions/aws.verify-cost-minimal/runs',headers,payload:{confirmed:true,parameters:{environment:'AWS_REAL_SINGAPORE',scenario:'CASE_1'}}});
  assert.equal(verify.statusCode,409);assert.match((verify.json() as {message:string}).message,/NOT_DEPLOYED/);
  const benchmark=await app.inject({method:'POST',url:'/actions/aws.benchmark-all/runs',headers,payload:{parameters:{environment:'AWS_REAL_SINGAPORE',scenario:'CASE_1'}}});
  assert.equal(benchmark.statusCode,409);assert.match((benchmark.json() as {message:string}).message,/Singapore, Hanoi and Hybrid/);
  await app.close();
});

test('server rejects untrusted origins and mutation without CSRF',async()=>{
  const app=await buildServer();
  const origin=await app.inject({method:'GET',url:'/actions',headers:{origin:'https://attacker.example'}});
  assert.equal(origin.statusCode,403);
  const csrf=await app.inject({method:'POST',url:'/actions/aws.identity/runs',payload:{parameters:{environment:'AWS_REAL_SINGAPORE',scenario:'CASE_1'}}});
  assert.equal(csrf.statusCode,403);
  await app.close();
});

test('lifecycle API is loopback-browser protected and real mutation execution is disabled',async()=>{
  const app=await buildServer();
  const state=await app.inject({method:'GET',url:'/lifecycle',headers:{origin:'http://localhost:3000'}});assert.equal(state.statusCode,200);assert.equal((state.json() as {mutationExecutionEnabled:boolean}).mutationExecutionEnabled,false);
  const noCsrf=await app.inject({method:'POST',url:'/lifecycle/execute',payload:{approvalId:'fake'}});assert.equal(noCsrf.statusCode,403);
  const session=await app.inject({method:'GET',url:'/session',headers:{origin:'http://localhost:3000'}});const token=(session.json() as {csrfToken:string}).csrfToken;
  const disabled=await app.inject({method:'POST',url:'/lifecycle/execute',headers:{origin:'http://localhost:3000','x-lab-csrf':token},payload:{approvalId:'fake'}});assert.equal(disabled.statusCode,409);assert.match((disabled.json() as {message:string}).message,/MUTATION_EXECUTION_DISABLED/);
  await app.close();
});

test('PowerShell UTF-8 BOM evidence remains valid JSON',()=>{
  assert.deepEqual(parseJsonText('\uFEFF{"status":"SUCCEEDED"}'),{status:'SUCCEEDED'});
});

test('historical AWS verification cannot make a destroyed environment available',async()=>{
  const app=await buildServer();
  const response=await app.inject({method:'GET',url:'/environments'});
  assert.equal(response.statusCode,200);
  const targets=(response.json() as {targets:Array<{environment:string;available:boolean;reason?:string}>}).targets.filter(item=>item.environment.startsWith('AWS_REAL'));
  assert.ok(targets.length>=3);
  assert.ok(targets.every(item=>item.available===false));
  assert.ok(targets.some(item=>item.reason?.includes('NOT_DEPLOYED')));
  await app.close();
});

test('SSE stream echoes only an allowlisted Origin after raw reply hijack',async()=>{
  const app=await buildServer();
  const session=await app.inject({method:'GET',url:'/session',headers:{origin:'http://localhost:3000'}});
  const csrfToken=(session.json() as {csrfToken:string}).csrfToken;
  const started=await app.inject({method:'POST',url:'/actions/environment.verify/runs',headers:{origin:'http://localhost:3000','x-lab-csrf':csrfToken},payload:{parameters:{environment:'LOCAL_EMULATION',scenario:'CASE_1'}}});
  assert.equal(started.statusCode,202);
  const stream=await app.inject({method:'GET',url:(started.json() as {eventsUrl:string}).eventsUrl,headers:{origin:'http://localhost:3000'}});
  assert.equal(stream.headers['access-control-allow-origin'],'http://localhost:3000');
  await app.close();
});
