# Live Demo Rehearsal

## Before the session

1. Close high-CPU applications and disable unrelated downloads.
2. Run `.\scripts\emulation\presenter.ps1 -Scenario Preflight`.
3. Confirm every container, HTTP endpoint, database, and proxy toxic says `PASS`.
4. Open <http://localhost:3000>, select **Scenarios**, and confirm the launcher state/log appear.
5. State aloud: “These delays are illustrative local parameters, not AWS measurements.”

## Rehearse Cases 1–5

Run each case independently with the commands in `PRESENTER_RUNBOOK.md`. For Cases 1–3, inspect all four query-count rows, zero errors, raw sample export, and the live Latency Lab chart. For Case 4, show matching pre-cutover row counts/checksums and the target-only post-cutover sample. For Case 5, show matching source/recovery counts/checksums and recovered sample; explicitly state it is not an EBS snapshot.

Finally run the `All` launcher once. A successful rehearsal requires launcher status `SUCCEEDED`, command exit code zero, all evidence status values `SUCCEEDED`, and a fresh timestamp.

## Interrupted migration

The migration script's `finally` block restarts APIs. If interruption occurs during target reset/restore, the Hanoi schema may be incomplete. Run:

```powershell
.\scripts\emulation\presenter.ps1 -Scenario Preflight
.\scripts\emulation\presenter.ps1 -Scenario Reset -ConfirmReset
.\scripts\emulation\presenter.ps1 -Scenario Case4
```

Case 4 always resets the synthetic target before restore, so a clean rerun does not append partial migrated rows.

## Interrupted backup/restore

The source remains intact. The recovery schema may be partial. Run Reset, then Case 4 if Hanoi must first be repopulated from SG, followed by Case 5. Case 5 always resets the isolated recovery target before restore.

## Fallback presentation

If Docker or a scenario cannot recover in the allotted time, stop live execution. Present the most recent evidence only if its status is `SUCCEEDED` and identify its timestamp. Otherwise use architecture and methodology views without claiming measured results. AWS remains out of scope while the Local Zone is not opted in.
