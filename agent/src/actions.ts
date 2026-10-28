import path from 'node:path';

export type Risk = 'READ_ONLY' | 'TEST_WRITE' | 'BILLABLE' | 'DESTRUCTIVE';
export type EnvironmentId = 'LOCAL_EMULATION' | 'AWS_REAL_SINGAPORE' | 'AWS_REAL_HANOI' | 'AWS_REAL_HYBRID' | 'EXTERNAL_VN_REAL';
export type ScenarioId = 'CASE_1' | 'CASE_2' | 'CASE_3' | 'CASE_4' | 'CASE_5';
export type ActionParameters = { environment?: EnvironmentId; scenario?: ScenarioId; queryCount?: number; samples?: number; warmups?: number };
export type ProcessExecutor = { kind: 'process'; executable: string; args: (parameters: ActionParameters) => string[]; evidence?: string };
export type HttpExecutor = { kind: 'http'; operation: 'verify' | 'health' | 'topology' | 'orders.list' | 'orders.create' | 'benchmark' };
export type ActionDefinition = {
  id: string; label: string; description: string; scenarios: readonly ScenarioId[]; environments: readonly EnvironmentId[];
  risk: Risk; timeoutMs: number; exclusiveGroup?: string; retry: 'SAFE' | 'MANUAL_CONFIRMATION'; idempotency: string;
  preview: string; executor: ProcessExecutor | HttpExecutor; safeAutomatic?: boolean;
};

export const repoRoot = path.resolve(process.env.LAB_REPO_ROOT ?? path.join(import.meta.dirname, '..', '..'));
const powershell = process.env.LAB_POWERSHELL ?? (process.platform === 'win32' ? 'powershell.exe' : 'pwsh');
const presenter = path.join(repoRoot, 'scripts', 'emulation', 'presenter.ps1');
const localEnvironments = ['LOCAL_EMULATION'] as const;
const runtimeEnvironments = ['LOCAL_EMULATION', 'AWS_REAL_SINGAPORE', 'AWS_REAL_HANOI', 'AWS_REAL_HYBRID', 'EXTERNAL_VN_REAL'] as const;

function presenterArgs(scenario: string, withSamples = false) {
  return (parameters: ActionParameters) => {
    const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', presenter, '-Scenario', scenario];
    if (withSamples) args.push('-Samples', String(parameters.samples ?? 100), '-Warmups', String(parameters.warmups ?? 5));
    return args;
  };
}

