# Engineering findings and lessons learned

This is an append-only engineering log. Verified facts and open hypotheses are explicitly distinguished. Never add credentials, tokens, secret values, full account identifiers, private IPs, or unrelated resource identifiers.

## F-001 — 2026-10-28 — AWS authentication diagnostics

- **Component / scenario:** AWS CLI / deployment gate
- **Original assumption:** An STS authentication failure could indicate that the account was ineligible for Hanoi Local Zone.
- **Actual observation:** Authentication state and Local Zone eligibility are independent gates. After SSO authentication recovered, read-only STS and EC2 discovery succeeded.
- **Evidence / reproducible command:** `aws sts get-caller-identity --profile thangvn`; `aws ec2 describe-availability-zones --profile thangvn --region ap-southeast-1 --zone-names ap-southeast-1-han-1a`
- **Impact:** Never infer account or zone ineligibility from expired or stale credentials.
- **Root cause:** Credential-provider/session state can fail before any Local Zone authorization check occurs.
- **Workaround / resolution:** Recover the supported SSO session, then rerun independent read-only checks.
- **Status:** VERIFIED

## F-002 — 2026-10-28 — Local Zone Elastic IP placement

- **Component / scenario:** Hanoi networking
- **Original assumption:** A Regional Elastic IP could be associated with an instance in the Hanoi Local Zone without an explicit placement constraint.
- **Actual observation:** The EIP must be allocated in the Local Zone's network border group; Hanoi reports `ap-southeast-1-han-1`.
- **Evidence / reproducible command:** `aws ec2 describe-availability-zones --profile thangvn --region ap-southeast-1 --zone-names ap-southeast-1-han-1a --query "AvailabilityZones[0].NetworkBorderGroup"`
- **Impact:** An unconstrained EIP could make apply or association fail after other resources were created.
- **Root cause:** Local Zone public IPv4 routing is scoped by network border group.
- **Workaround / resolution:** Terraform now sets the EIP network border group and rejects unexpected mappings with a precondition.
- **Status:** RESOLVED

## F-003 — 2026-10-28 — T3 credit cost and benchmark behavior

- **Component / scenario:** Singapore `t3.small`, Cases 1 and 3
- **Original assumption:** The default burst behavior had no additional cost or measurement consequence for a short lab.
- **Actual observation:** T3 Unlimited can incur surplus-credit charges; Standard mode avoids that charge but can throttle after earned credits are exhausted and provides no launch credits.
- **Evidence / reproducible command:** Inspect Terraform `credit_specification`; after deployment inspect `CPUCreditBalance` in CloudWatch before and after measurement.
- **Impact:** Singapore versus Hanoi results are not a geography-only comparison and may include CPU-credit effects.
- **Root cause:** Burstable compute and dissimilar EC2 families.
- **Workaround / resolution:** Pin Singapore to `standard`, record credit balance, and disclose possible throttling.
- **Status:** RESOLVED

## F-004 — 2026-10-28 — S3 website transport and public access

- **Component / scenario:** Static frontend
- **Original assumption:** Static S3 website delivery could remain private or provide HTTPS directly.
- **Actual observation:** S3 website endpoints require public-readable objects and provide HTTP, not HTTPS. An HTTPS frontend cannot call the planned HTTP APIs without mixed-content blocking.
- **Evidence / reproducible command:** Inspect the planned S3 bucket policy/public-access-block and `frontend_delivery_mode`; verify in a browser after deployment.
- **Impact:** The current profile is suitable only for synthetic demo data and a controlled presenter network.
- **Root cause:** S3 website endpoint capabilities and browser security policy.
- **Workaround / resolution:** Keep the whole demo HTTP for this minimal profile; require a separately reviewed TLS design before CloudFront.
- **Status:** VERIFIED

## F-005 — 2026-10-28 — Container agent cannot execute host workflows

- **Component / scenario:** Interactive presenter control plane
- **Original assumption:** The existing Alpine agent container could run host AWS CLI and PowerShell presenter scripts.
- **Actual observation:** The image contains Node only, has no trusted host AWS profile, and cannot invoke Windows PowerShell or control the host Compose CLI. It could expose buttons but not complete the promised operations.
- **Evidence / reproducible command:** Inspect `agent/Dockerfile`; compare container PATH/capabilities with `scripts/emulation/presenter.ps1` requirements.
- **Impact:** Leaving the container on port 3001 would make execution controls fail or mislead the presenter.
- **Root cause:** Execution boundary mismatch between a Linux container and the Windows host toolchain.
- **Workaround / resolution:** Run the allowlisted agent on the host, bound to loopback. The container is now an explicit optional diagnostics profile and does not start by default.
- **Status:** RESOLVED

