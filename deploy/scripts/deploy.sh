#!/usr/bin/env bash
# Deploys ViniCure on the test server. Run on the server, as root, in a Session Manager shell:
#
#   sudo bash /opt/vinicure/app/deploy/scripts/deploy.sh          (first time: sudo /opt/vinicure/clone.sh, see the runbook)
#
# What it does, in order:
#   1. gets the latest code (the GitHub token is read from Parameter Store and never saved to disk)
#   2. builds the two settings files from Parameter Store, making any missing secret
#      (session secret, database and cache passwords, the encryption data key wrapped by KMS)
#   3. builds the images, starts everything (migrations run first) and checks the site answers
# It is safe to run again: secrets that exist are never replaced.
set -euo pipefail

PARAM_PATH="${PARAM_PATH:-/vinicure/test}"
STATE=/opt/vinicure
APP_DIR="$STATE/app"

imds_token() { curl -fsS -X PUT http://169.254.169.254/latest/api/token -H 'X-aws-ec2-metadata-token-ttl-seconds: 60'; }
export AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-$(curl -fsS -H "X-aws-ec2-metadata-token: $(imds_token)" http://169.254.169.254/latest/meta-data/placement/region)}"

say() { printf '\n== %s\n' "$*"; }
die() { printf '\nSTOP: %s\n' "$*" >&2; exit 1; }
param() { aws ssm get-parameter --name "$PARAM_PATH/$1" --with-decryption --query Parameter.Value --output text 2>/dev/null || true; }
have() { [ -n "$(param "$1")" ]; }
put_secret() { aws ssm put-parameter --name "$PARAM_PATH/$1" --type SecureString --value "$2" --no-overwrite >/dev/null; }
random() { LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c "${1:-40}"; }

[ -f "$STATE/.bootstrap-done" ] || die "the server's first-start set-up has not finished yet; wait a few minutes and retry"
[ -d "$APP_DIR/.git" ] || die "the code is not there yet; run: sudo $STATE/clone.sh"

say "1. Latest code"
TOKEN="$(param GITHUB_TOKEN)"
[ -n "$TOKEN" ] || die "set the GITHUB_TOKEN setting first (a read-only GitHub token), see the runbook"
AUTH="$(printf 'x-access-token:%s' "$TOKEN" | base64 -w0)"
git -C "$APP_DIR" -c "http.extraHeader=Authorization: Basic $AUTH" pull --ff-only
git -C "$APP_DIR" log --oneline -1

say "2. Settings and secrets"
# Secrets made once and kept in Parameter Store (encrypted).
for name in AUTH_SECRET POSTGRES_PASSWORD APP_DB_PASSWORD MIGRATOR_DB_PASSWORD VALKEY_PASSWORD; do
  have "$name" || { put_secret "$name" "$(random 48)"; echo "made $name"; }
done
# The application's data key, wrapped by KMS. The plaintext key never reaches this server's disk or
# our hands: KMS returns only the wrapped copy.
if ! have KMS_WRAPPED_KEYS; then
  KMS_ALIAS="$(param KMS_KEY_ID)"
  [ -n "$KMS_ALIAS" ] || die "KMS_KEY_ID is missing (the AWS stack should have made it)"
  WRAPPED="$(aws kms generate-data-key-without-plaintext --key-id "$KMS_ALIAS" --key-spec AES_256 \
    --encryption-context app=vinicure,purpose=data-key,keyId=k1 --query CiphertextBlob --output text)"
  put_secret KMS_WRAPPED_KEYS "k1=$WRAPPED"
  have KMS_CURRENT_KEY_ID || aws ssm put-parameter --name "$PARAM_PATH/KMS_CURRENT_KEY_ID" --type String --value k1 >/dev/null
  echo "made the first data key (k1)"
fi

have APP_URL || die "set the APP_URL setting (for example https://xxxx.cloudfront.net or https://vinicure.com), see the runbook"

umask 077
APP_ENV_FILE="$STATE/app.env"
COMPOSE_ENV_FILE="$STATE/compose.env"
tmp_app="$(mktemp)"; tmp_compose="$(mktemp)"

# Defaults for the test server; a Parameter Store setting with the same name is added after and wins.
cat >"$tmp_app" <<EOF
APP_ENV=staging
CRYPTO_PROVIDER=kms
TRUSTED_PROXY_HOPS=1
LOG_LEVEL=info
CLAMAV_HOST=clamav
CLAMAV_PORT=3310
WORKER_HEALTH_PORT=3001
EOF

# Every Parameter Store setting becomes NAME=value in the app's file, except the ones only the
# containers' start-up needs (those go to compose.env, which the website never sees).
aws ssm get-parameters-by-path --path "$PARAM_PATH" --with-decryption --recursive --output json \
  | jq -r '.Parameters[] | [(.Name | split("/") | last), .Value] | @tsv' \
  | while IFS=$'\t' read -r name value; do
      case "$name" in
        POSTGRES_PASSWORD|MIGRATOR_DB_PASSWORD|APP_DB_PASSWORD|VALKEY_PASSWORD|GITHUB_TOKEN|GITHUB_REPO|BACKUP_BUCKET|SITE_ADDRESS) ;;
        *) printf '%s=%s\n' "$name" "$value" >>"$tmp_app" ;;
      esac
    done
