# Live Tech Talk Presenter Runbook

## Safety boundary

The browser console can execute only backend-defined action IDs. It has no arbitrary command input. The automatic sequence accepts only actions marked both `READ_ONLY` and `safeAutomatic` by the localhost agent.

The console does **not** run Terraform apply/destroy, start or stop EC2, create snapshots, overwrite databases, change IAM/account settings, or provision a second Vietnamese cloud. Start Lab, Stop Lab, real migration, and EBS snapshot/restore remain separately approved operations.

## Exact startup commands

From the repository root:

```powershell
docker compose -f docker-compose.yml -f docker-compose.emulation.yml up -d --build
npm run dev -w @hanoi-lab/agent
```

Open `http://localhost:3000/demo`. The regular dashboard remains at `http://localhost:3000/`, and the order app is at `http://localhost:8081/`. `/demo` is also the slide-deck integration point: link to it or open it as an overlay without rewriting the existing deck.

## Pre-talk procedure

1. If AWS diagnostics are needed, authenticate only in an operator terminal: `aws sso login --profile thangvn`. Never paste credentials into the dashboard.
2. Start the Compose lab and localhost agent.
3. Open `/demo`, select `LOCAL_EMULATION`, and run **Demo Preflight**.
4. Confirm the agent and containers show `READY`. `AWS real` may correctly remain `NOT_READY` while no deployment exists.
5. Confirm the displayed presenter `/32` matches the reviewed Terraform plan before any later deployment review. A changed IP invalidates the ingress plan; this console does not edit it.
6. Rehearse every scenario independently with 5 warm-ups and 100 measured requests. Keep 1/5/10/20 SQL-query groups separate.
7. Inspect exported JSON timestamps, origins, raw samples, errors, DB timings, row counts, checksums, and sample records.
8. Test at 1920×1080, browser zoom 100%, then use **Enter Presentation Mode**.

## On-stage procedure

1. Explain the final topology: one Singapore EC2, one Hanoi Local Zone EC2, and a separate Singapore API connection to Hanoi PostgreSQL. There is no third hybrid EC2.
2. Run **Demo Preflight**. Diagnostic completion is distinct from AWS readiness.
3. Select an environment. Switching never starts EC2, changes a database, or provisions infrastructure.
4. For Cases 1–3, **Run Safe Demo Sequence** runs only read-only health, topology, GET, and benchmark work. Cases 4–5 require explicit synthetic-write confirmation and are excluded from automation.
5. Keep the terminal visible. Failed, cancelled, skipped, or interrupted steps retain their actual state.
6. Show benchmark p50/p95/p99 and DB timing with provenance. Local delay is operator-defined and illustrative, never AWS Hanoi Local Zone performance.
7. Export live evidence. Use **Previously Verified Evidence** only with `FALLBACK · NOT LIVE` visible.

## Presenter recovery

- **Expired SSO:** run `aws sso login --profile thangvn`, refresh discovery, and rerun preflight. Do not infer account ineligibility from authentication failure.
- **Changed presenter IP:** show the mismatch. Regenerate/review Terraform later; do not change security groups from this console.
- **Unavailable endpoint:** run Check Lab Status, inspect sanitized logs, and retry only the same fixed operation. Otherwise use labelled prior evidence.
- **Interrupted request:** cancel if still owned by the agent, inspect the terminal run record, then retry only when documented safe.
- **Interrupted migration/restore:** inspect source/target counts, checksums, and isolated target state before the documented reset/recovery procedure. Never overwrite the source database.
- **Disconnected agent:** restart `npm run dev -w @hanoi-lab/agent`, refresh discovery, and rerun preflight. A lost stream never implies success.

## AWS lifecycle after initial approved deployment

The intended model is one initial Terraform deployment followed by on-demand discovery and separately approved start/stop of the two tagged EC2 instances while preserving EBS. Scenario switching never triggers lifecycle changes.

In this implementation, **Check Lab Status** is enabled and read-only. **Start Lab** and **Stop Lab** are visible but disabled because no AWS mutation was authorized. Future executors require fresh explicit approval, exact tag/resource validation, health waiting, and sanitized evidence.

Real Case 4 migration and Case 5 logical restore/EBS Local Snapshot remain separately gated. Snapshot creation and recovery mutation must never join the safe automatic sequence. Cross-cloud Vietnamese-provider DR remains theory only.

## Post-talk procedure

1. Export evidence and record whether each result is live or previously verified.
2. Review retained-cost warnings. Stopped EC2 can leave EBS, public IPv4/Elastic IP, S3, secrets, and snapshot costs.
3. Do not destroy Terraform or delete volumes/snapshots without a reviewed inventory and explicit approval.
4. Stop only the local lab when finished:

   ```powershell
   docker compose -f docker-compose.yml -f docker-compose.emulation.yml down
   ```

5. Update `note.md` with verified AWS behavior, unexpected errors, recovery steps, and evidence paths.

