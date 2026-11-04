import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import os from 'node:os';
import path from 'node:path';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import {
  LifecycleGate,
  type LifecycleOperation,
  type LifecyclePhase,
  type MutationExecutor,
  type PlanManifest,
  type RetentionDecision,
  type RuntimeIdentityVerifier,
} from '../src/lifecycle.js';
import { savedPlanCommand } from '../src/saved-plan-executor.js';

const hash = (value: string) => crypto.createHash('sha256').update(value).digest('hex');
const fixedNow = new Date('2026-11-04T04:00:00.000Z');
const clock = () => new Date(fixedNow);
const identity = (overrides: Partial<{ accountId: string; awsProfile: string; region: string }> = {}): RuntimeIdentityVerifier => ({
  verify: async () => ({ accountId: '123456789012', awsProfile: 'lab-profile', region: 'ap-southeast-1', ...overrides }),
});

async function fixture(operation: LifecycleOperation = 'APPLY', options: { phase?: LifecyclePhase; generatedAt?: string; retentionDecision?: RetentionDecision } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'hanoi-lifecycle-'));
  const environment = path.join(root, 'infrastructure', 'terraform', 'environments', 'cost_minimal');
  const modules = path.join(root, 'infrastructure', 'terraform', 'modules', 'example');
  const cleanupOverrides = path.join(root, 'infrastructure', 'terraform', 'cleanup-overrides');
  const artifacts = path.join(root, 'infrastructure', 'terraform', 'artifacts');
  const dist = path.join(root, 'app', 'frontend', 'dist');
  const evidence = path.join(root, 'evidence', 'lifecycle');
  await Promise.all([environment, modules, cleanupOverrides, artifacts, dist, evidence].map(item => mkdir(item, { recursive: true })));
  const files: Record<string, string> = {
    'infrastructure/terraform/environments/cost_minimal/main.tf': 'resource "terraform_data" "gate" {}',
    'infrastructure/terraform/environments/cost_minimal/.terraform.lock.hcl': 'provider-lock',
    'infrastructure/terraform/modules/example/main.tf': 'variable "example" {}',
    'infrastructure/terraform/cleanup-overrides/reviewed.tf': 'resource "terraform_data" "cleanup" {}',
    'infrastructure/terraform/artifacts/minimal-images.tar': 'artifact',
    'app/frontend/dist/index.html': '<html>lab</html>',
  };
  for (const [relative, content] of Object.entries(files)) await writeFile(path.join(root, relative), content);
  const planName = operation === 'APPLY' ? 'clone-review.tfplan' : 'destroy-review.tfplan';
  const planRelative = `infrastructure/terraform/environments/cost_minimal/${planName}`;
  const planContent = `immutable-${operation}-plan`;
  await writeFile(path.join(root, planRelative), planContent);
  const retentionDecision = options.retentionDecision ?? (operation === 'DESTROY' ? 'DELETE_PROTECTED_VOLUMES' : undefined);
  const cleanupInventoryPath = operation === 'DESTROY' ? 'evidence/lifecycle/destroy-cleanup-inventory.json' : undefined;
  const cleanupInventory = JSON.stringify({ schemaVersion: 1, buckets: [], protectedVolumeDecision: retentionDecision });
  if (cleanupInventoryPath) await writeFile(path.join(root, cleanupInventoryPath), cleanupInventory);
  const exactArguments = ['apply', '-input=false', '-no-color', planName];
  const manifest: PlanManifest = {
    schemaVersion: 2,
    operation,
    generatedAt: options.generatedAt ?? fixedNow.toISOString(),
    deploymentIdentity: 'hanoi-lz-live-demo/cost_minimal',
    accountId: '123456789012',
    awsProfile: 'lab-profile',
    region: 'ap-southeast-1',
    terraformRoot: 'infrastructure/terraform/environments/cost_minimal',
    planPath: planRelative,
    planSha256: hash(planContent),
    configurationFiles: Object.fromEntries(Object.entries(files).map(([name, content]) => [name, hash(content)])),
    changes: { create: operation === 'APPLY' ? 48 : 0, update: 0, delete: operation === 'DESTROY' ? 48 : 0, addresses: [{ address: 'terraform_data.gate', actions: [operation === 'APPLY' ? 'create' : 'delete'] }] },
    exactExecutable: 'terraform',
    exactArguments,
    exactCommand: `terraform ${exactArguments.join(' ')}`,
    expectedEffects: 'fixture',
    retentionDecision,
    cleanupInventoryPath,
    cleanupInventorySha256: cleanupInventoryPath ? hash(cleanupInventory) : undefined,
  };
  await writeFile(path.join(evidence, operation === 'APPLY' ? 'active-apply-plan.json' : 'active-destroy-plan.json'), JSON.stringify(manifest));
  if (options.phase) {
    await writeFile(path.join(evidence, 'state.json'), JSON.stringify({
      schemaVersion: 1, phase: options.phase, deploymentIdentity: 'hanoi-lz-live-demo/cost_minimal', region: 'ap-southeast-1',
      updatedAt: fixedNow.toISOString(), reason: 'fixture', requiresReconciliation: ['APPLYING', 'BOOTSTRAPPING', 'VERIFYING', 'DESTROYING'].includes(options.phase),
    }));
  }
  return { root, manifest, evidence };
}

