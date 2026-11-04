import { spawn } from 'node:child_process';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import type {
  ExecutionEventSink,
  MutationExecutionContext,
  MutationExecutionResult,
  MutationExecutor,
  PlanManifest,
  RuntimeIdentity,
  RuntimeIdentityVerifier,
} from './lifecycle.js';

type ProcessResult = { exitCode: number; stdout: string; stderr: string };

export function savedPlanCommand(operation: 'APPLY'|'DESTROY') {
  const planName = operation === 'APPLY' ? 'clone-review.tfplan' : 'destroy-review.tfplan';
  return { executable: 'terraform' as const, args: ['apply', '-input=false', '-no-color', planName], planName };
}

function runFixedProcess(executable: string, args: string[], cwd: string, sink: ExecutionEventSink = {}): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { cwd, shell: false, windowsHide: true, env: process.env });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', data => {
      const value = String(data);
      stdout += value;
      sink.onStdout?.(value);
    });
    child.stderr.on('data', data => {
      const value = String(data);
      stderr += value;
      sink.onStderr?.(value);
    });
    child.on('error', reject);
    child.on('close', code => resolve({ exitCode: code ?? 1, stdout, stderr }));
  });
}

export class AwsCliIdentityVerifier implements RuntimeIdentityVerifier {
  constructor(private readonly repoRoot: string) {}

  async verify(manifest: PlanManifest): Promise<RuntimeIdentity> {
    const args = [
      'sts', 'get-caller-identity', '--profile', manifest.awsProfile, '--region', manifest.region,
      '--output', 'json', '--no-cli-pager',
    ];
    const result = await runFixedProcess('aws', args, this.repoRoot);
    if (result.exitCode !== 0) throw new Error('AWS_IDENTITY_FAILED: aws sts get-caller-identity did not succeed for the reviewed profile.');
    let accountId = '';
    try { accountId = String((JSON.parse(result.stdout) as { Account?: string }).Account ?? ''); }
    catch { throw new Error('AWS_IDENTITY_FAILED: STS returned invalid JSON.'); }
    if (!/^\d{12}$/.test(accountId)) throw new Error('AWS_IDENTITY_FAILED: STS did not return a 12-digit account ID.');
    return { accountId, awsProfile: manifest.awsProfile, region: manifest.region };
  }
}

export class TerraformSavedPlanExecutor implements MutationExecutor {
  private readonly reviewedRoot: string;
  private readonly repoRoot: string;

  constructor(repoRoot: string) {
    this.repoRoot = path.resolve(repoRoot);
    this.reviewedRoot = path.resolve(this.repoRoot, 'infrastructure', 'terraform', 'environments', 'cost_minimal');
  }

  private async verifyDestroyInventory(context: MutationExecutionContext, sink: ExecutionEventSink) {
    const relative = context.manifest.cleanupInventoryPath;
    if (!relative || context.manifest.retentionDecision !== 'DELETE_PROTECTED_VOLUMES') throw new Error('DESTROY_INVENTORY_REJECTED: deletion decision and inventory are required.');
    const absolute = path.resolve(this.repoRoot, relative);
    if (!absolute.startsWith(path.join(this.repoRoot, 'evidence', 'lifecycle') + path.sep)) throw new Error('DESTROY_INVENTORY_REJECTED: cleanup inventory path escaped the fixed evidence directory.');
    type Inventory = { buckets?: Array<{ name?: string; versions?: Array<{ key: string; versionId: string; kind: 'VERSION'|'DELETE_MARKER' }> }> };
    let inventory: Inventory;
    try { inventory = JSON.parse(await readFile(absolute, 'utf8')) as Inventory; }
    catch { throw new Error('DESTROY_INVENTORY_REJECTED: cleanup inventory is unreadable.'); }
    for (const bucket of inventory.buckets ?? []) {
      if (!bucket.name || !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket.name)) throw new Error('DESTROY_INVENTORY_REJECTED: invalid bucket name.');
      const result = await runFixedProcess('aws', ['s3api', 'list-object-versions', '--bucket', bucket.name, '--profile', context.manifest.awsProfile,
        '--region', context.manifest.region, '--output', 'json', '--no-cli-pager'], this.reviewedRoot);
      if (result.exitCode !== 0) throw new Error('DESTROY_INVENTORY_REJECTED: current S3 version inventory could not be read.');
      const current = JSON.parse(result.stdout) as { Versions?: Array<{ Key?: string; VersionId?: string }>; DeleteMarkers?: Array<{ Key?: string; VersionId?: string }> };
      const normalize = (rows: Array<{ key: string; versionId: string; kind: string }>) => rows
        .map(row => `${row.kind}\t${row.key}\t${row.versionId}`).sort();
      const currentRows = [
        ...(current.Versions ?? []).map(item => ({ key: String(item.Key ?? ''), versionId: String(item.VersionId ?? ''), kind: 'VERSION' })),
        ...(current.DeleteMarkers ?? []).map(item => ({ key: String(item.Key ?? ''), versionId: String(item.VersionId ?? ''), kind: 'DELETE_MARKER' })),
      ];
      if (normalize(currentRows).join('\n') !== normalize(bucket.versions ?? []).join('\n')) throw new Error(`DESTROY_INVENTORY_STALE: versioned contents changed for reviewed bucket ${bucket.name}.`);
    }
    sink.onProgress?.('Revalidated exact S3 object versions and delete markers from the approved cleanup inventory.');
  }

  async run(context: MutationExecutionContext, sink: ExecutionEventSink): Promise<MutationExecutionResult> {
    if (path.resolve(context.terraformRootAbsolutePath) !== this.reviewedRoot) throw new Error('EXECUTOR_ROOT_REJECTED: Terraform root is not cost_minimal.');
    const command = savedPlanCommand(context.operation);
    const expectedPlanName = command.planName;
    const expectedPlan = path.join(this.reviewedRoot, expectedPlanName);
    if (path.resolve(context.planAbsolutePath) !== expectedPlan) throw new Error('EXECUTOR_PLAN_REJECTED: saved plan path is not fixed.');
    const args = command.args;
    if (context.manifest.exactExecutable !== 'terraform' || JSON.stringify(context.manifest.exactArguments) !== JSON.stringify(args)) {
      throw new Error('EXECUTOR_ARGUMENT_REJECTED: reviewed argument vector does not match the fixed executor.');
    }
    if (context.operation === 'DESTROY') await this.verifyDestroyInventory(context, sink);
    sink.onProgress?.(`Starting fixed executable terraform with reviewed saved plan ${expectedPlanName}; no automatic retry is configured.`);
    return runFixedProcess('terraform', args, this.reviewedRoot, sink);
  }
}

// This factory is intentionally not used by the default agent entrypoint. A separately authorized
// rehearsal must opt in by injecting both returned dependencies into buildServer().
export function createAuthorizedSavedPlanDependencies(repoRoot: string) {
  return {
    mutationExecutor: new TerraformSavedPlanExecutor(repoRoot),
    identityVerifier: new AwsCliIdentityVerifier(repoRoot),
  };
}
