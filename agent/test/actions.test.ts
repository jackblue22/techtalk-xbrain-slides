import assert from 'node:assert/strict';
import test from 'node:test';
import { actions, getAction, publicAction, validateParameters } from '../src/actions.js';
import { buildServer, parseJsonText } from '../src/server.js';

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

test('AWS lifecycle allowlist exposes fixed plan, verification, benchmark and residual actions',()=>{
  for(const id of ['aws.plan','aws.plan-review','aws.cleanup-preview'])assert.equal(getAction(id)?.risk,'READ_ONLY');
  assert.equal(getAction('aws.verify-cost-minimal')?.risk,'TEST_WRITE');
  assert.equal(getAction('aws.benchmark-all')?.risk,'READ_ONLY');
  for(const id of ['aws.apply','aws.destroy','aws.bootstrap'])assert.equal(getAction(id),undefined);
});

test('live AWS verify and benchmark are blocked in NOT_DEPLOYED state',async()=>{
  const app=await buildServer();
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