const phraseFor = (manifest: PlanManifest) => `APPROVE ${manifest.operation} ${manifest.planSha256.slice(0, 12)}`;
const successExecutor = (calls: unknown[] = []): MutationExecutor => ({
  run: async (context, sink) => { calls.push(context); sink.onStdout?.('fake stdout'); sink.onProgress?.('fake progress'); return { exitCode: 0, stdout: 'fake stdout', stderr: '' }; },
});

test('production executor command is fixed to terraform apply of the exact saved apply or destroy plan', () => {
  assert.deepEqual(savedPlanCommand('APPLY'), { executable: 'terraform', args: ['apply', '-input=false', '-no-color', 'clone-review.tfplan'], planName: 'clone-review.tfplan' });
  assert.deepEqual(savedPlanCommand('DESTROY'), { executable: 'terraform', args: ['apply', '-input=false', '-no-color', 'destroy-review.tfplan'], planName: 'destroy-review.tfplan' });
});

test('default state is NOT_DEPLOYED and a fresh apply manifest transitions only to PLAN_READY', async () => {
  const { root } = await fixture();
  const gate = new LifecycleGate(root, { clock });
  assert.equal(gate.publicState().phase, 'NOT_DEPLOYED');
  const status = await gate.synchronizePlans();
  assert.equal(status.apply.fresh, true);
  assert.equal(status.state.phase, 'PLAN_READY');
});

test('approval is bound to exact phrase, plan hash, account, profile, region and deployment identity', async () => {
  const { root, manifest } = await fixture();
  const gate = new LifecycleGate(root, { clock, identityVerifier: identity() });
  await assert.rejects(() => gate.approve({ operation: 'APPLY', planSha256: manifest.planSha256, phrase: 'yes' }), /CONFIRMATION_MISMATCH/);
  await assert.rejects(() => gate.approve({ operation: 'APPLY', planSha256: '0'.repeat(64), phrase: `APPROVE APPLY ${'0'.repeat(12)}` }), /PLAN_HASH_MISMATCH/);
  const approval = await gate.approve({ operation: 'APPLY', planSha256: manifest.planSha256, phrase: phraseFor(manifest) });
  assert.deepEqual([approval.accountId, approval.awsProfile, approval.region, approval.deploymentIdentity], ['123456789012', 'lab-profile', 'ap-southeast-1', 'hanoi-lz-live-demo/cost_minimal']);
  assert.equal(gate.publicState().phase, 'APPROVED');
});

