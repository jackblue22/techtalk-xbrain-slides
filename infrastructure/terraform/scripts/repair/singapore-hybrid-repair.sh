#!/bin/bash
set -euo pipefail
umask 077

readonly EXPECTED_INSTANCE_ID='i-0cf960f74e80cde33'
readonly AWS_PARENT_REGION='ap-southeast-1'
readonly HANOI_SECRET_ID='hanoi-lz-cost-minimal-han-db-87f6505351d3b3533574437a86'
readonly HYBRID_ENV='/opt/hanoi-lab/hybrid.env'
stage() { printf '[repair] %s\n' "$1"; }
fail() { stage "FAILED: $1"; exit 1; }
retry() { local max="$1" delay="$2" attempt=1; shift 2; until "$@"; do [ "$attempt" -lt "$max" ] || return 1; sleep "$delay"; attempt=$((attempt+1)); delay=$((delay<30?delay*2:30)); done; }
token=$(curl -fsS -X PUT -H 'X-aws-ec2-metadata-token-ttl-seconds: 60' http://169.254.169.254/latest/api/token)
actual_id=$(curl -fsS -H "X-aws-ec2-metadata-token: $token" http://169.254.169.254/latest/meta-data/instance-id)
[ "$actual_id" = "$EXPECTED_INSTANCE_ID" ] || fail 'instance identity mismatch'
curl -fsS http://127.0.0.1:8080/health -o /dev/null || fail 'healthy Case 1 prerequisite failed; refusing hybrid change'
stage 'Case 1 health verified; postgres and backend containers will not be modified'

if [ "$(docker inspect -f '{{.State.Running}}' hybrid-backend 2>/dev/null || true)" = 'true' ]; then
  curl -fsS http://127.0.0.1:8081/health -o /dev/null || fail 'existing hybrid container is unhealthy; refusing restart'
  stage 'SUCCEEDED: existing hybrid API is already healthy'
  exit 0
fi
docker container inspect hybrid-backend >/dev/null 2>&1 && fail 'existing hybrid container is stopped; refusing replacement'
[ "$(docker image inspect -f '{{.Id}}' hanoi-lab-backend:aws 2>/dev/null || true)" != '' ] || fail 'reviewed backend image is absent'

peer_file=$(mktemp /opt/hanoi-lab/peer-secret.XXXXXX)
trap 'rm -f "$peer_file"' EXIT
fetch_peer() {
  aws secretsmanager get-secret-value --region "$AWS_PARENT_REGION" --secret-id "$HANOI_SECRET_ID" \
    --query SecretString --output text > "$peer_file" 2>/dev/null
  [ -s "$peer_file" ] && [ "$(cat "$peer_file")" != 'None' ]
}
retry 12 5 fetch_peer || fail 'Hanoi secret is unavailable'
PEER_FILE="$peer_file" python3 - > "$HYBRID_ENV" <<'PY'
import json, os, urllib.parse
with open(os.environ['PEER_FILE'], encoding='utf-8') as f:
    s=json.load(f)
required={'host','username','password'}
if not required.issubset(s):
    raise SystemExit('secret schema invalid')
u=urllib.parse.quote(s['username'],safe=''); p=urllib.parse.quote(s['password'],safe='')
print(f"DATABASE_URL=postgres://{u}:{p}@{s['host']}:{s.get('port',5432)}/{s.get('dbname','hanoi_lab')}")
PY
rm -f "$peer_file"; trap - EXIT
cat >> "$HYBRID_ENV" <<'ENV'
HOST=0.0.0.0
PORT=8081
NODE_OPTIONS=--max-old-space-size=192
CORS_ALLOWED_ORIGINS=http://hanoi-lab-cost-minimal-3ac377ec1ecda915d89b2a460e.s3-website-ap-southeast-1.amazonaws.com
DEPLOYMENT_MODE=AWS_REAL
AWS_STATUS=CONNECTED
AWS_REGION=ap-southeast-1
AWS_AVAILABILITY_ZONE=ap-southeast-1a
AWS_NETWORK_BORDER_GROUP=ap-southeast-1
APP_SCENARIO=aws-real-hybrid
APP_VANTAGE=singapore-ec2
DB_LOCATION=hanoi-local-zone-private-postgresql
INFRASTRUCTURE_PROVENANCE=Terraform cost_minimal hybrid path repaired by reviewed SSM procedure.
ENV
chmod 0600 "$HYBRID_ENV"
docker run -d --name hybrid-backend --restart unless-stopped --memory 320m --network host \
  --env-file "$HYBRID_ENV" hanoi-lab-backend:aws >/dev/null
retry 60 5 curl -fsS http://127.0.0.1:8081/health -o /dev/null || fail 'hybrid API did not become healthy; no automatic restart or removal performed'
curl -fsS http://127.0.0.1:8080/health -o /dev/null || fail 'Case 1 health changed after hybrid startup'
stage 'SUCCEEDED: hybrid API is healthy and Case 1 remains healthy'
