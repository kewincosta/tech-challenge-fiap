#!/usr/bin/env bash
#
# Brings a local environment up from a fresh clone: dependencies, containers, migrations and seed.
#
# Idempotent from end to end. Every step checks what it is about to do and skips it when the work
# is already there, so running this over an environment that is already up changes nothing.
#
# Usage:
#   ./scripts/setup.sh              install, start the containers, migrate and seed
#   ./scripts/setup.sh --rebuild    same, rebuilding the app image first
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

REBUILD=false
for arg in "$@"; do
  case "$arg" in
    --rebuild) REBUILD=true ;;
    -h | --help)
      awk 'NR > 1 && /^#/ { sub(/^# ?/, ""); print; next } NR > 1 { exit }' "${BASH_SOURCE[0]}"
      exit 0
      ;;
    *)
      echo "setup: unknown option '$arg'. Try --help." >&2
      exit 1
      ;;
  esac
done

step() { printf '\n\033[1;34m==>\033[0m %s\n' "$1"; }
info() { printf '    %s\n' "$1"; }
fail() {
  printf '\n\033[1;31mSetup failed:\033[0m %s\n' "$1" >&2
  exit 1
}

# Reads one key out of a dotenv file, without sourcing it.
env_value() {
  local file="$1" key="$2" default="${3:-}"
  local value=""
  if [[ -f "$file" ]]; then
    value="$(sed -n "s/^${key}=//p" "$file" | tail -n 1 | tr -d '\r')"
  fi
  printf '%s' "${value:-$default}"
}

# ---------------------------------------------------------------------------
step 'Checking the prerequisites'

command -v node >/dev/null 2>&1 || fail 'Node is not installed. This project needs Node 22 or newer.'
command -v npm >/dev/null 2>&1 || fail 'npm is not installed.'
command -v docker >/dev/null 2>&1 || fail 'Docker is not installed.'
docker compose version >/dev/null 2>&1 || fail 'Docker Compose v2 is not available (docker compose).'
docker info >/dev/null 2>&1 || fail 'The Docker daemon is not answering. Start Docker and try again.'

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if ((NODE_MAJOR < 22)); then
  fail "Node $(node -v) is too old. This project needs Node 22 or newer."
fi
info "node $(node -v), npm $(npm -v), $(docker compose version --short 2>/dev/null || echo 'docker compose ok')"

# ---------------------------------------------------------------------------
step 'Preparing the .env file'

if [[ -f .env ]]; then
  info '.env already exists, keeping it.'
else
  cp .env.example .env
  info '.env created from .env.example. The defaults match docker-compose.yml.'
fi

# ---------------------------------------------------------------------------
step 'Installing the dependencies'

if [[ -d node_modules ]]; then
  info 'node_modules is already there, skipping npm install.'
else
  npm install
fi

# ---------------------------------------------------------------------------
step 'Starting the containers'

if [[ "$REBUILD" == true ]]; then
  docker compose up -d --build
else
  docker compose up -d
fi

DB_USER="$(env_value .env DATABASE_USER workshop)"
DB_NAME="$(env_value .env DATABASE_NAME workshop)"
TEST_DB_NAME="$(env_value .env.test DATABASE_NAME "${DB_NAME}_test")"

step 'Waiting for PostgreSQL and Redis'

for _ in $(seq 1 60); do
  if docker compose exec -T postgres pg_isready -U "$DB_USER" -d "$DB_NAME" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
docker compose exec -T postgres pg_isready -U "$DB_USER" -d "$DB_NAME" >/dev/null 2>&1 ||
  fail "PostgreSQL did not answer within 60s. Check 'docker compose logs postgres'."
info "postgres is accepting connections on database '$DB_NAME'."

for _ in $(seq 1 30); do
  if [[ "$(docker compose exec -T redis redis-cli ping 2>/dev/null | tr -d '\r')" == 'PONG' ]]; then
    break
  fi
  sleep 1
done
[[ "$(docker compose exec -T redis redis-cli ping 2>/dev/null | tr -d '\r')" == 'PONG' ]] ||
  fail "Redis did not answer within 30s. Check 'docker compose logs redis'."
info 'redis is answering PONG.'

# ---------------------------------------------------------------------------
step 'Making sure the test database exists'

# docker/postgres/init/ only runs on the first initialisation of the data directory. A volume that
# predates that script has no test database, and the integration and e2e suites fail to connect.
if docker compose exec -T postgres psql -U "$DB_USER" -d postgres -tAc \
  "SELECT 1 FROM pg_database WHERE datname = '${TEST_DB_NAME}'" 2>/dev/null | grep -q 1; then
  info "'${TEST_DB_NAME}' already exists."
else
  docker compose exec -T postgres psql -U "$DB_USER" -d postgres \
    -c "CREATE DATABASE ${TEST_DB_NAME} OWNER ${DB_USER}" >/dev/null
  info "'${TEST_DB_NAME}' created. The test suites run their own migrations on it."
fi

# ---------------------------------------------------------------------------
step 'Running the migrations'
npm run migration:run

step 'Seeding the users and the demo data'
npm run seed

# ---------------------------------------------------------------------------
APP_PORT="$(env_value .env APP_HOST_PORT 13000)"

printf '\n\033[1;32mEnvironment ready.\033[0m\n\n'
printf '  API           http://localhost:%s/api/v1\n' "$APP_PORT"
printf '  Swagger       http://localhost:%s/api/docs\n' "$APP_PORT"
printf '  PostgreSQL    localhost:%s\n' "$(env_value .env POSTGRES_HOST_PORT 15432)"
printf '  Redis         localhost:%s\n\n' "$(env_value .env REDIS_HOST_PORT 16379)"
printf '  Accounts       one per role, listed by npm run seed above\n'
printf '  Tests          npm run test:unit | test:integration | test:e2e\n\n'
