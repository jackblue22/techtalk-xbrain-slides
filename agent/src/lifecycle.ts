import crypto from 'node:crypto';
import path from 'node:path';
import { readFile, readdir } from 'node:fs/promises';

export type LifecycleOperation = 'APPLY' | 'DESTROY';
export type RetentionDecision = 'RETAIN_PROTECTED_VOLUMES' | 'DELETE_PROTECTED_VOLUMES';
export type PlanChange = { address: string; actions: string[] };
export type PlanManifest = {
  schemaVersion: 1;
  operation: LifecycleOperation;
  generatedAt: string;
  deploymentIdentity: string;
  accountId: string;
  region: string;
  planPath: string;
  planSha256: string;
  configurationFiles: Record<string,string>;
  changes: { create:number; update:number; delete:number; addresses:PlanChange[] };
  exactCommand: string;
  expectedEffects: string;
};
export type PlanStatus = { manifest:PlanManifest|null; fresh:boolean; reasons:string[]; accountSuffix?:string; planHashPrefix?:string };
export type Approval = { id:string; operation:LifecycleOperation; planSha256:string; deploymentIdentity:string; accountId:string; region:string; retentionDecision?:RetentionDecision; approvedAt:string; expiresAt:string; usedAt?:string };
export type MutationExecutor = { run(operation:LifecycleOperation,planAbsolutePath:string):Promise<{exitCode:number;stdout:string;stderr:string}> };

const sha256=(value:Buffer)=>crypto.createHash('sha256').update(value).digest('hex');
async function filesBelow(root:string){const result:string[]=[];for(const entry of await readdir(root,{withFileTypes:true})){const item=path.join(root,entry.name);if(entry.isDirectory())result.push(...await filesBelow(item));else if(entry.isFile())result.push(item);}return result;}

export class LifecycleGate {
  private approvals=new Map<string,Approval>();
  private activeOperation:string|null=null;
  constructor(private readonly repoRoot:string,private readonly executor?:MutationExecutor,private readonly clock:()=>Date=()=>new Date()){}

  private manifestPath(operation:LifecycleOperation){return path.join(this.repoRoot,'evidence','lifecycle',operation==='APPLY'?'active-apply-plan.json':'active-destroy-plan.json');}
  async planStatus(operation:LifecycleOperation):Promise<PlanStatus>{
    let manifest:PlanManifest;
    try{manifest=JSON.parse((await readFile(this.manifestPath(operation),'utf8')).replace(/^\uFEFF/,'')) as PlanManifest;}catch{return{manifest:null,fresh:false,reasons:['No saved approval manifest exists.']};}
    const reasons:string[]=[];
    if(manifest.schemaVersion!==1||manifest.operation!==operation)reasons.push('Manifest schema or operation does not match.');
    if(manifest.deploymentIdentity!=='hanoi-lz-live-demo/cost_minimal')reasons.push('Deployment identity does not match cost_minimal.');
    if(manifest.region!=='ap-southeast-1')reasons.push('Region is outside the reviewed Singapore parent Region.');
    const planAbsolute=path.resolve(this.repoRoot,manifest.planPath);
    const allowedDirectory=path.resolve(this.repoRoot,'infrastructure','terraform','environments','cost_minimal')+path.sep;
    if(!planAbsolute.startsWith(allowedDirectory))reasons.push('Plan path escaped the cost_minimal environment.');
    else try{if(sha256(await readFile(planAbsolute))!==manifest.planSha256)reasons.push('Saved plan hash changed after manifest creation.');}catch{reasons.push('Saved plan file is missing.');}
    const configuredPaths=Object.keys(manifest.configurationFiles).sort();
    if(!configuredPaths.length)reasons.push('Configuration fingerprint is empty.');
    try{
      const environment=path.join(this.repoRoot,'infrastructure','terraform','environments','cost_minimal');
      const currentAbsolute=[
        ...(await readdir(environment,{withFileTypes:true})).filter(item=>item.isFile()&&(item.name.endsWith('.tf')||item.name==='.terraform.lock.hcl')).map(item=>path.join(environment,item.name)),
        ...await filesBelow(path.join(this.repoRoot,'infrastructure','terraform','modules')),
        path.join(this.repoRoot,'infrastructure','terraform','artifacts','minimal-images.tar'),
        ...await filesBelow(path.join(this.repoRoot,'app','frontend','dist')),
      ];
      const currentPaths=currentAbsolute.map(item=>path.relative(this.repoRoot,item).replaceAll('\\','/')).sort();
      if(currentPaths.join('\n')!==configuredPaths.join('\n'))reasons.push('Configuration file set changed after plan creation.');
    }catch{reasons.push('Configuration file set could not be enumerated.');}
    for(const relative of configuredPaths){
      const absolute=path.resolve(this.repoRoot,relative);
      if(!absolute.startsWith(path.resolve(this.repoRoot)+path.sep)){reasons.push(`Configuration path escaped repository: ${relative}`);continue;}
      try{if(sha256(await readFile(absolute))!==manifest.configurationFiles[relative])reasons.push(`Configuration changed: ${relative}`);}catch{reasons.push(`Configuration file is missing: ${relative}`);}
    }
    return{manifest,fresh:reasons.length===0,reasons,accountSuffix:manifest.accountId.slice(-4),planHashPrefix:manifest.planSha256.slice(0,12)};
  }

