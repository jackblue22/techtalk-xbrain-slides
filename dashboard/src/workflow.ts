export type EnvironmentId =
  | "LOCAL_EMULATION"
  | "AWS_REAL_SINGAPORE"
  | "AWS_REAL_HANOI"
  | "AWS_REAL_HYBRID"
  | "EXTERNAL_VN_REAL";
export type ScenarioId = "CASE_1" | "CASE_2" | "CASE_3" | "CASE_4" | "CASE_5";
export type Risk = "READ_ONLY" | "TEST_WRITE" | "BILLABLE" | "DESTRUCTIVE";
export type Step = {
  id: string;
  label: string;
  detail: string;
  actionId?: string;
  risk: Risk;
  repeatable?: boolean;
  blockedReason?: string;
};
export type Scenario = {
  id: ScenarioId;
  number: number;
  title: string;
  subtitle: string;
  recommendedEnvironment: EnvironmentId;
  steps: Step[];
};
export type LifecycleControl = {
  id: string;
  label: string;
  detail: string;
  risk: Risk;
  actionId?: string;
  blockedReason?: string;
};

export const lifecycleControls: LifecycleControl[] = [
  {
    id: "lab-status",
    label: "Check Lab Status",
    detail:
      "Discover authentication, current presenter CIDR, tagged EC2/EBS placement, API/database health and local containers.",
    risk: "READ_ONLY",
    actionId: "demo.preflight",
  },
  {
    id: "lab-plan",
    label: "Create Review Plan",
    detail:
      "Run account-gated Terraform init, validate and plan using a verified presenter /32.",
    risk: "READ_ONLY",
    actionId: "aws.plan",
  },
  {
    id: "lab-plan-review",
    label: "Review Saved Plan",
    detail:
      "Render the exact clone-review.tfplan; no apply operation exists in the agent.",
    risk: "READ_ONLY",
    actionId: "aws.plan-review",
  },
  {
    id: "lab-deploy",
    label: "Deploy",
    detail: "Terraform apply would create billable AWS resources.",
    risk: "BILLABLE",
    blockedReason: "REQUIRES_SEPARATE_APPROVAL — no apply executor is enabled.",
  },
  {
    id: "lab-bootstrap",
    label: "Bootstrap",
    detail:
      "EC2 user-data and SSM readiness are part of deployment verification.",
    risk: "BILLABLE",
    blockedReason:
      "NOT_DEPLOYED — bootstrap cannot run before an approved apply.",
  },
  {
    id: "lab-verify",
    label: "Verify AWS Workload",
    detail:
      "Requires deployed instances and healthy endpoints; verification creates labelled synthetic rows.",
    risk: "TEST_WRITE",
    actionId: "aws.verify-cost-minimal",
  },
  {
    id: "lab-benchmark",
    label: "Run All AWS Benchmarks",
    detail: "Requires freshly verified AWS endpoints.",
    risk: "READ_ONLY",
    actionId: "aws.benchmark-all",
  },
  {
    id: "lab-cleanup-preview",
    label: "Review Cleanup",
    detail:
      "Read-only inventory of tagged EC2, EBS, Elastic IPs and related secrets.",
    risk: "READ_ONLY",
    actionId: "aws.cleanup-preview",
  },
  {
    id: "lab-destroy",
    label: "Destroy",
    detail:
      "Terraform destroy is destructive and retention safeguards must be reviewed.",
    risk: "DESTRUCTIVE",
    blockedReason:
      "REQUIRES_SEPARATE_APPROVAL — no destroy executor is enabled.",
  },
  {
    id: "lab-residuals",
    label: "Verify Residuals",
    detail:
      "Repeat the read-only tagged inventory after an authorized cleanup.",
    risk: "READ_ONLY",
    actionId: "aws.cleanup-preview",
  },
  {
    id: "lab-export",
    label: "Export Evidence",
    detail:
      "Download the currently selected live or previously verified evidence with its provenance.",
    risk: "READ_ONLY",
  },
];