test('wrong runtime account, profile, or region rejects approval', async () => {
  for (const mismatch of [{ accountId: '999999999999' }, { awsProfile: 'other' }, { region: 'us-east-1' }]) {
    const { root, manifest } = await fixture();
    const gate = new LifecycleGate(root, { clock, identityVerifier: identity(mismatch) });
    await assert.rejects(() => gate.approve({ operation: 'APPLY', planSha256: manifest.planSha256, phrase: phraseFor(manifest) }), /(ACCOUNT|PROFILE|REGION)_MISMATCH/);
  }
});

test('fake executor receives only the exact approved saved plan, streams events and approval is one-use', async () => {
  const { root, manifest } = await fixture();
  const calls: unknown[] = [];
  const events: string[] = [];
  const gate = new LifecycleGate(root, { clock, executor: successExecutor(calls), identityVerifier: identity() });
  const approval = await gate.approve({ operation: 'APPLY', planSha256: manifest.planSha256, phrase: phraseFor(manifest) });
  const result = await gate.execute(approval.id, { onStdout: value => events.push(value), onProgress: value => events.push(value) });
  assert.equal(result.exitCode, 0);
  assert.equal(calls.length, 1);
  assert.equal((calls[0] as { planAbsolutePath: string }).planAbsolutePath, path.join(root, manifest.planPath));
  assert.deepEqual(events, ['Validated plan hash ' + manifest.planSha256.slice(0, 12) + ', account ********9012, profile lab-profile, region ap-southeast-1.', 'fake stdout', 'fake progress']);
  assert.equal(result.state.phase, 'INFRA_DEPLOYED');
  await assert.rejects(() => gate.execute(approval.id), /ALREADY_USED/);
});

test('expired approval is rejected before execution', async () => {
  const { root, manifest } = await fixture();
  let current = new Date(fixedNow);
  const gate = new LifecycleGate(root, { clock: () => new Date(current), executor: successExecutor(), identityVerifier: identity(), approvalTtlMs: 1000 });
  const approval = await gate.approve({ operation: 'APPLY', planSha256: manifest.planSha256, phrase: phraseFor(manifest) });
  current = new Date(fixedNow.getTime() + 1001);
  await assert.rejects(() => gate.execute(approval.id), /APPROVAL_EXPIRED/);
  const renewed = await gate.approve({ operation: 'APPLY', planSha256: manifest.planSha256, phrase: phraseFor(manifest) });
  assert.notEqual(renewed.id, approval.id);
});

test('changed configuration or saved plan invalidates approval before execution', async () => {
  const { root, manifest } = await fixture();
  const gate = new LifecycleGate(root, { clock, executor: successExecutor(), identityVerifier: identity() });
  const approval = await gate.approve({ operation: 'APPLY', planSha256: manifest.planSha256, phrase: phraseFor(manifest) });
  await writeFile(path.join(root, 'infrastructure', 'terraform', 'modules', 'example', 'main.tf'), 'changed');
  await assert.rejects(() => gate.execute(approval.id), /PLAN_STALE/);
  assert.equal(gate.publicState().phase, 'FAILED');
});

test('saved plan outside the freshness window is stale', async () => {
  const { root } = await fixture('APPLY', { generatedAt: '2026-11-01T00:00:00.000Z' });
  const status = await new LifecycleGate(root, { clock }).planStatus('APPLY');
  assert.equal(status.fresh, false);
  assert.match(status.reasons.join(' '), /freshness window/);
});

test('destroy approval requires the exact protected-volume decision bound into the plan', async () => {
  const { root, manifest } = await fixture('DESTROY', { phase: 'READY', retentionDecision: 'DELETE_PROTECTED_VOLUMES' });
  const gate = new LifecycleGate(root, { clock });
  await assert.rejects(() => gate.approve({ operation: 'DESTROY', planSha256: manifest.planSha256, phrase: phraseFor(manifest) }), /RETENTION_DECISION_REQUIRED/);
  await assert.rejects(() => gate.approve({ operation: 'DESTROY', planSha256: manifest.planSha256, phrase: phraseFor(manifest), retentionDecision: 'RETAIN_PROTECTED_VOLUMES' }), /RETENTION_DECISION_MISMATCH/);
  const approval = await gate.approve({ operation: 'DESTROY', planSha256: manifest.planSha256, phrase: phraseFor(manifest), retentionDecision: 'DELETE_PROTECTED_VOLUMES' });
  assert.equal(approval.retentionDecision, 'DELETE_PROTECTED_VOLUMES');
});

