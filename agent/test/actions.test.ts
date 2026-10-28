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

test('server rejects untrusted origins and mutation without CSRF',async()=>{
  const app=await buildServer();
  const origin=await app.inject({method:'GET',url:'/actions',headers:{origin:'https://attacker.example'}});
  assert.equal(origin.statusCode,403);
  const csrf=await app.inject({method:'POST',url:'/actions/aws.identity/runs',payload:{parameters:{environment:'AWS_REAL_SINGAPORE',scenario:'CASE_1'}}});
  assert.equal(csrf.statusCode,403);
  await app.close();
});

test('PowerShell UTF-8 BOM evidence remains valid JSON',()=>{
  assert.deepEqual(parseJsonText('\uFEFF{"status":"SUCCEEDED"}'),{status:'SUCCEEDED'});
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