## F-006 — 2026-10-28 — Windows PowerShell JSON compatibility

- **Component / scenario:** Deployment-gate diagnostics
- **Original assumption:** `ConvertFrom-Json -Depth` was supported by the installed shell.
- **Actual observation:** Windows PowerShell 5.1 does not accept that parameter, although newer PowerShell versions do.
- **Evidence / reproducible command:** `$PSVersionTable.PSVersion`; run `ConvertFrom-Json -Depth 10` under Windows PowerShell 5.1.
- **Impact:** A read-only audit script stopped after Terraform validation even though the plan itself was valid.
- **Root cause:** Shell-version API difference.
- **Workaround / resolution:** Remove the unsupported parameter for this environment and retain strict downstream assertions.
- **Status:** RESOLVED

## F-007 — 2026-10-28 — Presenter console security boundary

- **Component / scenario:** All interactive workflows
- **Original assumption:** CORS alone was sufficient protection for a local execution API.
- **Actual observation:** CORS does not prevent every cross-origin request; a mutation endpoint also needs origin validation and an unguessable request token.
- **Evidence / reproducible command:** Agent tests send an untrusted `Origin` and a POST without `X-Lab-CSRF`; both must return HTTP 403.
- **Impact:** A malicious page open in the presenter browser must not trigger local scripts or AWS reads.
- **Root cause:** Browser same-origin protections and local-service attack patterns.
- **Workaround / resolution:** Loopback binding, exact origin allowlist, in-memory CSRF token, fixed actions, strict parameter validation, no arbitrary shell, and TEST_WRITE confirmation.
- **Status:** VERIFIED

## Additional verified findings

## F-008 — 2026-10-28 — PowerShell child-process executable resolution

- **Component / scenario:** Host workflow engine / all local scenarios
- **Original assumption:** Passing `PATH` was sufficient for a restricted PowerShell child environment to invoke Docker CLI.
- **Actual observation:** PowerShell found the Docker command metadata but the presenter startup failed when `PATHEXT` was omitted. The same restricted environment succeeded after `PATHEXT` was included.
- **Evidence / reproducible command:** Spawn `powershell.exe -File scripts/emulation/start.ps1` from Node with an environment allowlist, first without and then with `PATHEXT`.
- **Impact:** Genuine workflows were correctly marked FAILED even though Docker Desktop itself was healthy.
- **Root cause:** Windows executable-extension resolution metadata was removed at the process boundary.
- **Workaround / resolution:** Include only the required Windows execution metadata while continuing to exclude AWS credential/session environment variables from local actions.
- **Status:** RESOLVED

## Additional restart findings

## F-009 — 2026-10-28 — Nginx retained a stale Compose backend address

- **Component / scenario:** Local order frontend and presenter dashboard restart recovery
- **Original assumption:** `proxy_pass http://backend:8080` would automatically follow a recreated Compose backend container.
- **Actual observation:** Nginx resolved the service name at startup and retained the old container IP. After backend recreation, direct backend health was 200 while the frontend proxy returned 502.
- **Evidence / reproducible command:** Recreate only `backend`, then compare backend container health with `Invoke-RestMethod http://127.0.0.1:8081/health` and inspect Nginx logs for the stale upstream address.
- **Impact:** Restarting scenarios could make the presentation frontend appear broken despite a healthy API.
- **Root cause:** Startup-time DNS resolution in the static Nginx upstream configuration.
- **Workaround / resolution:** Use Docker's embedded DNS resolver with a variable-based `proxy_pass` in both Nginx configurations.
- **Status:** RESOLVED

## Additional evidence findings

## F-010 — 2026-10-28 — PowerShell evidence files include a UTF-8 BOM

- **Component / scenario:** Workflow evidence validation
- **Original assumption:** JSON produced by Windows PowerShell `Set-Content -Encoding utf8` could be passed directly to Node `JSON.parse`.
- **Actual observation:** Windows PowerShell 5.1 writes a leading UTF-8 BOM. The underlying preflight passed with exit code 0, but the fail-closed validator correctly refused to mark success because parsing returned no document.
- **Evidence / reproducible command:** Inspect the first bytes of `evidence/preflight-latest.json` and compare direct PowerShell parsing with Node `JSON.parse`.
- **Impact:** Successful real operations appeared as FAILED rather than risking a false success.
- **Root cause:** Encoding behavior differs between Windows PowerShell 5.1 and modern Node tooling.
- **Workaround / resolution:** Remove only one leading BOM before JSON parsing; retain required `status=SUCCEEDED` validation.
- **Status:** RESOLVED

