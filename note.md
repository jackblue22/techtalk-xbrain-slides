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

## F-020 — 2026-10-29 — Presenter public-IP churn repeatedly invalidates the AWS deployment gate

- **Component / scenario:** `cost_minimal` presenter ingress and saved-plan approval
- **Original assumption:** The presenter's public IPv4 would remain stable from plan review through the approved deployment window.
- **Actual observation:** The reviewed ingress changed from `171.225.185.86/32` to `14.224.239.90/32` before apply. The immutable gate correctly rejected the approved plan before any AWS resource was created.
- **Evidence / reproducible command:** Immediately before planning or applying, run `(Invoke-RestMethod 'https://checkip.amazonaws.com').Trim()` and compare the resulting `/32` with `benchmark_client_cidrs` in `terraform show -json <saved-plan>`.
- **Impact:** Each ISP address change requires a new saved plan, hash, exposure review, and explicit approval. Applying the older plan would both block the current presenter and leave an obsolete public address allowlisted.
- **Root cause:** The presenter uses a dynamically assigned ISP egress address, while the security group intentionally allows only an immutable reviewed `/32`.
- **Secure recommendation:** Use a trusted VPN or zero-trust access service with a dedicated static egress IPv4, and allowlist only that stable `/32`. Record the VPN path as part of benchmark provenance because it can affect latency. For a future private-access design, prefer SSM port forwarding or a reviewed client-VPN path and remove direct public API ingress; that changes architecture and cost and therefore requires a separate plan. Never solve the churn by widening ingress to `0.0.0.0/0`.
- **Status:** OPEN — select and verify a stable access path before the live tech talk.

## F-021 — 2026-10-29 — ECS-optimized AL2023 AMIs cannot launch with the planned 12-GiB root volume

- **Component / scenario:** `cost_minimal` EC2 root block-device mapping and AMI stabilization
- **Original assumption:** Terraform's 12-GiB encrypted gp3 root override was compatible with the dynamically selected ECS-optimized AL2023 AMI.
- **Actual observation:** AWS `describe-images` and `describe-snapshots` report a 30-GiB root mapping and 30-GiB source snapshot for both `ami-0519d6de6b4dc5791` (ECS AMI release `2023.0.20261022`) and `ami-01b068ca55c07ff47` (release `2023.0.20261027`). AWS requires a volume created from a snapshot to be at least the snapshot's volume size, so the planned 12-GiB root mapping is invalid even though Terraform validation succeeds.
- **AMI evidence:** Both images are public, available, Amazon-owned (`591542846629`, owner alias `amazon`), x86_64, EBS-backed, `/dev/xvda`, `uefi-preferred`, kernel 6.1 images. Both use ECS Agent `1.108.1` and runc `1.4.3`; the newer release changes Docker `25.0.16` to `25.0.18`, containerd `2.3.5` to `2.3.7`, and its source AL2023 minimal image from `2023.12.20261021.0` to `2023.12.20261026.1`.
- **Bootstrap assessment:** The ECS-optimized images provide the Docker runtime expected by `user-data.sh.tftpl`, and AL2023 is compatible with SSM Agent. Architecture and boot mode match both `t3.small` and `c7i.large`. The bootstrap cannot be proven because EC2 would reject the undersized root volume before user data runs.
- **Option A — ECS-optimized AMI:** Pin the reviewed AMI and increase both encrypted gp3 roots from 12 to at least 30 GiB. At current AWS Price List rates, the extra 18 GiB in Singapore plus 18 GiB in Hanoi adds about `$4.1472/month` retained storage, or `$0.00568/hour` when expressed over 730 hours; the reviewed fixed estimate becomes approximately `$0.15303/hour`. This preserves preinstalled/tested Docker and minimizes bootstrap drift, but is a material storage and cost change requiring a new plan and approval.
- **Option B — standard AL2023 AMI:** The current Amazon-owned standard x86_64 AL2023 AMI `ami-058799d8c91389327` has an 8-GiB root snapshot and can support a 12-GiB root. It does not provide the ECS-optimized preinstalled/tested Docker configuration, so bootstrap must install and start Docker and explicitly verify AWS CLI, SSM Agent, Python, OpenSSL, curl, and filesystem tools. This preserves root-storage cost but adds package-repository dependency, boot time, version drift, and more failure modes. The 2-GiB minimal AMI has still greater package/bootstrap risk and is not recommended for the live lab.
- **Recommendation:** Prefer Option A with the newer ECS-optimized AMI `ami-01b068ca55c07ff47`, an explicit configurable AMI variable, a pinned 30-GiB root minimum, and recorded SSM metadata. Do not apply the existing 12-GiB plans.
- **Sources:** AWS ECS-optimized AMI documentation, AWS EBS snapshot-volume sizing requirements, AWS Systems Manager AL2023 compatibility documentation, AWS ECS AMI release changelog, and live AWS Price List API output for `APS1-EBS:VolumeUsage.gp3` and `HAN1-EBS:VolumeUsage.gp3`.
- **Resolution:** Option A was explicitly authorized. The `cost_minimal` source now pins `ami-01b068ca55c07ff47` through a reviewed configurable variable and explicitly requests encrypted 30-GiB gp3 roots on both EC2 instances. The shared module default and all other profiles remain unchanged. The replacement plan has 48 creates, no changes or destroys, and SHA-256 `965c852dda01c6b5565d65e004256a45784ea4833ade9937e76535b366fc05a6`.
- **Status:** RESOLVED IN PLAN / APPLY BLOCKED — compatibility correction is reviewable; deployment remains stopped at the explicit saved-plan approval gate.