test('changed cleanup inventory invalidates destroy approval before any executor call', async () => {
  const { root, manifest } = await fixture('DESTROY', { phase: 'READY', retentionDecision: 'DELETE_PROTECTED_VOLUMES' });
  let calls=0;const executor:MutationExecutor={run:async()=>{calls++;return{exitCode:0,stdout:'',stderr:''};}};
  const gate = new LifecycleGate(root, { clock, executor, identityVerifier: identity() });
  const approval = await gate.approve({ operation: 'DESTROY', planSha256: manifest.planSha256, phrase: phraseFor(manifest), retentionDecision: 'DELETE_PROTECTED_VOLUMES' });
  await writeFile(path.join(root, manifest.cleanupInventoryPath!), '{"changed":true}');
  await assert.rejects(() => gate.execute(approval.id), /PLAN_STALE/);
  assert.equal(calls,0);
});

test('production gate cannot execute mutations without both injected executor and identity verifier', async () => {
  const { root, manifest } = await fixture();
  const withoutExecutor = new LifecycleGate(root, { clock });
  const approval = await withoutExecutor.approve({ operation: 'APPLY', planSha256: manifest.planSha256, phrase: phraseFor(manifest) });
  await assert.rejects(() => withoutExecutor.execute(approval.id), /MUTATION_EXECUTION_DISABLED/);

  const second = await fixture();
  const withoutIdentity = new LifecycleGate(second.root, { clock, executor: successExecutor() });
  const secondApproval = await withoutIdentity.approve({ operation: 'APPLY', planSha256: second.manifest.planSha256, phrase: phraseFor(second.manifest) });
  await assert.rejects(() => withoutIdentity.execute(secondApproval.id), /runtime AWS identity verification/);
});

test('overlapping lifecycle mutations are rejected by the atomic global lifecycle lock', async () => {
  const { root, manifest } = await fixture();
  let release!: () => void;
  const blocked = new Promise<void>(resolve => { release = resolve; });
  const executor: MutationExecutor = { run: async () => { await blocked; return { exitCode: 0, stdout: '', stderr: '' }; } };
  const gate = new LifecycleGate(root, { clock, executor, identityVerifier: identity() });
  const first = await gate.approve({ operation: 'APPLY', planSha256: manifest.planSha256, phrase: phraseFor(manifest) });
  // A second approval cannot be created while state is APPROVED; reuse an injected copy is intentionally impossible.
  const running = gate.execute(first.id);
  for (let attempt = 0; attempt < 200 && !gate.locked; attempt++) await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(gate.locked, true);
  await assert.rejects(() => gate.execute(first.id), /LIFECYCLE_LOCKED/);
  release();
  await running;
});

test('failed apply records FAILED and reconciliation evidence', async () => {
  const { root, manifest } = await fixture();
  const executor: MutationExecutor = { run: async () => ({ exitCode: 1, stdout: 'partial', stderr: 'failed' }) };
  const gate = new LifecycleGate(root, { clock, executor, identityVerifier: identity() });
  const approval = await gate.approve({ operation: 'APPLY', planSha256: manifest.planSha256, phrase: phraseFor(manifest) });
  const result = await gate.execute(approval.id);
  assert.equal(result.state.phase, 'FAILED');
  assert.equal(result.state.requiresReconciliation, true);
  assert.match(await readFile(path.join(root, result.evidence), 'utf8'), /"status": "FAILED"/);
});

test('restart during execution or with a lost approval becomes FAILED conservatively', async () => {
  for (const phase of ['APPLYING', 'APPROVED'] as LifecyclePhase[]) {
    const { root } = await fixture('APPLY', { phase });
    const gate = new LifecycleGate(root, { clock });
    await gate.initialize();
    assert.equal(gate.publicState().phase, 'FAILED');
    assert.equal(gate.publicState().requiresReconciliation, true);
    assert.match(gate.publicState().reason, /restarted/);
  }
});

