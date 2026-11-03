#!/usr/bin/env bash
#
# Runs a build tool at a pinned version, so the machine needs only Docker.
#
# Usage:
#   scripts/tool.sh <tool> [args...]
#
# Tools:
#   terraform   scripts/tool.sh terraform -chdir=infra test -no-color -var-file=environments/prod.tfvars
#
# The tool runs in a container as the caller's user and group. The repository is mounted at its own
# path and the caller's directory is the working directory, so a relative path or -chdir works as it
# does on the host. HOME and the tools' caches live under .tools/, which git ignores. The AWS settings
# of the caller (the AWS_* variables and ~/.aws) and the TF_VAR_* variables reach the container.
#
# A tool that ships no image can be a binary downloaded with its checksum into .tools/. Either way
# its version is pinned below and nowhere else.
#
set -euo pipefail

# The one place a tool's version is set.
TERRAFORM_IMAGE='hashicorp/terraform:1.17.1'

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TOOLS="$ROOT/.tools"

fail() {
  printf 'tool: %s\n' "$1" >&2
  exit 1
}

usage() {
  awk 'NR > 1 && /^#/ { sub(/^# ?/, ""); print; next } NR > 1 { exit }' "${BASH_SOURCE[0]}"
}

if [[ $# -eq 0 ]]; then
  usage >&2
  exit 1
fi
case "$1" in
  -h | --help)
    usage
    exit 0
    ;;
esac

TOOL="$1"
shift

command -v docker >/dev/null 2>&1 || fail 'Docker is not installed.'

# Options every tool gets. A tool adds its own below, ending with its image.
mkdir -p "$TOOLS/home"
docker_args=(
  run --rm --interactive
  --user "$(id -u):$(id -g)"
  --volume "$ROOT:$ROOT"
  --workdir "$PWD"
  --env "HOME=$TOOLS/home"
)
if [[ -t 0 && -t 1 ]]; then
  docker_args+=(--tty)
fi
if [[ "$PWD" != "$ROOT" && "$PWD" != "$ROOT"/* ]]; then
  docker_args+=(--volume "$PWD:$PWD")
fi

# --env NAME hands over the caller's value and sets nothing when the caller has none.
for name in AWS_PROFILE AWS_REGION AWS_DEFAULT_REGION AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN; do
  docker_args+=(--env "$name")
done
while IFS= read -r name; do
  docker_args+=(--env "$name")
done < <(compgen -e | grep '^TF_VAR_' || true)

# The container's HOME is not the caller's, so the AWS files go where the SDK looks for them. They
# are read-only: a profile that needs a fresh login gets it with `aws sso login` on the host.
if [[ -d "$HOME/.aws" ]]; then
  mkdir -p "$TOOLS/home/.aws"
  docker_args+=(--volume "$HOME/.aws:$TOOLS/home/.aws:ro")
fi

case "$TOOL" in
  terraform)
    mkdir -p "$TOOLS/terraform/plugin-cache"
    docker_args+=(
      --env "TF_PLUGIN_CACHE_DIR=$TOOLS/terraform/plugin-cache"
      "$TERRAFORM_IMAGE"
    )
    ;;
  *)
    fail "unknown tool '$TOOL'. Try --help."
    ;;
esac

exec docker "${docker_args[@]}" "$@"
