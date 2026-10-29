#!/bin/bash
set -euo pipefail
umask 077

readonly EXPECTED_INSTANCE_ID='i-07a5107d21ec5654e'
readonly EXPECTED_VOLUME_ID='vol-0dbf75c6149f5f5f1'
readonly AWS_PARENT_REGION='ap-southeast-1'
readonly EXPECTED_AZ='ap-southeast-1-han-1a'
readonly EXPECTED_BORDER_GROUP='ap-southeast-1-han-1'
readonly ARTIFACT_BUCKET='hanoi-lz-cost-minimal-artifacts-43a7585f4f1bfe44afd6d61c1c'
readonly ARTIFACT_KEY='minimal-images.tar'
readonly ARTIFACT_SHA256='5ed9306375ab7e0cb66d7166db4222ef37d3b0e4c7d0aaf2c238fd6b0402c31f'
readonly DATABASE_SECRET_ID='hanoi-lz-cost-minimal-han-db-87f6505351d3b3533574437a86'
readonly S3_ENDPOINT='https://s3.ap-southeast-1.amazonaws.com'
readonly DATA_DIR='/var/lib/hanoi-postgres'
readonly STATE_DIR='/var/lib/hanoi-lab-repair'
readonly POSTGRES_ENV='/opt/hanoi-lab/postgres.env'