## Additional browser findings

## F-011 — 2026-10-28 — Hijacked SSE responses bypass Fastify CORS headers

- **Component / scenario:** Live execution terminal
- **Original assumption:** Fastify CORS headers would remain present after an SSE route called `reply.hijack()`.
- **Actual observation:** Browser Playwright verification showed the run was dispatched, but EventSource was blocked because the raw response lacked `Access-Control-Allow-Origin`.
- **Evidence / reproducible command:** From `http://localhost:3000`, execute a read-only step and inspect browser console/network for the `127.0.0.1:3001/runs/.../events` request.
- **Impact:** Backend actions ran, but the terminal could not stream them and correctly refused to infer success.
- **Root cause:** A hijacked Fastify reply writes raw headers and bypasses normal CORS response decoration.
- **Workaround / resolution:** After exact Origin validation, echo only that allowlisted Origin on the SSE response and set `Vary: Origin`.
- **Status:** RESOLVED

## Open hypotheses

### H-001 — 2026-10-28 — Hanoi launch capacity

- **Component / scenario:** Real Hanoi EC2 deployment
- **Original assumption:** An advertised instance offering implies launch capacity.
- **Actual observation:** Read-only offering discovery confirms product availability, not a capacity reservation.
- **Evidence / reproducible command:** `aws ec2 describe-instance-type-offerings ...`; actual capacity can be established only by the separately approved apply.
- **Impact:** `c7i.large` may still fail to launch without indicating a Terraform defect.
- **Root cause:** Not established; capacity is dynamic.
- **Workaround / resolution:** Stop on capacity error. Do not silently substitute instance type or zone.
- **Status:** OPEN

## Production recommendations

- Add TLS for frontend and API, authentication, WAF/rate controls, and private administrative access before using non-synthetic data.
- Separate API and PostgreSQL failure domains, use managed database/HA where supported, and define tested RPO/RTO.
- Use immutable artifacts, centralized logs/traces, explicit secrets rotation, budgets and lifecycle policies.
- Treat Singapore `t3.small` versus Hanoi `c7i.large` as a system comparison, not a controlled geography experiment.
- Keep emulation, external-provider, and AWS evidence in separate datasets with explicit provenance.

## Additional deployment-gate findings

## F-012 — 2026-10-28 — Presenter changes invalidate the saved AWS plan

- **Component / scenario:** `cost_minimal` deployment gate
- **Original assumption:** The previously saved Terraform plan could remain the approval artifact after presenter and frontend work.
- **Actual observation:** The deployment bundle and frontend build changed, and the presenter's public IPv4 also changed. The old plan and artifact hashes were therefore no longer valid approval inputs.
- **Evidence / reproducible command:** `.\infrastructure\terraform\scripts\build-artifacts.ps1 -Target CostMinimal`; `.\infrastructure\terraform\scripts\plan-review.ps1 -Environment CostMinimal`; `Get-FileHash -Algorithm SHA256` for the plan and artifact.
- **Impact:** Applying the old plan would violate the immutable deployment gate and could use a stale ingress `/32`.
- **Root cause:** Application artifact updates and a changed operator network address.
- **Workaround / resolution:** Rebuilt `minimal-images.tar`, regenerated the read-only 48-add plan for the current `/32`, and updated the documented hashes. No Terraform apply ran.
- **Status:** RESOLVED

## F-013 — 2026-10-28 — Concurrent presenter processes contend for latest evidence

- **Component / scenario:** Local presenter launcher / reset recovery
- **Original assumption:** A returned tool yield meant the reset process had completed before the next preflight started.
- **Actual observation:** The reset continued after the 30-second output yield. Starting preflight concurrently caused both processes to write `evidence/presenter-latest.log`, and the second process failed with a sharing violation.
- **Evidence / reproducible command:** Start a reset and launch a second `presenter.ps1` process before the first exits; inspect process timestamps and the `Add-Content` sharing violation.
- **Impact:** Concurrent manual launcher commands could produce a confusing file error and contend for mutable local schemas.
- **Root cause:** The CLI launcher had no cross-process exclusivity guard; the control agent's in-memory exclusive groups cannot protect commands started from another terminal.
- **Workaround / resolution:** Added a named process-wide mutex. A second launcher now fails immediately with an explicit workflow-in-progress error and cannot touch evidence or databases.
- **Status:** RESOLVED

## F-014 — 2026-10-28 — Migration and restore evidence needed immutable copies