  async approve(input:{operation:LifecycleOperation;planSha256:string;phrase:string;retentionDecision?:RetentionDecision}){
    const status=await this.planStatus(input.operation);
    if(!status.manifest||!status.fresh)throw new Error(`PLAN_STALE: ${status.reasons.join(' ')}`);
    if(status.manifest.planSha256!==input.planSha256)throw new Error('PLAN_HASH_MISMATCH: approval is not bound to the active saved plan.');
    const expected=`APPROVE ${input.operation} ${status.manifest.planSha256.slice(0,12)}`;
    if(input.phrase!==expected)throw new Error(`CONFIRMATION_MISMATCH: enter exactly ${expected}`);
    if(input.operation==='DESTROY'&&!input.retentionDecision)throw new Error('RETENTION_DECISION_REQUIRED: choose whether protected PostgreSQL volumes are retained or deleted.');
    const approvedAt=this.clock();const expiresAt=new Date(approvedAt.getTime()+15*60_000);
    const approval:Approval={id:crypto.randomUUID(),operation:input.operation,planSha256:status.manifest.planSha256,deploymentIdentity:status.manifest.deploymentIdentity,accountId:status.manifest.accountId,region:status.manifest.region,retentionDecision:input.retentionDecision,approvedAt:approvedAt.toISOString(),expiresAt:expiresAt.toISOString()};
    this.approvals.set(approval.id,approval);return approval;
  }

  async execute(approvalId:string){
    if(!this.executor)throw new Error('MUTATION_EXECUTION_DISABLED: no real apply/destroy executor is installed.');
    if(this.activeOperation)throw new Error(`LIFECYCLE_LOCKED: ${this.activeOperation} is already running.`);
    const approval=this.approvals.get(approvalId);if(!approval)throw new Error('APPROVAL_NOT_FOUND.');
    if(approval.usedAt)throw new Error('APPROVAL_ALREADY_USED.');
    if(this.clock().getTime()>=Date.parse(approval.expiresAt))throw new Error('APPROVAL_EXPIRED.');
    const status=await this.planStatus(approval.operation);
    if(!status.manifest||!status.fresh||status.manifest.planSha256!==approval.planSha256||status.manifest.accountId!==approval.accountId||status.manifest.region!==approval.region||status.manifest.deploymentIdentity!==approval.deploymentIdentity)throw new Error('PLAN_STALE: plan, configuration, account, region or deployment identity changed after approval.');
    const planAbsolute=path.resolve(this.repoRoot,status.manifest.planPath);
    approval.usedAt=this.clock().toISOString();this.activeOperation=`${approval.operation}:${approval.id}`;
    try{return await this.executor.run(approval.operation,planAbsolute);}finally{this.activeOperation=null;}
  }

  publicApproval(approval:Approval){return{id:approval.id,operation:approval.operation,planSha256:approval.planSha256,deploymentIdentity:approval.deploymentIdentity,accountSuffix:approval.accountId.slice(-4),region:approval.region,retentionDecision:approval.retentionDecision,approvedAt:approval.approvedAt,expiresAt:approval.expiresAt,usedAt:approval.usedAt};}
  get locked(){return this.activeOperation!==null;}
}
