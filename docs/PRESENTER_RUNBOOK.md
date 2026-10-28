# Presenter Runbook

## Interactive console startup

Start the trusted host control agent before Compose so port 3001 is owned by the executor that can actually access host PowerShell and Docker:

```powershell
npm run dev -w @hanoi-lab/agent
```

In a second terminal:

```powershell
docker compose -f docker-compose.yml -f docker-compose.emulation.yml up -d --build
```

Open <http://localhost:3000>. Confirm **CONTROL AGENT READY**, select the environment and scenario, and use only enabled workflow steps. The browser has no arbitrary shell and receives no AWS credential. TEST_WRITE actions show an explicit confirmation prompt; EBS snapshot and destructive actions remain disabled.

See the short [operator cheatsheet](DEMO_OPERATOR_CHEATSHEET.md) for the live sequence.

## One-command entry point

Run PowerShell from the repository root:

```powershell
.\scripts\emulation\presenter.ps1 -Scenario Preflight
.\scripts\emulation\presenter.ps1 -Scenario All -Samples 100 -Warmups 5
```

The launcher starts existing containers without rebuilding unless `-Build` is explicitly supplied, runs preflight, streams timestamped output, and publishes `RUNNING`, `SUCCEEDED`, or `FAILED`. Keep the dashboard's **Scenarios** tab open at <http://localhost:3000> to follow the real log and evidence.

## Independent scenarios

```powershell
.\scripts\emulation\presenter.ps1 -Scenario Case1 -Samples 100 -Warmups 5
.\scripts\emulation\presenter.ps1 -Scenario Case2 -Samples 100 -Warmups 5
.\scripts\emulation\presenter.ps1 -Scenario Case3 -Samples 100 -Warmups 5
.\scripts\emulation\presenter.ps1 -Scenario Case4
.\scripts\emulation\presenter.ps1 -Scenario Case5
```

Cases 1–3 write immutable timestamped raw evidence plus `evidence/benchmark-latest.json`. Case 4 writes immutable `evidence/migration-<timestamp>-<run-id>.json` evidence with counts, both checksums, post-cutover sample placement, and verification flags. Case 5 writes immutable `evidence/backup-restore-<timestamp>-<run-id>.json` evidence with source/recovery counts, both checksums, sample recovery, and verification flags. The corresponding local-emulation JSON files are latest pointers.

## Reset and recovery

Reset is intentionally explicit and affects only local synthetic SG/Hanoi/recovery schemas. Timestamped evidence and latest evidence pointers are retained:

```powershell
.\scripts\emulation\presenter.ps1 -Scenario Reset -ConfirmReset
```

It stops the three scenario APIs, recreates schemas, restarts migration-owning APIs, waits for health, then restarts the hybrid API. Docker volumes are retained. Never use `docker compose down --volumes` during a presentation unless permanent local data deletion is intended.

If any command reports `FAILED`, do not present its partial output as a result. Preserve the log, run Preflight, use Reset if a schema operation was interrupted, and rerun only the failed case.

Run only one `presenter.ps1` workflow at a time. The launcher enforces this across terminal and dashboard processes and fails fast with a clear message if another workflow still owns the lab.
