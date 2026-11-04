import crypto from 'node:crypto';
import path from 'node:path';
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';

export type LifecycleOperation = 'APPLY' | 'DESTROY';
export type RetentionDecision = 'RETAIN_PROTECTED_VOLUMES' | 'DELETE_PROTECTED_VOLUMES';
export type LifecyclePhase =
  | 'NOT_DEPLOYED' | 'PLAN_READY' | 'APPROVED' | 'APPLYING' | 'INFRA_DEPLOYED'
  | 'BOOTSTRAPPING' | 'VERIFYING' | 'READY' | 'TEARDOWN_PLAN_READY'
  | 'DESTROY_APPROVED' | 'DESTROYING' | 'RESIDUAL_AUDIT' | 'FAILED';
export type PlanChange = { address: string; actions: string[] };
export type PlanManifest = {
  schemaVersion: 2;
  operation: LifecycleOperation;
  generatedAt: string;
  deploymentIdentity: string;
  accountId: string;
  awsProfile: string;
  region: string;
  terraformRoot: string;
  planPath: string;
  planSha256: string;
  configurationFiles: Record<string, string>;
  changes: { create: number; update: number; delete: number; addresses: PlanChange[] };
  exactExecutable: 'terraform';
  exactArguments: string[];
  exactCommand: string;
  expectedEffects: string;
  retentionDecision?: RetentionDecision;
  cleanupInventoryPath?: string;
  cleanupInventorySha256?: string;
};
export type PlanStatus = { manifest: PlanManifest | null; fresh: boolean; reasons: string[]; accountSuffix?: string; planHashPrefix?: string };
export type Approval = {
  id: string; operation: LifecycleOperation; planSha256: string; deploymentIdentity: string;
  accountId: string; awsProfile: string; region: string; retentionDecision?: RetentionDecision;
  approvedAt: string; expiresAt: string; usedAt?: string;
};
export type RuntimeIdentity = { accountId: string; awsProfile: string; region: string };
export type RuntimeIdentityVerifier = { verify(manifest: PlanManifest): Promise<RuntimeIdentity> };
export type ExecutionEventSink = { onStdout?(data: string): void; onStderr?(data: string): void; onProgress?(data: string): void };
export type MutationExecutionContext = {
  operation: LifecycleOperation; planAbsolutePath: string; terraformRootAbsolutePath: string;
  manifest: PlanManifest; approval: Approval;
};
export type MutationExecutionResult = { exitCode: number; stdout: string; stderr: string };
export type MutationExecutor = { run(context: MutationExecutionContext, sink: ExecutionEventSink): Promise<MutationExecutionResult> };
export type LifecycleState = {
  schemaVersion: 1; phase: LifecyclePhase; deploymentIdentity: string; region: string;
  accountSuffix?: string; planSha256?: string; operation?: LifecycleOperation; updatedAt: string;
  reason: string; requiresReconciliation: boolean; lastExecutionEvidence?: string; verificationEvidence?: string;
};
type LifecycleDependencies = {
  executor?: MutationExecutor; identityVerifier?: RuntimeIdentityVerifier; clock?: () => Date;
  stateFile?: string; approvalTtlMs?: number; planTtlMs?: number;
};

const DEPLOYMENT_IDENTITY = 'hanoi-lz-live-demo/cost_minimal';
const REGION = 'ap-southeast-1';
const TERRAFORM_ROOT = 'infrastructure/terraform/environments/cost_minimal';
const ACTIVE_PHASES = new Set<LifecyclePhase>(['APPLYING', 'BOOTSTRAPPING', 'VERIFYING', 'DESTROYING']);
const LOST_APPROVAL_PHASES = new Set<LifecyclePhase>(['APPROVED', 'DESTROY_APPROVED']);
const PROFILE_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;
const secretPattern = /(AWS_SECRET_ACCESS_KEY|AWS_ACCESS_KEY_ID|AWS_SESSION_TOKEN|authorization|password|secret|token)(["'=: ]+)([^\s,"']+)/gi;
const sanitize = (value: string) => value.replace(secretPattern, '$1$2[REDACTED]').replace(/\b\d{12}\b/g, '[ACCOUNT_REDACTED]').slice(0, 128_000);
const sha256 = (value: Buffer | string) => crypto.createHash('sha256').update(value).digest('hex');
const relativePortable = (root: string, item: string) => path.relative(root, item).replaceAll('\\', '/');

async function filesBelow(root: string): Promise<string[]> {
  const result: string[] = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const item = path.join(root, entry.name);
    if (entry.isDirectory()) result.push(...await filesBelow(item));
    else if (entry.isFile()) result.push(item);
  }
  return result;
}
async function atomicWriteJson(file: string, value: unknown) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(value, null, 2), { encoding: 'utf8', mode: 0o600 });
  await rename(temporary, file);
}