stage() { printf '[repair] %s\n' "$1"; }
fail() { stage "FAILED: $1"; exit 1; }
retry() {
  local max="$1" delay="$2" attempt=1
  shift 2
  until "$@"; do
    [ "$attempt" -lt "$max" ] || return 1
    stage "attempt $attempt/$max failed; retrying in ${delay}s"
    sleep "$delay"
    attempt=$((attempt + 1)); delay=$((delay < 30 ? delay * 2 : 30))
  done
}
instance_id() {
  local token
  token=$(curl -fsS -X PUT -H 'X-aws-ec2-metadata-token-ttl-seconds: 60' http://169.254.169.254/latest/api/token)
  curl -fsS -H "X-aws-ec2-metadata-token: $token" http://169.254.169.254/latest/meta-data/instance-id
}
container_running() { [ "$(docker inspect -f '{{.State.Running}}' "$1" 2>/dev/null || true)" = 'true' ]; }

[ "$(instance_id)" = "$EXPECTED_INSTANCE_ID" ] || fail 'instance identity mismatch'
[ "${ALLOW_SCHEMA_INITIALIZATION:-0}" = '1' ] || fail 'schema initialization was not explicitly enabled'
[ "${PUBLISH_SECRET:-0}" = '0' ] || [ "${PUBLISH_SECRET:-0}" = '1' ] || fail 'invalid PUBLISH_SECRET gate'
stage "target verified: $EXPECTED_INSTANCE_ID ($EXPECTED_AZ, $EXPECTED_BORDER_GROUP)"

normalized_volume_id=$(printf '%s' "$EXPECTED_VOLUME_ID" | tr -d '-')
device="/dev/disk/by-id/nvme-Amazon_Elastic_Block_Store_$normalized_volume_id"
[ -b "$device" ] || fail 'expected EBS device is absent'
mountpoint -q "$DATA_DIR" || fail 'PostgreSQL data path is not mounted; repair will not mount or format it'
mounted_source=$(findmnt -n -o SOURCE --target "$DATA_DIR")
[ "$(readlink -f "$mounted_source")" = "$(readlink -f "$device")" ] || fail 'mounted PostgreSQL path is not the approved EBS volume'
fs_type=$(findmnt -n -o FSTYPE --target "$DATA_DIR")
[ "$fs_type" = 'ext4' ] || fail 'unexpected PostgreSQL filesystem type'
stage 'approved encrypted PostgreSQL data-volume mount verified; no format operation is present'

install -d -m 0700 /opt/hanoi-lab "$STATE_DIR"
artifact_tmp=$(mktemp /opt/hanoi-lab/images.tar.XXXXXX)
trap 'rm -f "$artifact_tmp" "${secret_file:-}"' EXIT
retry 5 2 env -u AWS_ENDPOINT_URL -u AWS_ENDPOINT_URL_S3 aws s3 cp \
  --region "$AWS_PARENT_REGION" --endpoint-url "$S3_ENDPOINT" \
  "s3://$ARTIFACT_BUCKET/$ARTIFACT_KEY" "$artifact_tmp" --only-show-errors || fail 'regional artifact download failed'
printf '%s  %s\n' "$ARTIFACT_SHA256" "$artifact_tmp" | sha256sum --check --status || fail 'artifact SHA-256 mismatch'
docker load --input "$artifact_tmp" >/dev/null
rm -f "$artifact_tmp"
touch "$STATE_DIR/artifact-loaded"
stage 'artifact checksum verified and images loaded'

if [ -s "$DATA_DIR/pgdata/PG_VERSION" ] && [ ! -s "$POSTGRES_ENV" ]; then
  fail 'initialized database exists without its credential file; refusing overwrite'
fi
if [ ! -s "$POSTGRES_ENV" ]; then
  password=$(openssl rand -hex 24)
  cat > "$POSTGRES_ENV" <<ENV
POSTGRES_DB=hanoi_lab
POSTGRES_USER=hanoi_app
POSTGRES_PASSWORD=$password
PGDATA=/var/lib/postgresql/data/pgdata
ENV
  unset password
fi
chmod 0600 "$POSTGRES_ENV"

if ! container_running postgres; then
  docker container inspect postgres >/dev/null 2>&1 && fail 'existing PostgreSQL container is stopped; refusing replacement'
  docker run -d --name postgres --restart unless-stopped --memory 768m \
    --env-file "$POSTGRES_ENV" -p 5432:5432 \
    -v "$DATA_DIR:/var/lib/postgresql/data" postgres:16-alpine >/dev/null
fi
retry 60 5 docker exec postgres pg_isready -U hanoi_app -d hanoi_lab >/dev/null || fail 'PostgreSQL did not become ready'
stage 'PostgreSQL is ready'

if [ "${PUBLISH_SECRET:-0}" = '1' ] && [ ! -f "$STATE_DIR/secret-published" ]; then
  local_password=$(sed -n 's/^POSTGRES_PASSWORD=//p' "$POSTGRES_ENV")
  [ -n "$local_password" ] || fail 'credential file is invalid'
  secret_file=$(mktemp /opt/hanoi-lab/secret.XXXXXX)
  PASSWORD="$local_password" PRIVATE_IP="$(hostname -I | awk '{print $1}')" python3 - "$secret_file" <<'PY'
import json, os, sys
with open(sys.argv[1], 'w', encoding='utf-8') as f:
    json.dump({'engine':'postgres','host':os.environ['PRIVATE_IP'],'port':5432,'dbname':'hanoi_lab','username':'hanoi_app','password':os.environ['PASSWORD']}, f)
PY
  aws secretsmanager put-secret-value --region "$AWS_PARENT_REGION" \
    --secret-id "$DATABASE_SECRET_ID" --secret-string "file://$secret_file" >/dev/null
  rm -f "$secret_file"; unset secret_file local_password
  touch "$STATE_DIR/secret-published"
  stage 'Hanoi database secret version published without emitting its value'
fi

local_password=$(sed -n 's/^POSTGRES_PASSWORD=//p' "$POSTGRES_ENV")
local_url="postgres://hanoi_app:$local_password@127.0.0.1:5432/hanoi_lab"
if [ ! -f "$DATA_DIR/.hanoi-lab-schema-v1" ]; then
  docker run --rm --network host -e DATABASE_URL="$local_url" hanoi-lab-backend:aws \
    node app/backend/dist/migrate.js >/dev/null
  touch "$DATA_DIR/.hanoi-lab-schema-v1"
  stage 'synthetic-demo schema initialized under explicit approval gate'
fi
cat > /opt/hanoi-lab/backend.env <<ENV
DATABASE_URL=$local_url
HOST=0.0.0.0
PORT=8080
NODE_OPTIONS=--max-old-space-size=192
CORS_ALLOWED_ORIGINS=http://hanoi-lab-cost-minimal-3ac377ec1ecda915d89b2a460e.s3-website-ap-southeast-1.amazonaws.com
DEPLOYMENT_MODE=AWS_REAL
AWS_STATUS=CONNECTED
AWS_REGION=$AWS_PARENT_REGION
AWS_AVAILABILITY_ZONE=$EXPECTED_AZ
AWS_NETWORK_BORDER_GROUP=$EXPECTED_BORDER_GROUP
APP_SCENARIO=aws-real-hanoi-colocated
APP_VANTAGE=hanoi-local-zone-ec2
DB_LOCATION=same-hanoi-ec2-encrypted-ebs
INFRASTRUCTURE_PROVENANCE=Terraform cost_minimal repaired by reviewed SSM procedure.
ENV
chmod 0600 /opt/hanoi-lab/backend.env
unset local_password local_url

if ! container_running backend; then
  docker container inspect backend >/dev/null 2>&1 && fail 'existing backend container is stopped; refusing replacement'
  docker run -d --name backend --restart unless-stopped --memory 320m --network host \
    --env-file /opt/hanoi-lab/backend.env hanoi-lab-backend:aws >/dev/null
fi
retry 60 5 curl -fsS http://127.0.0.1:8080/health -o /dev/null || fail 'Hanoi backend health failed'
touch "$STATE_DIR/hanoi-runtime-ready"
stage 'SUCCEEDED: Hanoi PostgreSQL and backend are healthy'
