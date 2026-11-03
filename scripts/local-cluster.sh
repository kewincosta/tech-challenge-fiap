#!/usr/bin/env bash
#
# Makes and removes the local cluster: a kind cluster that runs the chart against the PostgreSQL,
# Redis and Mailpit of docker compose.
#
# Usage:
#   scripts/local-cluster.sh up [helm arguments]
#   scripts/local-cluster.sh down
#
# up    Needs the compose PostgreSQL, Redis and Mailpit running (docker compose up --detach postgres
#       redis mailpit). It creates the kind cluster "workshop", or reuses it, installs
#       metrics-server, builds the image from the working tree, loads it into the cluster and
#       installs the chart with k8s/workshop/values-local.yaml. Run it again to upgrade the release
#       in place. The arguments go on to helm upgrade, such as
#       --set config.RATE_LIMIT_MAX_REQUESTS=100000. The API answers at http://localhost:18080.
# down  Deletes the cluster. The compose containers and their data stay as they are.
#
# The kubeconfig is .tools/kind/workshop.kubeconfig and never ~/.kube/config. DATABASE_PASSWORD and
# JWT_SECRET come from .env, because no values file holds a secret. The environment can change:
#   LOCAL_CLUSTER_DATABASE_NAME  the database the release uses, workshop
#   LOCAL_CLUSTER_REDIS_DB       the Redis index the release uses, 0
#   LOCAL_CLUSTER_IMAGE          the name and tag the image is built under, workshop:local
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TOOL="$ROOT/scripts/tool.sh"
CLUSTER=workshop
NAMESPACE=workshop
RELEASE=workshop
NODE="$CLUSTER-control-plane"
# The compose services the pods reach by name.
COMPOSE_SERVICES=(postgres redis mailpit)
KUBECONFIG_FILE="$ROOT/.tools/kind/$CLUSTER.kubeconfig"

fail() {
  printf 'local-cluster: %s\n' "$1" >&2
  exit 1
}

usage() {
  awk 'NR > 1 && /^#/ { sub(/^# ?/, ""); print; next } NR > 1 { exit }' "${BASH_SOURCE[0]}"
}

# Every tool reads this file, so nothing here touches ~/.kube/config.
export KUBECONFIG="$KUBECONFIG_FILE"

tool() {
  "$TOOL" "$@"
}

sha256_of_text() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum | awk '{ print $1 }'
  else
    shasum -a 256 | awk '{ print $1 }'
  fi
}

display_name() {
  case "$1" in
    postgres) echo PostgreSQL ;;
    redis) echo Redis ;;
    mailpit) echo Mailpit ;;
  esac
}

# The id of the running container of a compose service, from the project docker compose finds in
# this folder (COMPOSE_PROJECT_NAME and .env choose another).
compose_container() {
  docker compose ps --status running --quiet "$1" | head -n 1
}

# The names of the networks a container is on.
networks_of() {
  docker inspect --format '{{range $name, $_ := .NetworkSettings.Networks}}{{$name}}{{"\n"}}{{end}}' "$1"
}

cluster_exists() {
  local clusters
  clusters="$(tool kind get clusters 2>/dev/null)"
  grep -qx "$CLUSTER" <<<"$clusters"
}

# The value NAME has in .env, without the quotes around it. The last assignment wins.
dotenv_value() {
  local value
  value="$(sed -n -E "s/^[[:space:]]*(export[[:space:]]+)?$1=(.*)$/\2/p" "$ROOT/.env" | tail -n 1)"
  case "$value" in
    \"*\")
      value="${value%\"}"
      value="${value#\"}"
      ;;
    \'*\')
      value="${value%\'}"
      value="${value#\'}"
      ;;
    *) value="$(printf '%s' "$value" | sed -E 's/[[:space:]]+#.*$//; s/[[:space:]]+$//')" ;;
  esac
  printf '%s' "$value"
}

# A YAML string that holds the text as it is.
yaml_quote() {
  printf "'%s'" "${1//\'/\'\'}"
}

