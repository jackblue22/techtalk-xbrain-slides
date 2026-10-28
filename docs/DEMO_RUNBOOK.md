# Local Demo Runbook

## Preferred access-fallback start

```powershell
Copy-Item .env.example .env
Copy-Item .env.emulation.example .env.emulation
.\scripts\emulation\start.ps1 -Build
```

Use the dashboard target selector for direct, Singapore-shaped, Hanoi-shaped, and hybrid-shaped paths. Every shaped result is local emulation, not AWS performance. Run the reproducible scenario scripts documented in `docs/ACCESS_LIMITATION_FALLBACK.md` for JSON evidence.

## Start

1. Copy `.env.example` to `.env` and keep its values local-only.
2. Run `docker compose up --build`.
3. Wait until `docker compose ps` reports the database and backend healthy.
4. Open the order app at <http://localhost:8081> and the presenter dashboard at <http://localhost:3000>.

## Verify

```powershell
Invoke-RestMethod http://localhost:8081/health
Invoke-RestMethod http://localhost:3000/api/topology
Invoke-RestMethod 'http://localhost:3000/api/benchmark/db?n=5'
Invoke-RestMethod http://localhost:8081/api/orders
```

Create an order through the order UI, refresh, and confirm the returned request ID. In Latency Lab, start a local test. Exactly three warm-up HTTP calls are discarded, then up to 30 actual sequential samples are retained. Export JSON or CSV; exports contain the raw samples from which statistics were computed.

The browser's city and ISP are not auto-detected. Before an AWS benchmark, record the presenter location/ISP in the evidence metadata rather than inferring them.

## Stop

`docker compose down` stops containers but keeps the database volume. `docker compose down --volumes` deletes local lab data and is intentionally not part of the default Make target.

For the emulation overlay, stop without deleting data using:

```powershell
docker compose -f docker-compose.yml -f docker-compose.emulation.yml down
```

## Failure cues

- `NOT TESTED` means no measurement exists; it is not zero.
- `LIVE AWS · NOT CONNECTED` is correct in Phase 1.
- Agent errors about a missing `aws` executable mean the container has no AWS CLI. For Phase 2 run the agent on the bound host with Node and the existing AWS CLI after reviewing the selected profile.