- **Component / scenario:** Cases 4 and 5 evidence retention
- **Original assumption:** The `local-emulation-*.json` latest files were sufficient evidence after a recovery drill.
- **Actual observation:** Reset intentionally removes those latest files, so a successful earlier migration or restore no longer remained inspectable on disk.
- **Evidence / reproducible command:** Run Cases 4 and 5, then `presenter.ps1 -Scenario Reset -ConfirmReset`, and list `evidence/`.
- **Impact:** A presenter could lose essential drill evidence while correctly restoring the lab to a clean state.
- **Root cause:** Cases 4 and 5 wrote only mutable latest pointers, unlike the benchmark workflow's timestamped evidence.
- **Workaround / resolution:** Each Case 4/5 attempt now writes both a latest pointer and an immutable timestamped, run-ID-qualified JSON file, including failed attempts. Reset retains both forms of evidence.
- **Status:** RESOLVED

## F-015 — 2026-10-28 — PowerShell null collection produced a false EC2 count

- **Component / scenario:** Read-only AWS inventory verification
- **Original assumption:** Wrapping the projected `Reservations.Instances` value in `@(...)` always produced an accurate instance count.
- **Actual observation:** The empty projection was counted as one in the diagnostic expression, while the AWS CLI's direct JMESPath result and full JSON both returned an empty list.
- **Evidence / reproducible command:** `aws ec2 describe-instances ... --query 'length(Reservations[].Instances[])' --output text` returned `0`; the corresponding `--output json` result was `[]`.
- **Impact:** The first summary falsely suggested a project-tagged instance might exist.
- **Root cause:** PowerShell null/projection counting semantics, not an AWS resource.
- **Workaround / resolution:** Use AWS CLI JMESPath `length(...)` for the authoritative count and inspect non-empty JSON records directly.
- **Status:** RESOLVED

## F-016 — 2026-10-28 — Automatic presenter workflows require server-declared safety metadata

- **Component / scenario:** Live Tech Talk safe sequence
- **Original assumption:** A UI-maintained list of read-only action IDs was sufficient.
- **Actual observation:** The browser list alone cannot be the authorization boundary because risk and executors belong to the localhost agent.
- **Evidence / reproducible command:** Inspect `GET /actions`; automatic candidates expose `risk=READ_ONLY` and `safeAutomatic=true`.
- **Impact:** A future UI edit cannot silently automate synthetic-write, billable, destructive, or arbitrary command actions.
- **Workaround / resolution:** Enforce both agent metadata fields at dispatch and retain the fixed action-ID API.
- **Status:** RESOLVED

## F-017 — 2026-10-28 — Pause and skip are safe only between atomic operations

- **Component / scenario:** Presenter safe sequence controls
- **Original assumption:** A running HTTP or AWS CLI operation could be paused in place.
- **Actual observation:** Pausing active I/O has unreliable semantics and can leave timeouts or database work ambiguous.
- **Evidence / reproducible command:** Request pause/skip while a sequence step is active; the control takes effect at the next boundary.
- **Impact:** The console never claims that in-flight I/O is suspended. Cancel remains distinct from success.
- **Workaround / resolution:** Label the control `Pause after step`; record `SKIPPED` and `CANCELLED` explicitly.
- **Status:** RESOLVED

## F-018 — 2026-10-28 — Hybrid mode does not require a third EC2 instance

- **Component / scenario:** Final AWS lifecycle architecture / Case 3
- **Original assumption:** Each scenario might need a separate compute instance.
- **Actual observation:** The Singapore API can use a separate connection to Hanoi PostgreSQL; the same two instances support Cases 1–3.
- **Evidence / reproducible command:** Review the `cost_minimal` topology and presenter architecture summary.
- **Impact:** Scenario switching must not recreate infrastructure or start another server.
- **Workaround / resolution:** Present one Singapore EC2 plus one Hanoi EC2, deploy once, and keep lifecycle mutations approval-gated.
- **Status:** VERIFIED

## F-019 — 2026-10-28 — Slide integration can remain a deep link

- **Component / scenario:** Existing HTML slide deck integration
- **Original assumption:** The presenter console needed to rewrite or embed the deck.
- **Actual observation:** SPA history fallback lets `/demo` open independently or as a deck overlay.
- **Evidence / reproducible command:** Open `http://localhost:3000/demo#architecture`.
- **Impact:** Slide ownership and presenter controls remain decoupled.
- **Workaround / resolution:** Use `/demo` and section hashes as the optional integration point.
- **Status:** VERIFIED