## F-022 — 2026-10-29 — A normal `cost_minimal` destroy is intentionally blocked and stopping EC2 leaves material residual cost

- **Component / scenario:** Temporary one-hour AWS lab teardown and retained-cost control
- **Original assumption:** A normal Terraform destroy after the talk would remove the complete 48-resource environment, and stopping the two instances would largely stop billing.
- **Actual observation:** Both 10-GiB PostgreSQL volumes have `prevent_destroy=true`. Both S3 buckets have `force_destroy=false`, and the artifact bucket is versioned, so current-object deletion can leave older versions/delete markers that block bucket deletion. Stopping EC2 leaves both EIPs, all 80 GiB of EBS, S3, and active secrets billable.
- **Evidence / reproducible command:** Run `.\infrastructure\terraform\scripts\teardown-preview.ps1 -Environment CostMinimal -PresenterCidr '14.224.239.90/32' -Profile thangvn -ExpectedAccountSuffix '7667'`. The report includes Terraform destroy-preview status, exact scoped AWS inventory, bucket versions/delete markers, secret deletion status, known blockers, and residual-cost estimates without mutating AWS.
- **Impact:** Cleanup must be a separately approved two-phase operation. Phase 1 stops the two exact EC2 IDs and leaves approximately `$0.02373/hour` of EIP, EBS, S3, and active-secret cost. Phase 2 explicitly approves synthetic-data deletion, exact S3 version cleanup, a narrow `prevent_destroy` source change, and a hashed Terraform destroy plan.
- **Resolution:** Added a fail-closed read-only teardown/residual-cost report and a complete `cost_minimal` teardown runbook. Post-cleanup proof requires zero EC2/EIP/EBS/S3/snapshot residuals unless each retained ID is reported with owner, expiry, and cost. Secrets pending seven-day deletion are retained evidence but counted at `$0` storage charge. Terraform state removal is forbidden as a way to conceal infrastructure.
- **Status:** PROCEDURE VERIFIED READ-ONLY — no stop, terminate, release, delete, apply, or destroy operation was executed.

## F-023 — 2026-10-29 — Hanoi Local Zone bootstrap derived an invalid S3 endpoint

