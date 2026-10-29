#!/bin/bash
set -euo pipefail

readonly EXPECTED_INSTANCE_ID='i-07a5107d21ec5654e'
readonly EXPECTED_VOLUME_ID='vol-0dbf75c6149f5f5f1'
stage() { printf '[verify] %s\n' "$1"; }
fail() { stage "FAILED: $1"; exit 1; }
token=$(curl -fsS -X PUT -H 'X-aws-ec2-metadata-token-ttl-seconds: 60' http://169.254.169.254/latest/api/token)
actual_id=$(curl -fsS -H "X-aws-ec2-metadata-token: $token" http://169.254.169.254/latest/meta-data/instance-id)
[ "$actual_id" = "$EXPECTED_INSTANCE_ID" ] || fail 'instance identity mismatch'
normalized_volume_id=$(printf '%s' "$EXPECTED_VOLUME_ID" | tr -d '-')
device="/dev/disk/by-id/nvme-Amazon_Elastic_Block_Store_$normalized_volume_id"
[ -b "$device" ] || fail 'approved EBS device is absent'
mountpoint -q /var/lib/hanoi-postgres || fail 'data path is not mounted'
mounted_source=$(findmnt -n -o SOURCE --target /var/lib/hanoi-postgres)
[ "$(readlink -f "$mounted_source")" = "$(readlink -f "$device")" ] || fail 'unexpected mounted device'
[ -s /opt/hanoi-lab/postgres.env ] || fail 'PostgreSQL credential file is absent'
[ "$(stat -c '%a' /opt/hanoi-lab/postgres.env)" = '600' ] || fail 'PostgreSQL credential permissions are not 0600'
docker exec postgres pg_isready -U hanoi_app -d hanoi_lab >/dev/null || fail 'PostgreSQL is not ready'
[ "$(docker inspect -f '{{.State.Running}}' backend 2>/dev/null)" = 'true' ] || fail 'backend is not running'
curl -fsS http://127.0.0.1:8080/health -o /dev/null || fail 'backend health failed'
curl -fsS http://127.0.0.1:8080/api/topology -o /dev/null || fail 'topology endpoint failed'
stage 'SUCCEEDED: mount, PostgreSQL, backend health, and topology are ready; no secret values inspected'