test('read-only reconciliation can recover a lost pre-execution approval without inferring READY', async () => {
  const { root } = await fixture('APPLY', { phase: 'APPROVED' });
  const gate = new LifecycleGate(root, { clock });
  await gate.initialize();
  assert.equal(gate.publicState().phase, 'FAILED');
  await gate.completeReconciliation({ outcome: 'NOT_DEPLOYED', reason: 'Zero active and managed resources.' });
  assert.equal(gate.publicState().phase, 'NOT_DEPLOYED');
  assert.equal((await gate.synchronizePlans()).state.phase, 'PLAN_READY');
});

test('partial bootstrap failure never transitions to READY', async () => {
  const { root } = await fixture('APPLY', { phase: 'INFRA_DEPLOYED' });
  const gate = new LifecycleGate(root, { clock });
  await gate.beginBootstrap();
  await gate.completeBootstrap(false, 'Hanoi secret is not initialized.');
  assert.equal(gate.publicState().phase, 'FAILED');
  assert.equal(gate.publicState().requiresReconciliation, true);
});

test('apply success alone is not READY; only bootstrap and Cases 1–3 verification can reach READY', async () => {
  const { root } = await fixture('APPLY', { phase: 'INFRA_DEPLOYED' });
  const gate = new LifecycleGate(root, { clock });
  assert.equal(gate.publicState().phase, 'NOT_DEPLOYED');
  await gate.initialize();
  assert.equal(gate.publicState().phase, 'INFRA_DEPLOYED');
  await gate.beginBootstrap();
  await gate.completeBootstrap(true, 'Native bootstrap is healthy.');
  assert.equal(gate.publicState().phase, 'VERIFYING');
  await gate.beginVerification();
  await gate.completeVerification(true, 'Cases 1–3 are healthy.', 'evidence/aws-cost-minimal-latest.json');
  assert.equal(gate.publicState().phase, 'READY');
  assert.equal(gate.publicState().verificationEvidence, 'evidence/aws-cost-minimal-latest.json');
});

test('failed destroy remains FAILED and cannot claim NOT_DEPLOYED', async () => {
  const { root, manifest } = await fixture('DESTROY', { phase: 'READY', retentionDecision: 'DELETE_PROTECTED_VOLUMES' });
  const executor: MutationExecutor = { run: async () => ({ exitCode: 1, stdout: '', stderr: 'bucket not empty' }) };
  const gate = new LifecycleGate(root, { clock, executor, identityVerifier: identity() });
  const approval = await gate.approve({ operation: 'DESTROY', planSha256: manifest.planSha256, phrase: phraseFor(manifest), retentionDecision: 'DELETE_PROTECTED_VOLUMES' });
  const result = await gate.execute(approval.id);
  assert.equal(result.state.phase, 'FAILED');
  assert.notEqual(result.state.phase, 'NOT_DEPLOYED');
});

test('residual audit alone decides whether destroyed infrastructure returns to NOT_DEPLOYED', async () => {
  const dirty = await fixture('APPLY', { phase: 'RESIDUAL_AUDIT' });
  const dirtyGate = new LifecycleGate(dirty.root, { clock });
  await dirtyGate.beginResidualAudit();
  await dirtyGate.completeResidualAudit({ clean: false, reason: 'One tagged EBS volume remains.' });
  assert.equal(dirtyGate.publicState().phase, 'FAILED');

  const clean = await fixture('APPLY', { phase: 'RESIDUAL_AUDIT' });
  const cleanGate = new LifecycleGate(clean.root, { clock });
  await cleanGate.beginResidualAudit();
  await cleanGate.completeResidualAudit({ clean: true, reason: 'Zero project EC2, EBS, EIP, active secrets and managed state resources remain.' });
  assert.equal(cleanGate.publicState().phase, 'NOT_DEPLOYED');
});