- **Component / scenario:** Applied `cost_minimal` deployment; Cases 2 and 3
- **Applied plan:** `phase2b4-cost-minimal-pinned-ami-30g-14-224-239-90.tfplan`, SHA-256 `965c852dda01c6b5565d65e004256a45784ea4833ade9937e76535b366fc05a6`; Terraform completed 48 creates, 0 changes, 0 destroys.
- **Actual observation:** Hanoi instance `i-07a5107d21ec5654e` booted in `ap-southeast-1-han-1a`, mounted its encrypted 10-GiB data volume, then `aws s3 cp` attempted `https://...s3.ap-southeast-1-han-1.amazonaws.com/minimal-images.tar` and failed. No Hanoi PostgreSQL/backend container was created and its Secrets Manager secret has zero versions. Singapore instance `i-0cf960f74e80cde33` booted in `ap-southeast-1a`; PostgreSQL migration/seed and the port-8080 backend succeeded, then its overall cloud-init ended in error after the bounded hybrid wait reported `Peer database secret unavailable`.
- **Root cause:** The bootstrap S3 copy does not pass an explicit parent Region. On the Hanoi Local Zone host, the AWS CLI derived the Local Zone network-border-group-like endpoint instead of the bucket's `ap-southeast-1` Regional S3 endpoint.
- **Impact:** Case 1 is AWS_REAL and healthy. Cases 2 and 3 are unavailable. The localhost presenter console correctly remains `AWS_REAL=NOT_READY` rather than trusting unverified endpoints. The public S3 frontend runtime configuration contains the real endpoints, but Hanoi and hybrid health checks fail.
- **Evidence:** Case 1 evidence is `evidence/aws-real-benchmark-20261029-102308-6c875b60-51d6-4fca-87c4-9c00953655ab.json`: 5 warm-ups plus 100 measured requests for each 1/5/10/20-query workload, all with zero errors. The read-only cleanup/cost inventory is `evidence/aws-teardown-preview-latest.json`.
- **Billable resources:** Two running EC2 instances, two EIPs, four encrypted gp3 volumes (80 GiB), two S3 buckets, and two active Secrets Manager secrets. Estimated current fixed cost is about `$0.15303/hour`; stopping compute would leave about `$0.02373/hour-equivalent`.
- **Required remediation:** Add an explicit parent Region to the bootstrap S3 operation (for example, `aws s3 cp --region ap-southeast-1 ...`), rebuild/review artifacts if necessary, generate a replacement Terraform plan, and obtain explicit approval before replacing or reprovisioning the Hanoi instance. Do not repair the live host manually if the goal is reproducible Terraform evidence.
- **Status:** PARTIAL DEPLOYMENT — remediation and any cleanup are separately approval-gated; no automatic stop, replacement, or destroy was performed.

## F-024 — 2026-10-29 — Phase 2B-5 repair must use reviewed SSM phases, not Terraform replacement

