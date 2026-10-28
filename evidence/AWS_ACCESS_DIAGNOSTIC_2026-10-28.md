# AWS Access Diagnostic — 2026-10-28

Scope: read-only commands only. Region: `ap-southeast-1`. Account IDs, ARNs, access keys, secrets, tokens, SSO URLs, and credential values were not recorded.

## Credential-provider metadata

AWS CLI `2.34.41` found five profiles. `default` and `gameday` contain static session credential fields; `jack-w6` and `devops-w1` contain static long-lived credential fields; `thangvn` uses an IAM Identity Center SSO session. No AWS credential/profile environment override was set.

Identity output was suppressed during provider testing:

| Profile | Provider class | STS status |
| --- | --- | --- |
| `default` | Static session | `BLOCKED_BY_AUTH` |
| `jack-w6` | Static long-lived | `BLOCKED_BY_AUTH` |
| `devops-w1` | Static long-lived | `BLOCKED_BY_AUTH` |
| `gameday` | Static session | `BLOCKED_BY_AUTH` |
| `thangvn` | IAM Identity Center SSO | `AUTHENTICATED` |

## Hanoi checks using authenticated SSO

| Check | Result |
| --- | --- |
| `sts get-caller-identity` | Authenticated; account/ARN deliberately redacted from this artifact |
| Hanoi zone visibility | `ap-southeast-1-han-1a` returned as `local-zone` |
| Opt-in status | `not-opted-in` |
| Parent zone | `ap-southeast-1c` |
| Instance-type offerings | zero returned while not opted in; do not interpret as plan/account ineligibility |

Conclusion: authentication is resolved through the existing SSO profile. `AWS_REAL` remains gated because the Hanoi Local Zone is not opted in. This task did not authorize or perform opt-in, permission changes, account upgrades, resource creation, or credential modification.
