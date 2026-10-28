# Demo operator cheatsheet

## Start the interactive console

Open two PowerShell terminals at the repository root.

Terminal 1 — start the real localhost control agent:

```powershell
npm run dev -w @hanoi-lab/agent
```

Terminal 2 — start or refresh the local lab:

```powershell
docker compose -f docker-compose.yml -f docker-compose.emulation.yml up -d --build
```

Open <http://localhost:3000>. The header must say **CONTROL AGENT READY**. The agent accepts only fixed actions, binds to loopback, and never sends AWS credentials to the browser.

## Recommended presentation sequence

1. Select `LOCAL_EMULATION` and Case 1.
2. Run **Verify environment**, **Health**, **Topology**, GET, then the confirmed synthetic POST.
3. Select 100 samples, 5 warm-ups, and run query groups 1/5/10/20.
4. Repeat for Cases 2 and 3. State that all delays are operator-defined illustrative parameters.
5. Case 4: run preflight, then confirm the guarded local logical migration. Show counts/checksums in evidence.
6. Case 5: run the isolated logical backup/restore. Keep EBS snapshot controls disabled; they are not authorized.

Switching environments performs no infrastructure operation. AWS modes remain `NOT_DEPLOYED` until successful sanitized deployment evidence exists.

## Recovery

If an action fails, trust the red status and exit code. Do not present partial output as success.

```powershell
.\scripts\emulation\presenter.ps1 -Scenario Preflight
.\scripts\emulation\presenter.ps1 -Scenario Reset -ConfirmReset
```

Reset affects only local synthetic scenario schemas. It retains generated drill evidence and does not delete Docker volumes or AWS resources.

If the agent session expires or restarts, refresh the dashboard discovery before running another action. For expired AWS SSO, follow `docs/AWS_AUTH_RECOVERY.md`; do not change profiles or account settings.

## Stop local services

```powershell
docker compose -f docker-compose.yml -f docker-compose.emulation.yml stop
```

Do not add `--volumes` during a presentation. No AWS teardown, snapshot creation, migration, or Terraform apply is authorized by these commands.