- **Component / scenario:** Existing `cost_minimal` Cases 2 and 3 recovery
- **Read-only confirmation:** Account `384511757667` under profile `thangvn`; Hanoi `i-07a5107d21ec5654e` is running and SSM Online in `ap-southeast-1-han-1a`; Singapore `i-0cf960f74e80cde33` is running and SSM Online in `ap-southeast-1a`. The artifact bucket is in parent Region `ap-southeast-1`, `minimal-images.tar` exists, and its local reviewed SHA-256 remains `5ed9306375ab7e0cb66d7166db4222ef37d3b0e4c7d0aaf2c238fd6b0402c31f`. The Hanoi secret still has zero versions. No secret value was read.
- **Root cause:** The original bootstrap let the AWS CLI derive S3 from Local Zone context and attempted the invalid host `s3.ap-southeast-1-han-1.amazonaws.com`. Hanoi stopped after mounting and formatting its new empty encrypted data volume. Singapore completed Case 1, then stopped its overall bootstrap while waiting for the absent Hanoi secret.
- **Source correction:** Bootstrap now carries separate parent Region, Availability Zone, and network-border-group values; unsets `AWS_ENDPOINT_URL` and `AWS_ENDPOINT_URL_S3` for artifact download; pins `https://s3.ap-southeast-1.amazonaws.com`; verifies artifact SHA-256; uses bounded exponential backoff; refuses wrong mounts, initialized databases without the matching credential file, and stopped/unhealthy existing containers; and stores the schema marker on the persistent data volume.
- **Repair tooling:** `infrastructure/terraform/scripts/repair/invoke-cost-minimal-repair.ps1` pins exact targets and project tags, verifies SSM Online, hashes the selected script, defaults to preview-only, sends no secret in command parameters, and records future Command ID/timestamps/status/sanitized output. The Hanoi runtime phase requires both `-Execute` and `-AllowSchemaInitialization`; the Singapore phase verifies port 8080 before and after and never restarts Case 1.
- **Terraform reconciliation:** The saved review-only plan is `infrastructure/terraform/environments/cost_minimal/phase2b5-bootstrap-reconciliation.tfplan`, SHA-256 `0ccb9eaf286e86857d966fefc8c5ae81919a12589553ed40d43bf4c45ad0b830`. It proposes `4 add, 4 change, 4 destroy`: replacement of both EC2 instances and both attachments because `user_data_replace_on_change=true`, in-place reassociation of both EIPs, and in-place least-privilege additions of `secretsmanager:DescribeSecret` for each host's own database-secret metadata. It does not replace or delete either protected data volume. Applying it would nevertheless terminate the healthy Singapore host, so it is not the approved live-repair mechanism.
- **Plan drift finding:** Explicit empty inline security-group rule fields conflicted with standalone rule resources and produced a spurious in-place diff. Removing inline rule ownership eliminated that diff; the presenter ingress remains only `14.224.239.90/32`, and PostgreSQL remains security-group-to-self on TCP 5432.
- **Authorization boundary:** No SSM command was sent, so there are no Phase 2B-5 Command IDs. No apply, stop, restart, replacement, migration, snapshot, destroy, or secret mutation was executed. The schema initialization contained in the Hanoi repair script needs explicit separate approval.
- **Status:** PREPARED / LIVE REPAIR BLOCKED pending explicit approval of the exact three-phase commands and schema initialization.

## F-025 — 2026-10-29 — Cleanup was superseded after S3 content deletion but before infrastructure destroy

- **Sequence:** The operator explicitly authorized urgent permanent cleanup. Both exact project instances were verified and were already stopped. The read-only teardown preview confirmed 2 stopped EC2 instances, 2 EIPs, 4 EBS volumes, 2 buckets, 2 secrets, no snapshots, and an estimated stopped-lab residual of `$0.02372763/hour-equivalent`. Before the later repair instruction arrived, all five verified project-owned S3 object versions were deleted: four frontend objects and `minimal-images.tar` from the artifact bucket.
- **Superseding instruction:** The operator then requested that destroy be paused and authorized the three prepared SSM repair phases subject to mandatory preflight.
- **Mandatory preflight result:** **FAILED / NO SSM COMMAND SENT.** Both EC2 instances are `stopped`, neither appears SSM Online, the Singapore Case 1 HTTP health endpoint cannot be verified, and both S3 buckets are empty. The local artifact still exists with SHA-256 `5ed9306375ab7e0cb66d7166db4222ef37d3b0e4c7d0aaf2c238fd6b0402c31f`, but uploading it was not authorized by the runtime-repair approval. Both encrypted 10-GiB data volumes remain attached to their exact instances; live mount state cannot be verified while stopped.
- **IAM result:** Both roles retain `AmazonSSMManagedInstanceCore` and exact artifact `s3:GetObject`; Hanoi retains exact-secret `secretsmanager:PutSecretValue`; Singapore retains exact Hanoi-secret `GetSecretValue` and `DescribeSecret`. No IAM change was applied.
- **Preserved resources:** No Terraform destroy plan was generated or applied. No EC2 instance, EIP, EBS volume, secret, IAM, or network resource was deleted. No `prevent_destroy` source change or Terraform state removal occurred.
- **Required new authority:** Resume requires explicit approval to start the two exact stopped instances and restore the reviewed artifact/frontend objects to the two existing verified buckets. After that, repeat mount, SSM, artifact, and Case 1 health preflight before any repair phase.
- **Status:** PARTIAL S3 CLEANUP / REPAIR BLOCKED — ongoing EIP, EBS, and active-secret charges remain.

