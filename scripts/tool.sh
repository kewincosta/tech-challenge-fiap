#!/usr/bin/env bash
#
# Runs a build tool at a pinned version, so the machine needs only Docker.
#
# Usage:
#   scripts/tool.sh <tool> [args...]
#
# Tools:
#   terraform    scripts/tool.sh terraform -chdir=infra test -no-color -var-file=environments/prod.tfvars
#   helm         scripts/tool.sh helm template workshop k8s/workshop -f k8s/workshop/values-local.yaml
#   kubectl      scripts/tool.sh kubectl get pods --namespace workshop
#   kind         scripts/tool.sh kind get clusters
#   kubeconform  helm template ... | scripts/tool.sh kubeconform -strict -kubernetes-version 1.37.0 -
#   k6           scripts/tool.sh k6 inspect k6/board.js
#
# terraform, kubeconform and k6 run in a container as the caller's user and group. The repository is
# mounted at its own path and the caller's directory is the working directory, so a relative path or
# -chdir works as it does on the host. HOME and the tools' caches live under .tools/, which git
# ignores. The AWS settings of the caller (the AWS_* variables and ~/.aws) and the TF_VAR_*
# variables reach the container. k6 shares the host's network, so localhost is the caller's.
#
# kind, kubectl and helm ship no image that reaches a kind cluster, so they run on the host: each is
# a binary downloaded into .tools/bin the first time and checked against the SHA-256 its project
# publishes. They read the caller's KUBECONFIG like the tools they stand for. Either way a tool's
# version is pinned below and nowhere else.
#
set -euo pipefail

# The one place a tool's version is set.
TERRAFORM_IMAGE='hashicorp/terraform:1.17.1'
KUBECONFORM_IMAGE='ghcr.io/yannh/kubeconform:v0.8.0'
K6_IMAGE='grafana/k6:2.3.0'
KIND_VERSION='v0.33.0'
KUBECTL_VERSION='v1.37.2'
HELM_VERSION='v4.3.1'

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TOOLS="$ROOT/.tools"

fail() {
  printf 'tool: %s\n' "$1" >&2
  exit 1
}

usage() {
  awk 'NR > 1 && /^#/ { sub(/^# ?/, ""); print; next } NR > 1 { exit }' "${BASH_SOURCE[0]}"
}

sha256() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{ print $1 }'
  else
    shasum -a 256 "$1" | awk '{ print $1 }'
  fi
}

# Prints the path of a tool's binary, downloading it first when .tools/bin does not hold it. The
# file is named after the version, so a new pin fetches a new binary. The checksum file holds the
# hash first on its line, with or without the file name after it. The caller runs it in a command
# substitution, so the exit trap removes the scratch directory however the function ends.
#   binary <name> <version> <url> <checksum-url> [<path of the binary inside the archive>]
binary() {
  set -e # A command substitution drops errexit, and this function always runs in one.
  local name="$1" version="$2" url="$3" checksum_url="$4" member="${5:-}"
  local os arch
  case "$(uname -s)" in
    Linux) os=linux ;;
    Darwin) os=darwin ;;
    *) fail "$name has no download for $(uname -s)." ;;
  esac
  case "$(uname -m)" in
    x86_64 | amd64) arch=amd64 ;;
    aarch64 | arm64) arch=arm64 ;;
    *) fail "$name has no download for $(uname -m)." ;;
  esac
  url="${url//@OS@/$os}"
  url="${url//@ARCH@/$arch}"
  checksum_url="${checksum_url//@OS@/$os}"
  checksum_url="${checksum_url//@ARCH@/$arch}"
  member="${member//@OS@/$os}"
  member="${member//@ARCH@/$arch}"

  local file="$TOOLS/bin/$name-$version-$os-$arch"
  if [[ ! -x "$file" ]]; then
    command -v curl >/dev/null 2>&1 || fail 'curl is not installed.'
    mkdir -p "$TOOLS/bin"
    local scratch expected
    scratch="$(mktemp -d "$TOOLS/bin/download.XXXXXX")"
    trap "rm -rf '$scratch'" EXIT
    curl --fail --silent --show-error --location --retry 3 --output "$scratch/download" "$url" >&2 ||
      fail "could not download $url."
    expected="$(curl --fail --silent --show-error --location --retry 3 "$checksum_url" |
      awk '{ print $1; exit }')" || fail "could not download $checksum_url."
    [[ -n "$expected" && "$expected" == "$(sha256 "$scratch/download")" ]] ||
      fail "$url does not match the SHA-256 its project publishes."
    if [[ -n "$member" ]]; then
      tar -xzf "$scratch/download" -C "$scratch" "$member"
      mv "$scratch/$member" "$scratch/download"
    fi
    chmod +x "$scratch/download"
    mv -f "$scratch/download" "$file"
  fi
  printf '%s\n' "$file"
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

# Options every container tool gets. A tool adds its own below, ending with its image.
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
  kubeconform)
    docker_args+=("$KUBECONFORM_IMAGE")
    ;;
  k6)
    # k6 sends no usage report, and shares the host's network so that localhost:18080 is the local cluster.
    docker_args+=(
      --network host
      --env K6_NO_USAGE_REPORT=true
      "$K6_IMAGE"
    )
    ;;
  kind)
    kind="$(binary kind "$KIND_VERSION" \
      "https://github.com/kubernetes-sigs/kind/releases/download/$KIND_VERSION/kind-@OS@-@ARCH@" \
      "https://github.com/kubernetes-sigs/kind/releases/download/$KIND_VERSION/kind-@OS@-@ARCH@.sha256sum")"
    exec "$kind" "$@"
    ;;
  kubectl)
    kubectl="$(binary kubectl "$KUBECTL_VERSION" \
      "https://dl.k8s.io/release/$KUBECTL_VERSION/bin/@OS@/@ARCH@/kubectl" \
      "https://dl.k8s.io/release/$KUBECTL_VERSION/bin/@OS@/@ARCH@/kubectl.sha256")"
    export KUBECACHEDIR="$TOOLS/kube/cache"
    exec "$kubectl" "$@"
    ;;
  helm)
    helm="$(binary helm "$HELM_VERSION" \
      "https://get.helm.sh/helm-$HELM_VERSION-@OS@-@ARCH@.tar.gz" \
      "https://get.helm.sh/helm-$HELM_VERSION-@OS@-@ARCH@.tar.gz.sha256sum" \
      '@OS@-@ARCH@/helm')"
    export HELM_CACHE_HOME="$TOOLS/helm/cache" HELM_CONFIG_HOME="$TOOLS/helm/config"
    export HELM_DATA_HOME="$TOOLS/helm/data" KUBECACHEDIR="$TOOLS/kube/cache"
    exec "$helm" "$@"
    ;;
  *)
    fail "unknown tool '$TOOL'. Try --help."
    ;;
esac

exec docker "${docker_args[@]}" "$@"
