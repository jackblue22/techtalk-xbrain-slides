import assert from 'node:assert/strict';
import test from 'node:test';
import { environmentSupportsScenario, lifecycleControls, scenarios } from './workflow.js';

test('five scenarios have stable IDs, numbered steps and explicit risk',()=>{
  assert.equal(scenarios.length,5);
  assert.deepEqual(scenarios.map(item=>item.id),['CASE_1','CASE_2','CASE_3','CASE_4','CASE_5']);
  assert.ok(scenarios.every(item=>item.steps.length>0&&item.steps.every(step=>step.id&&step.risk)));
});

test('billable and destructive EBS operations are visibly blocked',()=>{
  const case5=scenarios.find(item=>item.id==='CASE_5')!;
  const risky=case5.steps.filter(step=>step.risk==='BILLABLE'||step.risk==='DESTRUCTIVE');
  assert.ok(risky.length>=3);
  assert.ok(risky.every(step=>!step.actionId&&step.blockedReason));
});

test('environment compatibility does not relabel AWS topologies',()=>{
  assert.equal(environmentSupportsScenario('AWS_REAL_SINGAPORE','CASE_1'),true);
  assert.equal(environmentSupportsScenario('AWS_REAL_SINGAPORE','CASE_2'),false);
  assert.equal(environmentSupportsScenario('AWS_REAL_HYBRID','CASE_3'),true);
  assert.equal(environmentSupportsScenario('AWS_REAL_HYBRID','CASE_4'),true);
  assert.equal(environmentSupportsScenario('AWS_REAL_HYBRID','CASE_5'),true);
  assert.equal(environmentSupportsScenario('EXTERNAL_VN_REAL','CASE_5'),false);
});

test('real AWS lifecycle mutations remain separately approval gated',()=>{
  const deploy=lifecycleControls.find(item=>item.id==='lab-deploy')!;
  const destroy=lifecycleControls.find(item=>item.id==='lab-destroy')!;
  assert.equal(deploy.actionId,undefined);
  assert.equal(destroy.actionId,undefined);
  assert.match(deploy.blockedReason??'',/SEPARATE_APPROVAL/);
  assert.match(destroy.blockedReason??'',/SEPARATE_APPROVAL/);
  assert.equal(lifecycleControls.find(item=>item.id==='lab-status')?.actionId,'demo.preflight');
  assert.equal(lifecycleControls.find(item=>item.id==='lab-plan')?.actionId,'aws.plan');
  assert.equal(lifecycleControls.find(item=>item.id==='lab-cleanup-preview')?.actionId,'aws.cleanup-preview');
});