## F-026 — 2026-10-29 — Approved artifacts restored and existing EC2 instances restarted

- **Recovery scope:** Under an exclusive repository operation lock, restored only the Terraform-managed `minimal-images.tar`, `index.html`, `assets/index-DDKTomfy.css`, `assets/index-mq3PL-oQ.js`, and `runtime-config.js`, then called `StartInstances` only for `i-07a5107d21ec5654e` and `i-0cf960f74e80cde33`. No infrastructure was created or replaced.
- **Artifact proof:** Local `minimal-images.tar` SHA-256 remains `5ed9306375ab7e0cb66d7166db4222ef37d3b0e4c7d0aaf2c238fd6b0402c31f`; its local/state MD5 and uploaded single-part ETag are `db58fc91b938fa4dcd1ec09be458945b`. The restored private object is 221,964,800 bytes, AES256 encrypted, and version `xFW2qTz4qQ5TnXjWWU3U_ud8lRyvc_yf`. The four frontend ETags exactly match the original local files or Terraform-state content; content types and cache controls were preserved. The HTTP website returned 200.
- **EC2/SSM proof:** Both instances reached `running` with EC2 system and instance checks `ok`; both SSM agents returned Online. Hanoi remains in `ap-southeast-1-han-1a`; Singapore remains in `ap-southeast-1a`.
- **Storage proof:** Read-only SSM command `da022f5e-1eac-491f-a0a3-dc4ffff2bb4b` confirmed `/var/lib/hanoi-postgres` is ext4 on `/dev/nvme1n1`, the same resolved device as Terraform volume `vol-0dbf75c6149f5f5f1`. No mount, format, detach, or write was performed.
- **Runtime proof:** Hanoi diagnostic command `d404a57e-6f31-4996-9178-0cb37b12e8f0` found `PG_INITIALIZED=no`, no PostgreSQL credential file, no application containers, and port 8080 unavailable; its instance role successfully read metadata for the restored artifact through the parent-Region S3 endpoint. Singapore command `9cd5c15e-bd4b-4cc5-bebc-4572298f388e` found initialized PostgreSQL, credential-file mode 0600, running `postgres` and `backend`, healthy database connectivity, and AWS_REAL Singapore topology. No secret values were read or printed.
- **IAM/secrets:** Hanoi has exact artifact `GetObject`, exact-secret `PutSecretValue`, and SSM core permissions; Singapore has the same runtime prerequisites plus Hanoi-secret `GetSecretValue`/`DescribeSecret`. Hanoi secret still has zero versions and Singapore has one AWSCURRENT version. Neither is pending deletion.
- **Network:** Current presenter IPv4 is `14.224.239.90`, matching API ingress `14.224.239.90/32`. PostgreSQL remains security-group-to-self on TCP 5432. Singapore port 8080 is reachable and healthy; Hanoi 8080 and hybrid 8081 remain unavailable before repair.
- **Terraform drift:** State remains intact at 48 managed resources. A fresh read-only normal plan proposes `4 add, 10 change, 4 destroy`. The only replacements are the already-reviewed two EC2 user-data replacements and their two attachments; additional S3/object and policy changes are in-place normalization after manual restoration. The reconciliation plan remains forbidden because it would replace both instances.
- **Cost:** With both existing instances running again, the fixed estimate returns to approximately `$0.15303/hour`, plus request/transfer charges.
- **Authorization boundary:** No Terraform apply/destroy/state mutation, IAM/SG change, snapshot, migration, database write, HanoiRuntime, HanoiVerify repair phase, or SingaporeHybrid phase was executed. The recovery lock was released after verification.
- **Status:** RECOVERY PREFLIGHT PASSED — the prepared HanoiRuntime phase can proceed after a fresh explicit approval; HanoiVerify must pass before SingaporeHybrid.

## F-027 — 2026-10-29 — HanoiRuntime submission rejected before remote execution

