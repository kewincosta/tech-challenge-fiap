# 0040. The application runs in Kubernetes as a Helm chart

**Status**: Accepted
**Source**: AD-024 in `.specs/STATE.md`
**Recorded**: 2026-11-03, from AD-024, taken on 2026-11-02 during the `phase-2-infrastructure` feature

## Context

The Phase 2 brief asks for Kubernetes manifests with Deployments, Services, ConfigMaps, Secrets and a
Horizontal Pod Autoscaler that follows CPU and memory. The application had nothing a cluster could
probe, and its migrations and admin seed ran only through development tooling that the production
image does not carry.

The user chose on 2026-11-02: Helm for the manifests, a Service of type LoadBalancer as the most
practical way out with no domain ("Qual é a forma mais pratica aqui? Não preciso de um dominio"),
Mailpit inside the cluster for the e-mails, and kind for a local cluster. The user also decided what
`prod` does not hold: "Em prod tudo deve ser criado na mão", and "Eu acesso o banco de prod e rodo um
script de seed ou crio o super admin na mão".

## Decision

The application deploys as the chart `k8s/workshop`, with `values.yaml` for what both environments
share, `values-prod.yaml` and `values-local.yaml`. The release and its namespace are both called
`workshop`. The templates are the manifests the brief asks for, rendered for each environment.

The probes are `GET /health/live`, which answers 200 while the process runs, and
`GET /health/ready`, which answers 200 when the database and Redis each answer within 2 seconds and
503 otherwise. Both skip the authentication and the rate limit. The application makes the two checks
itself, with no `@nestjs/terminus`. The image runs `node dist/migrate.js` and `node dist/seed-admin.js`
from compiled code, as the user `node`.

The Deployment has liveness, readiness and startup probes, requests of 250m CPU and 256Mi and limits of
1 CPU and 512Mi, user 1000 with a read-only root file system, and a rolling update with no unavailable
pod. A `preStop` sleep keeps a leaving pod serving until the Service stops sending it traffic, before
it gets SIGTERM. A checksum annotation rolls the pods when the ConfigMap or the Secret changes. The
Secret holds `DATABASE_PASSWORD` and `JWT_SECRET`, and the ConfigMap holds every other setting.

In `prod` the Service is a LoadBalancer from port 80 to 3000, which AWS serves with a Network Load
Balancer. `externalTrafficPolicy: Local` keeps the client's address, which the rate limit counts by.
In the local cluster the Service is a NodePort published on `localhost:18080`.

The HorizontalPodAutoscaler is `autoscaling/v2`, from 2 to 6 replicas, at 70% of the CPU request and
80% of the memory request. It waits a minute of sustained load before it adds pods, so the CPU that a
starting pod uses does not look like load. The Deployment sets no replica count, so a deploy never
resets what the autoscaler decided.

A `Job` runs `node dist/migrate.js` as a `pre-install,pre-upgrade` hook, so the schema changes before
the pods do. It has `backoffLimit: 2` and `activeDeadlineSeconds: 300`.

Mailpit has a Deployment and a Service (SMTP on 1025, web on 8025) where `mailpit.enabled` is true,
which is `prod`. Its inbox has no public address and lives in memory.

No Job runs a seed. In `prod` the user reaches the database through the cluster and creates the
SUPER_ADMIN by hand, or with the compiled admin seed run from a pod of the image
([ADR 0012](0012-super-administrator-created-outside-the-api.md)). Locally `npm run seed` stays.

Helm starts a hook before it creates the other objects of the release, so the ConfigMap and the
Secret of the release do not exist yet when a first install runs the migration. The hook has copies of
its own, `workshop-migrate`, that are hooks of a lower weight. They hold the database settings and
nothing else, and Helm deletes them when the migration succeeds.

The deploy passes the values that only it knows: `image.repository`, `image.tag`, the database host,
port, name and user, the Redis host and port, `config.APP_PUBLIC_URL`, `secrets.DATABASE_PASSWORD` and
`secrets.JWT_SECRET`. No values file holds a secret, and a render without any of them stops with one
message that names every missing value. Each goes in with `--set-string`, because `--set` reads a
commit SHA made of digits only as a number. The deploy never passes `--reuse-values`, so a change made
to a release by hand disappears at the next deploy. The load balancer's hostname exists only once the
Service does, so the first install passes a placeholder URL and an upgrade follows with the hostname.

`scripts/local-cluster.sh up` makes the local cluster. It creates the kind cluster `workshop` on a
node image of the Kubernetes version that `prod.tfvars` pins
([ADR 0038](0038-infrastructure-on-aws-provisioned-by-terraform.md)), installs metrics-server from a
manifest kept in the repository, builds the image from the working tree, loads it under a tag made
from its layers, and installs the chart with the local values, whose pods reach the compose
PostgreSQL, Redis and Mailpit by name. kind points the DNS of its node at Docker's, which answers for
the containers on the networks the node is on, so the script joins the node to the networks of those
compose services. It takes the secrets from `.env` and writes a kubeconfig of its own under
`.tools/kind`, so `~/.kube/config` stays as it was. `down` deletes the cluster and leaves the
compose containers and their data.

kind, kubectl and Helm ship no image that reaches a kind cluster, so they run as binaries that
`scripts/tool.sh` downloads into `.tools/bin` and checks against the checksum their projects publish.
Terraform, kubeconform, k6 and actionlint run as containers. The versions are pinned at the top of the
script. Helm 4.3.1 is the only version the chart has run with.

`k6/board.js` signs in once and lists the board under a growing load, so `kubectl get hpa` shows the
replicas follow. The rate limit counts by address and every request leaves one machine, so the steps
in `k8s/README.md` raise `RATE_LIMIT_MAX_REQUESTS` for the run and restore the release afterwards.

## Alternatives

Kustomize with plain YAML overlays was rejected, and the user chose Helm. The brief's manifests are
the chart's templates, rendered for each environment and applied with `helm upgrade --install`.

A Job that seeds data was rejected. What `prod` holds is created by hand, and locally `npm run seed`
does the work.

k3s and minikube for the local cluster were rejected, and the user chose kind.

An Ingress behind the AWS Load Balancer Controller was rejected. It needs a controller in the cluster
and, in practice, a domain, and the user needs neither. The Service of type LoadBalancer is the
option with nothing to install.

`@nestjs/terminus` was rejected for the probes. The application makes two checks, and a dependency is
more than two checks need.

## Consequences

Helm templates are Go templates that only look like YAML, so Prettier skips them. The chart is
checked by rendering it with both values files, by `helm lint`, and by `kubeconform` in strict mode
against the Kubernetes version of `prod`.

A migration that fails stops the upgrade and leaves the running pods in place, and `--wait` fails the
CD run. `kubectl logs job/workshop-migrate --namespace workshop` shows why. `helm uninstall` leaves
the migration Job behind, as it does for any hook.

The local cluster needs the compose containers running first. Its node sits on their networks, so
`scripts/local-cluster.sh down` has to run before `docker compose down`, because Docker cannot remove
a network that has a container on it.

Mailpit keeps its messages in memory, so a restart of its pod empties the inbox.

The autoscaler has two nodes to work in and no cluster autoscaler beside it. They hold the six
replicas the chart allows and nothing beyond that.

Showing the autoscaler takes a raised rate limit, and a `helm rollback` to restore it.