export const actions: readonly ActionDefinition[] = [
  { id:'environment.verify', label:'Verify environment', description:'Calls the selected health and topology endpoints and validates their provenance.', scenarios:['CASE_1','CASE_2','CASE_3'], environments:runtimeEnvironments, risk:'READ_ONLY', timeoutMs:20_000, retry:'SAFE', idempotency:'Read-only; safe to repeat.', preview:'HTTP GET /health + /api/topology', executor:{kind:'http',operation:'verify'}, safeAutomatic:true },
  { id:'application.health', label:'Verify application and PostgreSQL', description:'Runs the API database-connected health probe.', scenarios:['CASE_1','CASE_2','CASE_3'], environments:runtimeEnvironments, risk:'READ_ONLY', timeoutMs:20_000, retry:'SAFE', idempotency:'Read-only; safe to repeat.', preview:'HTTP GET <selected-api>/health', executor:{kind:'http',operation:'health'}, safeAutomatic:true },
  { id:'topology.inspect', label:'Inspect deployment topology', description:'Reads runtime topology and provenance without inferring physical placement.', scenarios:['CASE_1','CASE_2','CASE_3'], environments:runtimeEnvironments, risk:'READ_ONLY', timeoutMs:20_000, retry:'SAFE', idempotency:'Read-only; safe to repeat.', preview:'HTTP GET <selected-api>/api/topology', executor:{kind:'http',operation:'topology'}, safeAutomatic:true },
  { id:'orders.list', label:'Read synthetic orders', description:'Lists actual order rows through the selected API.', scenarios:['CASE_1','CASE_2','CASE_3'], environments:runtimeEnvironments, risk:'READ_ONLY', timeoutMs:20_000, retry:'SAFE', idempotency:'Read-only; safe to repeat.', preview:'HTTP GET <selected-api>/api/orders', executor:{kind:'http',operation:'orders.list'}, safeAutomatic:true },
  { id:'orders.create', label:'Create synthetic order', description:'Creates one uniquely named DEMO-CONSOLE order and reads it back.', scenarios:['CASE_1','CASE_2','CASE_3'], environments:runtimeEnvironments, risk:'TEST_WRITE', timeoutMs:25_000, retry:'MANUAL_CONFIRMATION', idempotency:'Each confirmed retry creates a new uniquely identified synthetic row.', preview:'HTTP POST <selected-api>/api/orders; GET created record', executor:{kind:'http',operation:'orders.create'} },
  { id:'benchmark.run', label:'Run measured benchmark', description:'Separates warm-ups and measured requests and saves raw HTTP/DB evidence.', scenarios:['CASE_1','CASE_2','CASE_3'], environments:runtimeEnvironments, risk:'READ_ONLY', timeoutMs:900_000, exclusiveGroup:'benchmark', retry:'SAFE', idempotency:'Read-only SQL workload; each run writes separate evidence.', preview:'HTTP GET <selected-api>/api/benchmark/db?n={1|5|10|20}', executor:{kind:'http',operation:'benchmark'}, safeAutomatic:true },
  { id:'local.preflight', label:'Run local preflight', description:'Validates Compose services, API health, PostgreSQL rows and illustrative delays.', scenarios:['CASE_1','CASE_2','CASE_3','CASE_4','CASE_5'], environments:localEnvironments, risk:'READ_ONLY', timeoutMs:180_000, exclusiveGroup:'local-maintenance', retry:'SAFE', idempotency:'Read-only checks; safe to repeat.', preview:'PowerShell scripts/emulation/presenter.ps1 -Scenario Preflight', executor:{kind:'process',executable:powershell,args:presenterArgs('Preflight'),evidence:'evidence/preflight-latest.json'}, safeAutomatic:true },
  { id:'demo.preflight', label:'Demo Preflight', description:'Read-only AWS authentication, presenter CIDR, tagged inventory, placement, endpoint/database health, and local container diagnostics.', scenarios:['CASE_1','CASE_2','CASE_3','CASE_4','CASE_5'], environments:runtimeEnvironments, risk:'READ_ONLY', timeoutMs:180_000, exclusiveGroup:'preflight', retry:'SAFE', idempotency:'Read-only discovery; safe to repeat.', preview:'PowerShell scripts/preflight/live-demo.ps1 -Profile thangvn', executor:{kind:'process',executable:powershell,args:()=>['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(repoRoot,'scripts','preflight','live-demo.ps1'),'-Profile','thangvn'],evidence:'evidence/live-demo-preflight.json'}, safeAutomatic:true },
  { id:'local.case1', label:'Run Case 1 suite', description:'Runs the existing Singapore-shaped local benchmark workflow.', scenarios:['CASE_1'], environments:localEnvironments, risk:'READ_ONLY', timeoutMs:900_000, exclusiveGroup:'benchmark', retry:'SAFE', idempotency:'Read-only SQL workload; evidence is append-only plus latest pointer.', preview:'PowerShell presenter.ps1 -Scenario Case1 -Samples <1..300> -Warmups <0..50>', executor:{kind:'process',executable:powershell,args:presenterArgs('Case1',true),evidence:'evidence/benchmark-latest.json'} },
  { id:'local.case2', label:'Run Case 2 suite', description:'Runs the existing Hanoi-shaped local benchmark workflow.', scenarios:['CASE_2'], environments:localEnvironments, risk:'READ_ONLY', timeoutMs:900_000, exclusiveGroup:'benchmark', retry:'SAFE', idempotency:'Read-only SQL workload; evidence is append-only plus latest pointer.', preview:'PowerShell presenter.ps1 -Scenario Case2 -Samples <1..300> -Warmups <0..50>', executor:{kind:'process',executable:powershell,args:presenterArgs('Case2',true),evidence:'evidence/benchmark-latest.json'} },
  { id:'local.case3', label:'Run Case 3 suite', description:'Runs the existing hybrid shaped-database benchmark workflow.', scenarios:['CASE_3'], environments:localEnvironments, risk:'READ_ONLY', timeoutMs:900_000, exclusiveGroup:'benchmark', retry:'SAFE', idempotency:'Read-only SQL workload; evidence is append-only plus latest pointer.', preview:'PowerShell presenter.ps1 -Scenario Case3 -Samples <1..300> -Warmups <0..50>', executor:{kind:'process',executable:powershell,args:presenterArgs('Case3',true),evidence:'evidence/benchmark-latest.json'} },
  { id:'local.migration', label:'Run logical migration', description:'Runs guarded local pg_dump/pg_restore with count, checksum and cutover-write validation.', scenarios:['CASE_4'], environments:localEnvironments, risk:'TEST_WRITE', timeoutMs:600_000, exclusiveGroup:'database-mutation', retry:'MANUAL_CONFIRMATION', idempotency:'Requires confirmation; interrupted runs use documented recovery before retry.', preview:'PowerShell presenter.ps1 -Scenario Case4', executor:{kind:'process',executable:powershell,args:presenterArgs('Case4'),evidence:'evidence/local-emulation-migration.json'} },
  { id:'local.backup-restore', label:'Run logical backup and restore', description:'Creates a logical backup and restores only into the isolated local recovery database.', scenarios:['CASE_5'], environments:localEnvironments, risk:'TEST_WRITE', timeoutMs:600_000, exclusiveGroup:'database-mutation', retry:'MANUAL_CONFIRMATION', idempotency:'Requires confirmation; resets only the isolated recovery database.', preview:'PowerShell presenter.ps1 -Scenario Case5', executor:{kind:'process',executable:powershell,args:presenterArgs('Case5'),evidence:'evidence/local-emulation-backup-restore.json'} },
  { id:'aws.identity', label:'Verify AWS identity', description:'Read-only STS and Hanoi Local Zone diagnostics using profile thangvn; account identity is redacted.', scenarios:['CASE_1','CASE_2','CASE_3','CASE_4','CASE_5'], environments:['AWS_REAL_SINGAPORE','AWS_REAL_HANOI','AWS_REAL_HYBRID'], risk:'READ_ONLY', timeoutMs:60_000, retry:'SAFE', idempotency:'Read-only; safe to repeat.', preview:'PowerShell scripts/preflight/aws-readonly.ps1 -Profile thangvn (identity redacted)', executor:{kind:'process',executable:powershell,args:()=>['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(repoRoot,'scripts','preflight','aws-readonly.ps1'),'-Profile','thangvn']} },
  { id:'aws.hanoi-zone', label:'Verify Hanoi placement access', description:'Reads Local Zone opt-in and network-border-group metadata.', scenarios:['CASE_2','CASE_3','CASE_4','CASE_5'], environments:['AWS_REAL_HANOI','AWS_REAL_HYBRID'], risk:'READ_ONLY', timeoutMs:30_000, retry:'SAFE', idempotency:'Read-only; safe to repeat.', preview:'aws ec2 describe-availability-zones ... ap-southeast-1-han-1a', executor:{kind:'process',executable:'aws',args:()=>['ec2','describe-availability-zones','--profile','thangvn','--region','ap-southeast-1','--zone-names','ap-southeast-1-han-1a','--output','json']} },
] as const;

export function getAction(id: string) { return actions.find(action => action.id === id); }
export function publicAction(action: ActionDefinition) { return { id:action.id,label:action.label,description:action.description,scenarios:action.scenarios,environments:action.environments,risk:action.risk,timeoutMs:action.timeoutMs,retry:action.retry,idempotency:action.idempotency,preview:action.preview,safeAutomatic:action.safeAutomatic===true,cancellable:action.executor.kind==='process' }; }

export function validateParameters(action: ActionDefinition, value: unknown): ActionParameters {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Parameters must be a JSON object.');
  const input=value as Record<string,unknown>; const allowed=new Set(['environment','scenario','queryCount','samples','warmups']);
  for(const key of Object.keys(input))if(!allowed.has(key))throw new Error(`Unsupported parameter: ${key}`);
  const parameters=input as ActionParameters;
  if(!parameters.environment||!action.environments.includes(parameters.environment))throw new Error('Action is not allowed for this environment.');
  if(!parameters.scenario||!action.scenarios.includes(parameters.scenario))throw new Error('Action is not allowed for this scenario.');
  if(parameters.queryCount!==undefined&&![1,5,10,20].includes(parameters.queryCount))throw new Error('queryCount must be 1, 5, 10, or 20.');
  if(parameters.samples!==undefined&&(!Number.isInteger(parameters.samples)||parameters.samples<1||parameters.samples>300))throw new Error('samples must be an integer from 1 to 300.');
  if(parameters.warmups!==undefined&&(!Number.isInteger(parameters.warmups)||parameters.warmups<0||parameters.warmups>50))throw new Error('warmups must be an integer from 0 to 50.');
  return parameters;
}