- **Approved action:** Execute only `invoke-cost-minimal-repair.ps1 -Phase HanoiRuntime -Profile thangvn -Execute -AllowSchemaInitialization` against Hanoi instance `i-07a5107d21ec5654e`, after the mandatory preflight passed under an exclusive operation lock.
- **Failure:** AWS Systems Manager rejected `SendCommand` with `ValidationException` because the wrapper-generated comment `Phase2B-5 reviewed HanoiRuntime script 804e61d77b14b98d692f3fee63010c08e8bf2280b0aab2ba32aa480125dcb903` is 103 characters, exceeding the SSM comment limit of 100 characters.
- **Mutation result:** No SSM Command ID was created and no remote repair command ran. A read-only recent-command query shows only the earlier recovery diagnostics. Hanoi remains running and SSM Online, its database secret still has zero versions, and port 8080 remains unavailable. Singapore Case 1 remains healthy.
- **Stop-condition handling:** The wrapper was not edited and HanoiRuntime was not retried. No schema initialization, secret publication, container start, Terraform operation, SingaporeHybrid action, migration, snapshot, replacement, stop, or destroy occurred.
- **Required remediation:** Shorten the wrapper's non-functional SSM comment to at most 100 characters, re-hash and review the modified wrapper, then obtain fresh explicit approval before resubmitting HanoiRuntime.
- **Status:** BLOCKED BEFORE REMOTE MUTATION — HanoiVerify is not ready because HanoiRuntime did not execute.

## F-028 — 2026-10-29 — Hanoi runtime repaired; CRUD cleanup stopped after partial verification

- **Wrapper correction:** The SSM Comment is now `Phase2B5 <Phase> <16-character script-hash prefix>` and is rejected locally if it exceeds AWS's 100-character limit. HanoiRuntime's actual Comment is 38 characters. The corrected wrapper SHA-256 is `f28b660f4198e68d7a7f364fbc6c5c3dead24941c412a4c8d47d25922a0613a3`; the Hanoi shell script remains unchanged at `804e61d77b14b98d692f3fee63010c08e8bf2280b0aab2ba32aa480125dcb903`.
- **HanoiRuntime:** SSM Command `12181bc4-b46a-469f-837a-3e5a508cf6fb` completed `Success/0` from `2026-10-29T04:34:30.396Z` through `2026-10-29T04:34:52.396Z`. It verified and loaded the approved artifact, initialized PostgreSQL and the synthetic schema on the existing encrypted data volume, published the first secret version without logging its value, and started the healthy backend.
- **HanoiVerify:** SSM Command `c9bc9c1d-3d56-4d32-b5ed-b2540e940cb3` completed `Success/0`. PostgreSQL, mount identity, backend health, and topology passed. External health and topology returned HTTP 200 and identified `AWS_REAL`, `ap-southeast-1-han-1a`, and `same-hanoi-ec2-encrypted-ebs`. The Hanoi secret has one `AWSCURRENT` version.
- **Synthetic CRUD:** API create returned 201 and read returned 200 for synthetic order `4`. Direct SQL update changed it to `confirmed`, but verification Command `0c8dd3ee-74ac-46cf-89b2-2aa74b6722b6` stopped with exit 1 because `psql -Atc ... returning` included command-status output in addition to the returned ID. Delete was not reached. Per the no-retry rule, no second mutation was attempted; synthetic order `4` remains and is readable as `confirmed`.
- **Boundary:** SingaporeHybrid, Terraform apply/destroy, instance restart/replacement, snapshots, and unrelated infrastructure changes were not executed.
- **Status:** HANOI RUNTIME HEALTHY / CASE 2 ACCEPTANCE PENDING — the application is AWS_REAL and healthy, but the explicitly requested full CRUD verification is incomplete until the residual synthetic order is deleted under fresh approval.

## F-029 — 2026-10-29 — Existing API cannot delete the residual Case 2 record; Case 3 preflight passed

