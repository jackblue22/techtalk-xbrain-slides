# AWS Authentication Recovery

Status: `AUTHENTICATED_ACCESS_NOT_OPTED_IN` on 2026-10-28.

## Secret-safe diagnostic result

- AWS CLI: `2.34.41` on Windows 11.
- No `AWS_PROFILE`, static credential, session-token, config-path, role, web-identity, or container-credential environment override was present.
- Profiles found: `default`, `jack-w6`, `devops-w1`, `gameday`, and `thangvn`.
- `default` and `gameday` use static session fields and failed STS; their temporary credentials are stale or invalid.
- `jack-w6` and `devops-w1` use static long-lived fields and failed STS. Do not copy, print, or refresh these fields in this project.
- `thangvn` uses the recommended IAM Identity Center SSO token-provider configuration and passed STS. No account ID, ARN, access key, secret, token, SSO URL, or cached token was recorded.
- With `--profile thangvn`, `ap-southeast-1-han-1a` is visible as a `local-zone` with `OptInStatus=not-opted-in`. The zero instance-offering result while not opted in is not evidence of account or plan ineligibility.

No credential file, default selection, IAM permission, account setting, or Local Zone opt-in was changed.

## Safe operator workflow

Use the existing SSO profile explicitly; do not rely on the stale default:

```powershell
aws sso login --profile thangvn
aws sts get-caller-identity --profile thangvn
```

The first command opens the AWS IAM Identity Center browser flow and refreshes the local SSO cache. On a different device, the operator may intentionally use:

```powershell
aws sso login --profile thangvn --use-device-code
```

If no SSO profile exists, `aws configure sso --profile <new-name>` is AWS's supported wizard, but it writes configuration and must be run only by the account operator with the correct portal, account, and role details. Do not invent these values.

AWS CLI v2.32+ also supports `aws login` for console-based local-development credentials, but AWS directs IAM Identity Center users to SSO instead. `aws login` may require the `SignInLocalDevelopmentAccess` permission; this project does not request or attach it.

Official references: [IAM Identity Center authentication](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-sso.html) and [AWS CLI browser login](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-sign-in.html).

## Read-only recheck

```powershell
$profile = 'thangvn'
aws sts get-caller-identity --profile $profile
aws ec2 describe-availability-zones --profile $profile --region ap-southeast-1 --all-availability-zones --filters Name=zone-name,Values=ap-southeast-1-han-1a
aws ec2 describe-instance-type-offerings --profile $profile --region ap-southeast-1 --location-type availability-zone --filters Name=location,Values=ap-southeast-1-han-1a
```

These calls are read-only. Stop if STS fails and mark the state `BLOCKED_BY_AUTH`; never infer account ineligibility from authentication failure. If STS works but the zone remains `not-opted-in`, keep `AWS_REAL` deferred. This task does not authorize enabling it.