export class LifecycleGate {
  private approvals = new Map<string, Approval>();
  private activeOperation: string | null = null;
  private state: LifecycleState;
  private initialized = false;
  private readonly executor?: MutationExecutor;
  private readonly identityVerifier?: RuntimeIdentityVerifier;
  private readonly clock: () => Date;
  private readonly stateFile: string;
  private readonly approvalTtlMs: number;
  private readonly planTtlMs: number;

  constructor(private readonly repoRoot: string, dependencies: LifecycleDependencies = {}) {
    this.executor = dependencies.executor;
    this.identityVerifier = dependencies.identityVerifier;
    this.clock = dependencies.clock ?? (() => new Date());
    this.stateFile = dependencies.stateFile ?? path.join(repoRoot, 'evidence', 'lifecycle', 'state.json');
    this.approvalTtlMs = dependencies.approvalTtlMs ?? 15 * 60_000;
    this.planTtlMs = dependencies.planTtlMs ?? 24 * 60 * 60_000;
    this.state = this.defaultState();
  }

  private defaultState(): LifecycleState {
    return { schemaVersion: 1, phase: 'NOT_DEPLOYED', deploymentIdentity: DEPLOYMENT_IDENTITY, region: REGION,
      updatedAt: this.clock().toISOString(), reason: 'No current deployment has been reconciled by this agent.', requiresReconciliation: false };
  }
  async initialize() {
    if (this.initialized) return;
    this.initialized = true;
    try {
      const parsed = JSON.parse((await readFile(this.stateFile, 'utf8')).replace(/^\uFEFF/, '')) as LifecycleState;
      if (parsed.schemaVersion !== 1 || parsed.deploymentIdentity !== DEPLOYMENT_IDENTITY || parsed.region !== REGION) throw new Error('Lifecycle state identity is invalid.');
      this.state = parsed;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        this.state = { ...this.defaultState(), phase: 'FAILED', reason: error instanceof Error ? `Lifecycle state could not be trusted: ${error.message}` : 'Lifecycle state could not be trusted.', requiresReconciliation: true };
        await this.persistState();
      }
      return;
    }
    if (ACTIVE_PHASES.has(this.state.phase) || LOST_APPROVAL_PHASES.has(this.state.phase)) {
      const interruptedPhase = this.state.phase;
      await this.transition('FAILED', `Agent restarted while lifecycle phase was ${interruptedPhase}; independent reconciliation is required before retry.`, true);
    }
  }
  private async persistState() { await atomicWriteJson(this.stateFile, this.state); }
  private async transition(phase: LifecyclePhase, reason: string, requiresReconciliation: boolean, extra: Partial<LifecycleState> = {}) {
    this.state = { ...this.state, ...extra, schemaVersion: 1, phase, deploymentIdentity: DEPLOYMENT_IDENTITY, region: REGION,
      updatedAt: this.clock().toISOString(), reason, requiresReconciliation };
    await this.persistState();
  }
  private manifestPath(operation: LifecycleOperation) { return path.join(this.repoRoot, 'evidence', 'lifecycle', operation === 'APPLY' ? 'active-apply-plan.json' : 'active-destroy-plan.json'); }
  private expectedPlanName(operation: LifecycleOperation) { return operation === 'APPLY' ? 'clone-review.tfplan' : 'destroy-review.tfplan'; }
  private expectedArguments(operation: LifecycleOperation) { return ['apply', '-input=false', '-no-color', this.expectedPlanName(operation)]; }

  async planStatus(operation: LifecycleOperation): Promise<PlanStatus> {
    await this.initialize();
    let manifest: PlanManifest;
    try { manifest = JSON.parse((await readFile(this.manifestPath(operation), 'utf8')).replace(/^\uFEFF/, '')) as PlanManifest; }
    catch { return { manifest: null, fresh: false, reasons: ['No saved approval manifest exists.'] }; }
    const reasons: string[] = [];
    if (manifest.schemaVersion !== 2 || manifest.operation !== operation) reasons.push('Manifest schema or operation does not match.');
    if (manifest.deploymentIdentity !== DEPLOYMENT_IDENTITY) reasons.push('Deployment identity does not match cost_minimal.');
    if (manifest.region !== REGION) reasons.push('Region is outside the reviewed Singapore parent Region.');
    if (!PROFILE_PATTERN.test(manifest.awsProfile ?? '')) reasons.push('AWS profile name is missing or invalid.');
    if (manifest.terraformRoot !== TERRAFORM_ROOT) reasons.push('Terraform root is not the reviewed cost_minimal environment.');
    const generatedAt = Date.parse(manifest.generatedAt);
    const ageMs = this.clock().getTime() - generatedAt;
    if (!Number.isFinite(generatedAt) || ageMs < -5 * 60_000 || ageMs > this.planTtlMs) reasons.push('Saved plan is outside the accepted freshness window.');
    const terraformRootAbsolute = path.resolve(this.repoRoot, TERRAFORM_ROOT);
    const planAbsolute = path.resolve(this.repoRoot, manifest.planPath ?? '');
    const expectedPlanAbsolute = path.join(terraformRootAbsolute, this.expectedPlanName(operation));
    if (planAbsolute !== expectedPlanAbsolute) reasons.push('Plan path is not the fixed reviewed saved-plan path.');
    else try { if (sha256(await readFile(planAbsolute)) !== manifest.planSha256) reasons.push('Saved plan hash changed after manifest creation.'); }
    catch { reasons.push('Saved plan file is missing.'); }
    const expectedArguments = this.expectedArguments(operation);
    if (manifest.exactExecutable !== 'terraform' || JSON.stringify(manifest.exactArguments) !== JSON.stringify(expectedArguments)) reasons.push('Executable or argument vector differs from the reviewed fixed command.');
    if (manifest.exactCommand !== `terraform ${expectedArguments.join(' ')}`) reasons.push('Displayed exact command differs from the executable argument vector.');
    if (operation === 'DESTROY') {
      if (!manifest.retentionDecision) reasons.push('Destroy plan does not bind a protected-volume retention decision.');
      if (manifest.retentionDecision !== 'DELETE_PROTECTED_VOLUMES') reasons.push('A full destroy plan cannot claim retained Terraform-managed volumes were deleted.');
      const inventoryAbsolute = path.resolve(this.repoRoot, manifest.cleanupInventoryPath ?? '');
      const expectedInventoryDirectory = path.resolve(this.repoRoot, 'evidence', 'lifecycle') + path.sep;
      if (!inventoryAbsolute.startsWith(expectedInventoryDirectory)) reasons.push('Cleanup inventory path escaped the lifecycle evidence directory.');
      else try { if (sha256(await readFile(inventoryAbsolute)) !== manifest.cleanupInventorySha256) reasons.push('Cleanup inventory changed after destroy plan creation.'); }
      catch { reasons.push('Cleanup inventory file is missing.'); }
    }
    const configuredPaths = Object.keys(manifest.configurationFiles ?? {}).sort();
    if (!configuredPaths.length) reasons.push('Configuration fingerprint is empty.');
    try {
      const environment = path.join(this.repoRoot, TERRAFORM_ROOT);
      const currentAbsolute = [
        ...(await readdir(environment, { withFileTypes: true })).filter(item => item.isFile() && (item.name.endsWith('.tf') || item.name === '.terraform.lock.hcl')).map(item => path.join(environment, item.name)),
        ...await filesBelow(path.join(this.repoRoot, 'infrastructure', 'terraform', 'modules')),
        ...await filesBelow(path.join(this.repoRoot, 'infrastructure', 'terraform', 'cleanup-overrides')),
        path.join(this.repoRoot, 'infrastructure', 'terraform', 'artifacts', 'minimal-images.tar'),
        ...await filesBelow(path.join(this.repoRoot, 'app', 'frontend', 'dist')),
      ];
      const currentPaths = currentAbsolute.map(item => relativePortable(this.repoRoot, item)).sort();
      if (currentPaths.join('\n') !== configuredPaths.join('\n')) reasons.push('Configuration file set changed after plan creation.');
    } catch { reasons.push('Configuration file set could not be enumerated.'); }
    for (const relative of configuredPaths) {
      const absolute = path.resolve(this.repoRoot, relative);
      if (!absolute.startsWith(path.resolve(this.repoRoot) + path.sep)) { reasons.push(`Configuration path escaped repository: ${relative}`); continue; }
      try { if (sha256(await readFile(absolute)) !== manifest.configurationFiles[relative]) reasons.push(`Configuration changed: ${relative}`); }
      catch { reasons.push(`Configuration file is missing: ${relative}`); }
    }
    return { manifest, fresh: reasons.length === 0, reasons, accountSuffix: manifest.accountId?.slice(-4), planHashPrefix: manifest.planSha256?.slice(0, 12) };
  }

  async synchronizePlans() {
    await this.initialize();
    const [apply, destroy] = await Promise.all([this.planStatus('APPLY'), this.planStatus('DESTROY')]);
    if (['NOT_DEPLOYED', 'PLAN_READY'].includes(this.state.phase)) {
      if (apply.fresh && apply.manifest) await this.transition('PLAN_READY', 'A fresh immutable apply plan is ready for explicit approval.', false,
        { operation: 'APPLY', planSha256: apply.manifest.planSha256, accountSuffix: apply.manifest.accountId.slice(-4) });
      else if (this.state.phase === 'PLAN_READY') await this.transition('NOT_DEPLOYED', 'The prior apply plan is no longer fresh; generate and review a new saved plan.', false,
        { operation: undefined, planSha256: undefined });
    }
    if (['READY', 'TEARDOWN_PLAN_READY'].includes(this.state.phase)) {
      if (destroy.fresh && destroy.manifest) await this.transition('TEARDOWN_PLAN_READY', 'A fresh destroy plan is ready for retention review and explicit approval.', false,
        { operation: 'DESTROY', planSha256: destroy.manifest.planSha256, accountSuffix: destroy.manifest.accountId.slice(-4) });
      else if (this.state.phase === 'TEARDOWN_PLAN_READY') await this.transition('READY', 'Destroy plan is no longer fresh; the verified deployment remains READY.', false,
        { operation: undefined, planSha256: undefined });
    }
    return { apply, destroy, state: this.publicState() };
  }
  private async assertRuntimeIdentity(manifest: PlanManifest) {
    if (!this.identityVerifier) throw new Error('IDENTITY_VERIFICATION_DISABLED: no runtime AWS identity verifier is installed.');
    const identity = await this.identityVerifier.verify(manifest);
    if (identity.accountId !== manifest.accountId) throw new Error('ACCOUNT_MISMATCH: current AWS account differs from the reviewed plan.');
    if (identity.awsProfile !== manifest.awsProfile) throw new Error('PROFILE_MISMATCH: current AWS profile differs from the reviewed plan.');
    if (identity.region !== manifest.region) throw new Error('REGION_MISMATCH: current AWS Region differs from the reviewed plan.');
  }
  async approve(input: { operation: LifecycleOperation; planSha256: string; phrase: string; retentionDecision?: RetentionDecision }) {
    const synchronized = await this.synchronizePlans();
    const status = input.operation === 'APPLY' ? synchronized.apply : synchronized.destroy;
    if (!status.manifest || !status.fresh) throw new Error(`PLAN_STALE: ${status.reasons.join(' ')}`);
    const approvalPhase = input.operation === 'APPLY' ? 'APPROVED' : 'DESTROY_APPROVED';
    if (this.state.phase === approvalPhase) {
      const activeApproval = [...this.approvals.values()].some(item => item.operation === input.operation && !item.usedAt && this.clock().getTime() < Date.parse(item.expiresAt));
      if (activeApproval) throw new Error('APPROVAL_ALREADY_ACTIVE: wait for expiry or use the existing one-time approval.');
      await this.transition(input.operation === 'APPLY' ? 'PLAN_READY' : 'TEARDOWN_PLAN_READY', 'The prior approval expired or was consumed before execution; the still-fresh saved plan requires a new explicit approval.', false);
    }
    if (input.operation === 'APPLY' && this.state.phase !== 'PLAN_READY') throw new Error(`STATE_MISMATCH: apply approval is not allowed from ${this.state.phase}.`);
    if (input.operation === 'DESTROY' && this.state.phase !== 'TEARDOWN_PLAN_READY') throw new Error(`STATE_MISMATCH: destroy approval is not allowed from ${this.state.phase}.`);
    if (status.manifest.planSha256 !== input.planSha256) throw new Error('PLAN_HASH_MISMATCH: approval is not bound to the active saved plan.');
    const expected = `APPROVE ${input.operation} ${status.manifest.planSha256.slice(0, 12)}`;
    if (input.phrase !== expected) throw new Error(`CONFIRMATION_MISMATCH: enter exactly ${expected}`);
    if (input.operation === 'DESTROY') {
      if (!input.retentionDecision) throw new Error('RETENTION_DECISION_REQUIRED: choose whether protected PostgreSQL volumes are retained or deleted.');
      if (status.manifest.retentionDecision !== input.retentionDecision) throw new Error('RETENTION_DECISION_MISMATCH: the approval decision differs from the saved destroy plan.');
    }
    if (this.identityVerifier) await this.assertRuntimeIdentity(status.manifest);
    const approvedAt = this.clock();
    const approval: Approval = { id: crypto.randomUUID(), operation: input.operation, planSha256: status.manifest.planSha256,
      deploymentIdentity: status.manifest.deploymentIdentity, accountId: status.manifest.accountId, awsProfile: status.manifest.awsProfile,
      region: status.manifest.region, retentionDecision: input.retentionDecision, approvedAt: approvedAt.toISOString(),
      expiresAt: new Date(approvedAt.getTime() + this.approvalTtlMs).toISOString() };
    this.approvals.set(approval.id, approval);
    await this.transition(input.operation === 'APPLY' ? 'APPROVED' : 'DESTROY_APPROVED', `${input.operation} approval is bound to one exact saved plan and expires at ${approval.expiresAt}.`, false,
      { operation: input.operation, planSha256: approval.planSha256, accountSuffix: approval.accountId.slice(-4) });
    return approval;
  }
  describeApproval(approvalId: string) { const approval = this.approvals.get(approvalId); return approval ? this.publicApproval(approval) : null; }
  private async writeExecutionEvidence(approval: Approval, manifest: PlanManifest, startedAt: string, result: MutationExecutionResult | null, error?: string) {
    const completedAt = this.clock().toISOString();
    const relative = `evidence/lifecycle/execution-${approval.operation.toLowerCase()}-${approval.id}.json`;
    await atomicWriteJson(path.join(this.repoRoot, relative), {
      schemaVersion: 1, operation: approval.operation, status: result?.exitCode === 0 && !error ? 'SUCCEEDED' : 'FAILED', startedAt, completedAt,
      durationMs: Date.parse(completedAt) - Date.parse(startedAt), deploymentIdentity: manifest.deploymentIdentity,
      accountSuffix: manifest.accountId.slice(-4), awsProfile: manifest.awsProfile, region: manifest.region, planPath: manifest.planPath,
      planSha256: manifest.planSha256, exactExecutable: manifest.exactExecutable, exactArguments: manifest.exactArguments,
      retentionDecision: approval.retentionDecision, cleanupInventoryPath: manifest.cleanupInventoryPath,
      cleanupInventorySha256: manifest.cleanupInventorySha256, exitCode: result?.exitCode ?? null, stdout: sanitize(result?.stdout ?? ''),
      stderr: sanitize(result?.stderr ?? error ?? ''), validation: approval.operation === 'APPLY'
        ? 'Apply success means infrastructure exists; bootstrap and Cases 1–3 verification are still required before READY.'
        : 'Destroy success requires an independent residual audit before NOT_DEPLOYED is restored.',
    });
    return relative;
  }
  async execute(approvalId: string, sink: ExecutionEventSink = {}) {
    await this.initialize();
    if (!this.executor) throw new Error('MUTATION_EXECUTION_DISABLED: no real apply/destroy executor is installed.');
    if (!this.identityVerifier) throw new Error('MUTATION_EXECUTION_DISABLED: runtime AWS identity verification is mandatory.');
    if (this.activeOperation) throw new Error(`LIFECYCLE_LOCKED: ${this.activeOperation} is already running.`);
    const approval = this.approvals.get(approvalId);
    if (!approval) throw new Error('APPROVAL_NOT_FOUND.');
    if (approval.usedAt) throw new Error('APPROVAL_ALREADY_USED.');
    if (this.clock().getTime() >= Date.parse(approval.expiresAt)) throw new Error('APPROVAL_EXPIRED.');
    this.activeOperation = `${approval.operation}:${approval.id}`;
    approval.usedAt = this.clock().toISOString();
    const startedAt = this.clock().toISOString();
    let manifest: PlanManifest | null = null;
    try {
      const status = await this.planStatus(approval.operation);
      if (!status.manifest || !status.fresh || status.manifest.planSha256 !== approval.planSha256 || status.manifest.accountId !== approval.accountId
        || status.manifest.awsProfile !== approval.awsProfile || status.manifest.region !== approval.region || status.manifest.deploymentIdentity !== approval.deploymentIdentity) {
        throw new Error('PLAN_STALE: plan, configuration, account, profile, region or deployment identity changed after approval.');
      }
      manifest = status.manifest;
      await this.assertRuntimeIdentity(manifest);
      const expectedPhase = approval.operation === 'APPLY' ? 'APPROVED' : 'DESTROY_APPROVED';
      if (this.state.phase !== expectedPhase) throw new Error(`STATE_MISMATCH: ${approval.operation} execution is not allowed from ${this.state.phase}.`);
      await this.transition(approval.operation === 'APPLY' ? 'APPLYING' : 'DESTROYING', `Executing the one-time approved ${approval.operation} saved plan.`, true);
      sink.onProgress?.(`Validated plan hash ${manifest.planSha256.slice(0, 12)}, account ********${manifest.accountId.slice(-4)}, profile ${manifest.awsProfile}, region ${manifest.region}.`);
      const result = await this.executor.run({ operation: approval.operation, planAbsolutePath: path.resolve(this.repoRoot, manifest.planPath),
        terraformRootAbsolutePath: path.resolve(this.repoRoot, manifest.terraformRoot), manifest, approval }, sink);
      const evidence = await this.writeExecutionEvidence(approval, manifest, startedAt, result);
      if (result.exitCode !== 0) await this.transition('FAILED', `${approval.operation} exited with code ${result.exitCode}; reconcile actual AWS and Terraform state before retry.`, true, { lastExecutionEvidence: evidence });
      else if (approval.operation === 'APPLY') await this.transition('INFRA_DEPLOYED', 'Terraform apply completed. Bootstrap readiness and Cases 1–3 verification are still required.', true, { lastExecutionEvidence: evidence });
      else await this.transition('RESIDUAL_AUDIT', 'Terraform destroy completed. Independent tagged-resource and state residual audit is required.', true, { lastExecutionEvidence: evidence });
      return { ...result, evidence, state: this.publicState() };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Lifecycle execution failed.';
      const fallbackManifest = manifest ?? (await this.planStatus(approval.operation)).manifest;
      let evidence: string | undefined;
      if (fallbackManifest) evidence = await this.writeExecutionEvidence(approval, fallbackManifest, startedAt, null, message);
      await this.transition('FAILED', `${message} Independent reconciliation is required before retry.`, true, evidence ? { lastExecutionEvidence: evidence } : {});
      throw error;
    } finally { this.activeOperation = null; }
  }
  async beginBootstrap() {
    await this.initialize();
    if (!['INFRA_DEPLOYED', 'FAILED'].includes(this.state.phase)) throw new Error(`STATE_MISMATCH: bootstrap readiness cannot start from ${this.state.phase}.`);
    await this.transition('BOOTSTRAPPING', 'Checking native EC2 bootstrap and SSM/application readiness using dynamic Terraform outputs.', true);
  }
  async completeReconciliation(input: { outcome: 'NOT_DEPLOYED'|'INFRA_DEPLOYED'|'FAILED'; reason: string; evidence?: string }) {
    await this.initialize();
    if (this.state.phase !== 'FAILED') throw new Error(`STATE_MISMATCH: reconciliation cannot complete from ${this.state.phase}.`);
    await this.transition(input.outcome, input.reason, input.outcome !== 'NOT_DEPLOYED', {
      operation: undefined,
      planSha256: undefined,
      ...(input.evidence ? { lastExecutionEvidence: input.evidence } : {}),
    });
  }
  async completeBootstrap(success: boolean, reason: string) {
    if (this.state.phase !== 'BOOTSTRAPPING') throw new Error(`STATE_MISMATCH: bootstrap completion cannot run from ${this.state.phase}.`);
    await this.transition(success ? 'VERIFYING' : 'FAILED', reason, !success);
  }
  async beginVerification() {
    await this.initialize();
    if (this.state.phase !== 'VERIFYING') throw new Error(`STATE_MISMATCH: Cases 1–3 verification cannot start from ${this.state.phase}.`);
    await this.transition('VERIFYING', 'Validating infrastructure and all three live application/database paths.', true);
  }
  async completeVerification(success: boolean, reason: string, evidence?: string) {
    if (this.state.phase !== 'VERIFYING') throw new Error(`STATE_MISMATCH: verification completion cannot run from ${this.state.phase}.`);
    await this.transition(success ? 'READY' : 'FAILED', reason, !success, evidence ? { verificationEvidence: evidence } : {});
  }
  async beginResidualAudit() {
    await this.initialize();
    if (!['RESIDUAL_AUDIT', 'FAILED'].includes(this.state.phase)) throw new Error(`STATE_MISMATCH: residual audit cannot start from ${this.state.phase}.`);
    await this.transition('RESIDUAL_AUDIT', 'Running independent read-only residual inventory.', true);
  }
  async completeResidualAudit(input: { clean: boolean; reason: string; evidence?: string }) {
    if (this.state.phase !== 'RESIDUAL_AUDIT') throw new Error(`STATE_MISMATCH: residual audit completion cannot run from ${this.state.phase}.`);
    await this.transition(input.clean ? 'NOT_DEPLOYED' : 'FAILED', input.reason, !input.clean,
      { operation: undefined, planSha256: undefined, verificationEvidence: undefined, ...(input.evidence ? { lastExecutionEvidence: input.evidence } : {}) });
  }
  publicApproval(approval: Approval) {
    return { id: approval.id, operation: approval.operation, planSha256: approval.planSha256, deploymentIdentity: approval.deploymentIdentity,
      accountSuffix: approval.accountId.slice(-4), awsProfile: approval.awsProfile, region: approval.region,
      retentionDecision: approval.retentionDecision, approvedAt: approval.approvedAt, expiresAt: approval.expiresAt, usedAt: approval.usedAt };
  }
  publicState() { return { ...this.state }; }
  get locked() { return this.activeOperation !== null; }
}