- **Order identity:** `GET /api/orders/4` returned HTTP 200 and independently matched the prior CRUD evidence: customer reference `DEMO-VERIFY-20261029-0435`, public ID `1d86e8d1-b799-4cf9-8895-a6891a0b46e8`, and status `confirmed`. It is the synthetic verification record and not a seed or unrelated record.
- **API-only deletion result:** The deployed backend exposes only `GET/POST /api/orders` and `GET /api/orders/:id`. The authorized `DELETE /api/orders/4` returned HTTP 404; a subsequent GET returned HTTP 200. No SQL fallback, source change, or second deletion method was used, so order `4` and all other records remain unchanged.
- **Case 2:** PostgreSQL and the Hanoi API remain healthy and AWS_REAL, but the requested delete verification is incomplete. Case 2 therefore remains `NOT_READY` under the explicit full-CRUD acceptance gate.
- **SingaporeHybrid preflight:** Singapore `i-0cf960f74e80cde33` is running in `ap-southeast-1a`, correctly tagged, and SSM Online. Case 1 PostgreSQL/backend are running and `/health` is healthy. The reviewed backend image exists, no `hybrid-backend` container exists, Hanoi PostgreSQL TCP 5432 is reachable privately at `10.73.64.98`, the shared security group permits only self-referenced PostgreSQL ingress, the Hanoi secret has `AWSCURRENT`, and the Singapore role is allowed `GetSecretValue` and `DescribeSecret`. Read-only preflight Command ID: `a174738b-10bd-40b7-8786-2db52fdb4fb5` (`Success/0`).
- **Prepared phase:** `singapore-hybrid-repair.sh` SHA-256 is `b8e996001e0ce4a3491d3fc79857f4e162a9ca42e3f94c570491aafa6d4bda39`; wrapper SHA-256 is `f28b660f4198e68d7a7f364fbc6c5c3dead24941c412a4c8d47d25922a0613a3`. The phase was previewed only and was not executed.
- **Status:** CASE 2 BLOCKED BY MISSING DELETE API / SINGAPOREHYBRID READY FOR SEPARATE APPROVAL.

## F-030 — 2026-10-29 — Cases 1–3 are AWS_REAL benchmark ready

- **Case 2 acceptance:** Hanoi is `BENCHMARK_READY`. Health and topology return HTTP 200, PostgreSQL is connected on the verified encrypted EBS volume in `ap-southeast-1-han-1a`, and synthetic create/read/update plus database identity passed. DELETE is an application contract `NOT_IMPLEMENTED`; synthetic order `4` remains intentionally untouched.
- **SingaporeHybrid:** SSM Command `760b2a5c-0891-4ce6-8d39-978bc2246f0a` completed `Success/0`. It created only `hybrid-backend` on port 8081, verified Case 1 before and after, and connected to Hanoi PostgreSQL through the private VPC. Hybrid and Hanoi returned the same order `4` public ID, confirming the actual Hanoi database target.
- **AWS_REAL benchmark:** Run `383ff454-5dd0-449f-ab75-b56ba62c0bd3` completed `SUCCEEDED` with 60 excluded warm-ups and 1,200 measured requests across Cases 1–3 and 1/5/10/20 sequential-query groups. All 12 groups recorded 100/100 successful HTTP responses. Client p50 ranges were Singapore `56.656–62.014 ms`, Hanoi `41.905–43.939 ms`, and Hybrid `88.298–773.487 ms`; Hybrid DB p50 scaled from `36.365 ms` at one query to `719.100 ms` at twenty queries.
- **Evidence/UI:** Raw client, application, aggregate DB and individual SQL samples are in `evidence/aws-real-benchmark-20261029-115128-383ff454-5dd0-449f-ab75-b56ba62c0bd3.json` and the latest pointer. `localhost:3000/demo` now discovers all three verified AWS_REAL targets and displays their environment-separated benchmark groups without mixing local emulation.
- **Remaining scope:** Case 4 real migration/cutover and Case 5 snapshot/restore remain unexecuted and require separate explicit approvals.
- **Status:** CASES 1–3 BENCHMARK_READY / CASES 4–5 PENDING.