const read = (
  id: string,
  label: string,
  detail: string,
  actionId?: string,
): Step => ({
  id,
  label,
  detail,
  actionId,
  risk: "READ_ONLY",
  repeatable: true,
});
const write = (
  id: string,
  label: string,
  detail: string,
  actionId?: string,
): Step => ({
  id,
  label,
  detail,
  actionId,
  risk: "TEST_WRITE",
  repeatable: true,
});
export const scenarios: Scenario[] = [
  {
    id: "CASE_1",
    number: 1,
    title: "Full Singapore application",
    subtitle: "Frontend → Singapore API → Singapore PostgreSQL",
    recommendedEnvironment: "LOCAL_EMULATION",
    steps: [
      read(
        "c1-identity",
        "Verify AWS identity when selected",
        "Read-only STS check; local mode keeps this action out of scope.",
        "aws.identity",
      ),
      read(
        "c1-verify",
        "Verify environment",
        "Validate endpoint health and measurement provenance.",
        "environment.verify",
      ),
      read(
        "c1-health",
        "Verify application and PostgreSQL",
        "Execute the database-connected health endpoint.",
        "application.health",
      ),
      read(
        "c1-topology",
        "Inspect deployment topology",
        "Read runtime topology; AWS placement needs independent discovery.",
        "topology.inspect",
      ),
      read(
        "c1-get",
        "Execute real order GET",
        "Read actual PostgreSQL rows through Fastify.",
        "orders.list",
      ),
      write(
        "c1-post",
        "Execute synthetic order POST",
        "Create and read back a uniquely named DEMO-CONSOLE order.",
        "orders.create",
      ),
      read(
        "c1-benchmark",
        "Benchmark 1 / 5 / 10 / 20 queries",
        "Warm-ups are excluded; raw HTTP and DB timings are retained.",
        "benchmark.run",
      ),
      read(
        "c1-export",
        "Export evidence",
        "Download the evidence file reported by the completed benchmark.",
      ),
    ],
  },
  {
    id: "CASE_2",
    number: 2,
    title: "Full Hanoi application",
    subtitle: "Frontend → Hanoi API → Hanoi PostgreSQL",
    recommendedEnvironment: "LOCAL_EMULATION",
    steps: [
      read(
        "c2-identity",
        "Verify AWS deployment identity when selected",
        "Read-only STS check; no account setting is changed.",
        "aws.identity",
      ),
      read(
        "c2-verify",
        "Verify environment",
        "Validate endpoint health and provenance.",
        "environment.verify",
      ),
      read(
        "c2-health",
        "Verify application and PostgreSQL",
        "Execute the database-connected health endpoint.",
        "application.health",
      ),
      read(
        "c2-topology",
        "Inspect topology and identity",
        "Runtime labels are not physical residency proof.",
        "topology.inspect",
      ),
      read(
        "c2-aws",
        "Verify AZ and EBS placement",
        "Available after AWS deployment; requires read-only AWS discovery.",
        "aws.hanoi-zone",
      ),
      read(
        "c2-get",
        "Execute real order GET",
        "Read actual PostgreSQL rows.",
        "orders.list",
      ),
      write(
        "c2-post",
        "Execute synthetic order POST",
        "Create and read back a DEMO-CONSOLE order.",
        "orders.create",
      ),
      read(
        "c2-benchmark",
        "Benchmark 1 / 5 / 10 / 20 queries",
        "Retain raw client, server and SQL timings.",
        "benchmark.run",
      ),
    ],
  },
  {
    id: "CASE_3",
    number: 3,
    title: "Singapore API / Hanoi DB",
    subtitle: "Query amplification across the selected database path",
    recommendedEnvironment: "LOCAL_EMULATION",
    steps: [
      read(
        "c3-identity",
        "Verify AWS identity when selected",
        "Read-only STS check before trusting AWS deployment evidence.",
        "aws.identity",
      ),
      read(
        "c3-verify",
        "Verify Singapore API and Hanoi database",
        "Validate endpoint health and selected provenance.",
        "environment.verify",
      ),
      read(
        "c3-topology",
        "Confirm actual database target",
        "Read API-reported database target; AWS requires independent validation.",
        "topology.inspect",
      ),
      read(
        "c3-private",
        "Verify private connectivity",
        "AWS_REAL requires sanitized VPC/SG evidence; local mode shows Compose path only.",
      ),
      read(
        "c3-benchmark",
        "Run 1 / 5 / 10 / 20 queries",
        "Compare end-to-end HTTP, aggregate DB and individual SQL timing.",
        "benchmark.run",
      ),
      read(
        "c3-export",
        "Export evidence",
        "Do not infer private RTT from aggregate HTTP duration.",
      ),
    ],
  },
  {
    id: "CASE_4",
    number: 4,
    title: "Singapore-to-Hanoi migration",
    subtitle:
      "Guarded logical backup, isolated restore, checksum and cutover proof",
    recommendedEnvironment: "LOCAL_EMULATION",
    steps: [
      read(
        "c4-preflight",
        "Pre-migration health check",
        "Verify services before touching synthetic databases.",
        "local.preflight",
      ),
      read(
        "c4-inspect",
        "Inspect source and target",
        "Existing workflow records source/target context.",
      ),
      read(
        "c4-capture",
        "Capture row count and checksum",
        "Recorded before backup by the guarded migration script.",
      ),
      write(
        "c4-run",
        "Create backup, restore, verify and test cutover",
        "Runs the existing guarded workflow after explicit confirmation.",
        "local.migration",
      ),
      read(
        "c4-rollback",
        "Show rollback instructions",
        "Use Reset/recovery procedure after a partial local migration.",
      ),
    ],
  },
  {
    id: "CASE_5",
    number: 5,
    title: "Backup, snapshot and recovery",
    subtitle:
      "Logical recovery now; EBS Local Snapshot remains separately gated",
    recommendedEnvironment: "LOCAL_EMULATION",
    steps: [
      read(
        "c5-preflight",
        "Preflight isolated recovery target",
        "Verify services before logical restore.",
        "local.preflight",
      ),
      write(
        "c5-logical",
        "PostgreSQL logical backup and restore",
        "Restores only into the isolated local recovery database.",
        "local.backup-restore",
      ),
      {
        id: "c5-ebs-preview",
        label: "Preview Hanoi EBS Local Snapshot",
        detail: "No approved billable snapshot executor exists.",
        risk: "BILLABLE",
        blockedReason:
          "NOT_IMPLEMENTED — requires separate snapshot design and approval.",
      },
      {
        id: "c5-ebs-create",
        label: "Create and verify EBS Local Snapshot",
        detail: "Would create a billable AWS resource.",
        risk: "BILLABLE",
        blockedReason: "BLOCKED — explicitly outside this authorization.",
      },
      {
        id: "c5-restore",
        label: "Restore isolated AWS recovery volume",
        detail: "Must never replace or detach the source database volume.",
        risk: "DESTRUCTIVE",
        blockedReason:
          "NOT_READY — no separately approved recovery environment.",
      },
    ],
  },
];

export function environmentSupportsScenario(
  environment: EnvironmentId,
  scenario: ScenarioId,
) {
  if (environment === "LOCAL_EMULATION") return true;
  if (environment === "AWS_REAL_SINGAPORE") return scenario === "CASE_1";
  if (environment === "AWS_REAL_HANOI") return scenario === "CASE_2";
  if (environment === "AWS_REAL_HYBRID")
    return ["CASE_3", "CASE_4", "CASE_5"].includes(scenario);
  return ["CASE_1", "CASE_2", "CASE_3"].includes(scenario);
}
