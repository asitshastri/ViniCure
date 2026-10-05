#!/usr/bin/env bash
# Nightly database backup to the private backup bucket (installed as a cron job by deploy.sh).
# A full dump of the database in PostgreSQL's compressed format, streamed straight to S3 (which
# encrypts it); nothing is written to the server's disk. The disk is also snapshotted daily by AWS.
#
# Restore (see docs/runbooks/aws-test-deployment.md): download the file and run pg_restore into a
# fresh database, then check it. A backup that has never been restored is not a backup, so the
# runbook has a drill.
set -euo pipefail

PARAM_PATH="${PARAM_PATH:-/vinicure/test}"
STATE=/opt/vinicure
imds_token() { curl -fsS -X PUT http://169.254.169.254/latest/api/token -H 'X-aws-ec2-metadata-token-ttl-seconds: 60'; }
export AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-$(curl -fsS -H "X-aws-ec2-metadata-token: $(imds_token)" http://169.254.169.254/latest/meta-data/placement/region)}"

BUCKET="$(aws ssm get-parameter --name "$PARAM_PATH/BACKUP_BUCKET" --query Parameter.Value --output text)"
STAMP="$(date -u +%Y/%m/%d/vinicure-%H%M%S)"
KEY="postgres/$STAMP.dump"

cd "$STATE/app"
COMPOSE=(docker compose --env-file "$STATE/compose.env" -f deploy/compose.yml)

# pg_dump as the database administrator inside the container; the password never leaves it.
"${COMPOSE[@]}" exec -T postgres pg_dump --username postgres --dbname vinicure --format custom --no-owner \
  | aws s3 cp - "s3://$BUCKET/$KEY" --sse AES256 --expected-size 1073741824

# A backup that is empty or tiny is a failure, not a success.
SIZE="$(aws s3api head-object --bucket "$BUCKET" --key "$KEY" --query ContentLength --output text)"
if [ "${SIZE:-0}" -lt 10000 ]; then
  echo "backup_failed size=$SIZE key=$KEY" >&2
  exit 1
fi
echo "backup_ok size=$SIZE key=$KEY"