# A value with a line break would corrupt the file: stop instead of writing it.
if grep -qv '^[A-Z][A-Z0-9_]*=' "$tmp_app"; then die "a setting contains a line break or a bad name"; fi

APP_DB_PASSWORD="$(param APP_DB_PASSWORD)"
VALKEY_PASSWORD="$(param VALKEY_PASSWORD)"
{
  printf 'DATABASE_URL=postgres://app:%s@postgres:5432/vinicure\n' "$APP_DB_PASSWORD"
  printf 'VALKEY_URL=redis://:%s@valkey:6379\n' "$VALKEY_PASSWORD"
} >>"$tmp_app"

SITE_ADDRESS_VALUE="$(param SITE_ADDRESS)"
{
  printf 'POSTGRES_PASSWORD=%s\n' "$(param POSTGRES_PASSWORD)"
  printf 'APP_DB_PASSWORD=%s\n' "$APP_DB_PASSWORD"
  printf 'MIGRATOR_DB_PASSWORD=%s\n' "$(param MIGRATOR_DB_PASSWORD)"
  printf 'VALKEY_PASSWORD=%s\n' "$VALKEY_PASSWORD"
  # Plain web on port 80 until a domain is set (a CDN in front gives HTTPS).
  printf 'SITE_ADDRESS=%s\n' "${SITE_ADDRESS_VALUE:-:80}"
} >"$tmp_compose"

install -m 600 "$tmp_app" "$APP_ENV_FILE"
install -m 600 "$tmp_compose" "$COMPOSE_ENV_FILE"
rm -f "$tmp_app" "$tmp_compose"
# Names only: values are never printed.
echo "settings written for the app: $(cut -d= -f1 "$APP_ENV_FILE" | tr '\n' ' ')"

say "3. Build and start (the first build takes several minutes)"
cd "$APP_DIR"
COMPOSE=(docker compose --env-file "$COMPOSE_ENV_FILE" -f deploy/compose.yml)
"${COMPOSE[@]}" build
"${COMPOSE[@]}" up -d --remove-orphans
"${COMPOSE[@]}" ps

say "Waiting for the site to answer"
for i in $(seq 1 60); do
  if curl -fsS -o /dev/null http://127.0.0.1/api/health; then echo "the site is up"; break; fi
  if [ "$i" = 60 ]; then "${COMPOSE[@]}" logs --tail=40 web; die "the site did not come up in 5 minutes"; fi
  sleep 5
done
curl -fsS http://127.0.0.1/api/ready || true
echo

say "4. Nightly database backup"
# 21:00 UTC is 02:30 in India. Output goes to a log file with the date.
cat >/etc/cron.d/vinicure-backup <<CRON
SHELL=/bin/bash
PATH=/usr/local/bin:/usr/bin:/bin
0 21 * * * root bash $APP_DIR/deploy/scripts/backup.sh >>/var/log/vinicure-backup.log 2>&1
CRON
chmod 644 /etc/cron.d/vinicure-backup
echo "backup scheduled (a first one now, to prove it works)"
bash "$APP_DIR/deploy/scripts/backup.sh" || echo "WARNING: the first backup failed, see above"
echo
echo "Done."