require_compose_services() {
  docker compose version >/dev/null 2>&1 || fail 'the docker compose plugin is not installed.'
  local service missing=()
  for service in "${COMPOSE_SERVICES[@]}"; do
    [[ -n "$(compose_container "$service")" ]] || missing+=("$(display_name "$service")")
  done
  if ((${#missing[@]} > 0)); then
    local list
    list="$(printf '%s, ' "${missing[@]}")"
    fail "not running in docker compose: ${list%, }. Start them with: docker compose up --detach ${COMPOSE_SERVICES[*]}"
  fi
}

create_cluster() {
  mkdir -p "$(dirname "$KUBECONFIG_FILE")"
  if cluster_exists; then
    if [[ "$(docker inspect --format '{{.State.Running}}' "$NODE")" != true ]]; then
      docker start "$NODE" >/dev/null
    fi
    tool kind export kubeconfig --name "$CLUSTER" --kubeconfig "$KUBECONFIG_FILE"
    tool kubectl wait --for=condition=Ready node --all --timeout 120s
  else
    rm -f "$KUBECONFIG_FILE"
    tool kind create cluster --name "$CLUSTER" --config "$ROOT/k8s/kind/cluster.yaml" \
      --kubeconfig "$KUBECONFIG_FILE" --wait 120s
  fi
  chmod 600 "$KUBECONFIG_FILE"
}

# kind points the DNS of its node at Docker's, which answers for the containers on the networks the
# node is on. Joining the node to the networks of the compose services lets the pods reach postgres,
# redis and mailpit by name. The node goes with the cluster, and so does its place on them.
join_compose_networks() {
  local service networks network joined
  for service in "${COMPOSE_SERVICES[@]}"; do
    networks="$(networks_of "$(compose_container "$service")")"
    while IFS= read -r network; do
      case "$network" in
        '' | bridge | host | none) continue ;;
      esac
      joined="$(networks_of "$NODE")"
      if ! grep -qx -- "$network" <<<"$joined"; then
        docker network connect "$network" "$NODE"
      fi
    done <<<"$networks"
  done
}

install_metrics_server() {
  tool kubectl apply --filename "$ROOT/k8s/kind/metrics-server.yaml" >/dev/null
  tool kubectl --namespace kube-system rollout status deployment/metrics-server --timeout 180s
}

# Builds the image and loads it into the node under a tag that follows its layers, so the pods roll
# when the code changed and stay when it did not. Sets IMAGE_TAG.
load_image() {
  local image="$1" repository="${1%:*}"
  docker build --tag "$image" "$ROOT"
  IMAGE_TAG="$(docker image inspect --format '{{json .RootFS.Layers}}' "$image" | sha256_of_text | cut -c1-12)"
  docker tag "$image" "$repository:$IMAGE_TAG"
  tool kind load docker-image "$repository:$IMAGE_TAG" --name "$CLUSTER"
  docker rmi "$repository:$IMAGE_TAG" >/dev/null
}

up() {
  [[ -f "$ROOT/.env" ]] || fail 'there is no .env. Copy .env.example to .env.'
  require_compose_services

  local password jwt_secret
  password="$(dotenv_value DATABASE_PASSWORD)"
  jwt_secret="$(dotenv_value JWT_SECRET)"
  [[ -n "$password" ]] || fail 'DATABASE_PASSWORD is not set in .env.'
  ((${#jwt_secret} >= 32)) || fail 'JWT_SECRET in .env is missing or shorter than 32 characters.'

  create_cluster
  join_compose_networks
  install_metrics_server

  local image="${LOCAL_CLUSTER_IMAGE:-workshop:local}"
  load_image "$image"

  # The secrets go through a file only this user reads, so they stay out of the process list.
  local values
  values="$(mktemp "$(dirname "$KUBECONFIG_FILE")/values.XXXXXX")"
  trap "rm -f '$values'" EXIT
  {
    printf 'secrets:\n  DATABASE_PASSWORD: %s\n  JWT_SECRET: %s\n' \
      "$(yaml_quote "$password")" "$(yaml_quote "$jwt_secret")"
    printf 'config:\n'
    printf '  DATABASE_NAME: %s\n' "$(yaml_quote "${LOCAL_CLUSTER_DATABASE_NAME:-workshop}")"
    printf '  REDIS_DB: %s\n' "$(yaml_quote "${LOCAL_CLUSTER_REDIS_DB:-0}")"
  } >"$values"

  tool helm upgrade --install "$RELEASE" "$ROOT/k8s/workshop" \
    --namespace "$NAMESPACE" --create-namespace \
    --values "$ROOT/k8s/workshop/values-local.yaml" --values "$values" \
    --set-string "image.repository=${image%:*}" --set-string "image.tag=$IMAGE_TAG" \
    --wait --timeout 5m "$@"

  cat <<EOF

The local cluster is ready.
  API         http://localhost:18080 (health: http://localhost:18080/health/ready)
  kubeconfig  $KUBECONFIG_FILE

To use kubectl with it:
  export KUBECONFIG="$KUBECONFIG_FILE"
  scripts/tool.sh kubectl get pods --namespace $NAMESPACE

To remove the cluster, with the compose containers left running:
  scripts/local-cluster.sh down
EOF
}

down() {
  if cluster_exists; then
    tool kind delete cluster --name "$CLUSTER" --kubeconfig "$KUBECONFIG_FILE"
  else
    echo "There is no cluster named $CLUSTER."
  fi
  rm -f "$KUBECONFIG_FILE"
}

case "${1:-}" in
  up)
    shift
    cd "$ROOT"
    up "$@"
    ;;
  down)
    cd "$ROOT"
    down
    ;;
  -h | --help)
    usage
    ;;
  *)
    usage >&2
    exit 1
    ;;
esac
