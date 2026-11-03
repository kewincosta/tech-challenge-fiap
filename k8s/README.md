# Kubernetes

The Helm chart in `k8s/workshop` runs the application in Kubernetes. The CD installs it in the `prod` cluster on EKS, and `scripts/local-cluster.sh` installs it in a kind cluster on your machine. Both installs are the release `workshop` in the namespace `workshop`.

```
k8s/
├── workshop/                 the chart
│   ├── values.yaml           what both environments share
│   ├── values-prod.yaml      prod: TLS to RDS and ElastiCache, a load balancer, Mailpit in the cluster
│   ├── values-local.yaml     the local cluster: the compose containers, a node port, no TLS
│   └── templates/            Deployment, Service, ConfigMap, Secret, HorizontalPodAutoscaler,
│                             the migration hook and Mailpit
└── kind/
    ├── cluster.yaml          the kind cluster: Kubernetes 1.37 and the node port on localhost:18080
    └── metrics-server.yaml   metrics-server for the local cluster, where the autoscaler reads CPU and memory
```

## What the chart installs

| Object                    | What it does                                                                                                                                                                                                           |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Deployment`              | Runs the image as user 1000 with a read-only file system. Liveness calls `/health/live` and readiness calls `/health/ready`. Requests are 250m CPU and 256Mi, limits 1 CPU and 512Mi.                                  |
| `Service`                 | In `prod` a `LoadBalancer` from port 80 to 3000, which AWS serves with a Network Load Balancer. `externalTrafficPolicy: Local` keeps the client's address, which the rate limit counts by. Locally a `NodePort` 30080. |
| `ConfigMap` and `Secret`  | The settings of the pods. The `Secret` holds `DATABASE_PASSWORD` and `JWT_SECRET`, and the `ConfigMap` holds the rest. The pods roll when either changes.                                                              |
| `HorizontalPodAutoscaler` | `autoscaling/v2`, from 2 to 6 replicas, at 70% of the CPU request and 80% of the memory request. The Deployment sets no replica count, so a deploy never resets it.                                                    |
| Migration `Job`           | A `pre-install,pre-upgrade` hook that runs `node dist/migrate.js` before the pods change. A failed migration stops the upgrade and leaves the running pods.                                                            |
| Mailpit                   | A `Deployment` and a `Service` (SMTP on 1025, web on 8025), only where `mailpit.enabled` is true, which is `prod`. The local cluster uses the compose Mailpit.                                                         |

No `Job` seeds data. The SUPER_ADMIN is created by hand, as the section on the database below describes.

Helm starts a hook before it creates the other objects of the release, so the `ConfigMap` and the `Secret` of the release do not exist yet when a first install runs the migration. The hook has a `ConfigMap` and a `Secret` of its own, named `workshop-migrate`, that hold the database settings and nothing else. Helm deletes them when the migration succeeds. The `Job` stays until the next run replaces it, so `kubectl get job workshop-migrate --namespace workshop` shows when the last migration ran. `helm uninstall` leaves that `Job` behind, as it does for any hook.

## Values

`values.yaml` holds what both environments share, and each environment file sets what differs. No file holds a password, a key or a token. What only the deploy knows is passed on the command line, and a render without it stops and names what is missing:

| Key                         | Where the deploy gets it                                     |
| --------------------------- | ------------------------------------------------------------ |
| `image.repository`          | The `repository_url` output of Terraform                     |
| `image.tag`                 | The SHA of the commit that was built                         |
| `config.DATABASE_HOST`      | The `database_host` output                                   |
| `config.DATABASE_PORT`      | The `database_port` output                                   |
| `config.DATABASE_NAME`      | The `database_name` output                                   |
| `config.DATABASE_USER`      | The `database_user` output                                   |
| `config.REDIS_HOST`         | The `redis_host` output                                      |
| `config.REDIS_PORT`         | The `redis_port` output                                      |
| `config.APP_PUBLIC_URL`     | `http://` and the hostname of the load balancer              |
| `secrets.DATABASE_PASSWORD` | The Secrets Manager secret `workshop-prod/database-password` |
| `secrets.JWT_SECRET`        | The Secrets Manager secret `workshop-prod/jwt-secret`        |

The load balancer's hostname exists only once the Service does, so the first install passes a placeholder URL for `config.APP_PUBLIC_URL`, and the release is upgraded with the hostname afterwards. Pass each one with `--set-string`. `--set` reads a commit SHA made of digits only, or of digits with an `e` in the middle, as a number.

Every other key of `config` is an environment variable of the pods, so `--set config.RATE_LIMIT_MAX_REQUESTS=100000` changes the rate limit. An empty value leaves the variable out. The chart wraps each value in quotes, so a number from `--set` arrives as the string the application reads.

## Local cluster

The local cluster runs the chart in kind against the PostgreSQL, Redis and Mailpit of docker compose. Start those three first:

```bash
docker compose up --detach postgres redis mailpit
scripts/local-cluster.sh up
```

`up` takes a few minutes the first time, which includes the download of the kind node image and the build of the application image, and about 15 seconds when nothing changed. It checks that the three compose services run and stops naming the ones that do not, before it creates anything. Then it:

1. creates the kind cluster `workshop` from `k8s/kind/cluster.yaml`, or reuses it;
2. joins the cluster's node to the Docker networks of the compose services, so the pods reach `postgres`, `redis` and `mailpit` by name;
3. installs metrics-server from `k8s/kind/metrics-server.yaml`;
4. builds the image from the working tree and loads it into the node under a tag made from its layers;
5. installs the chart with `values-local.yaml`, the secrets of `.env` and `--wait`. The migration `Job` runs first.

The API answers at `http://localhost:18080`, and `curl http://localhost:18080/health/ready` shows the database and Redis up. A second `up` upgrades the release in place, and the pods roll when the code or a setting changed. Arguments after `up` go to `helm upgrade`, so `scripts/local-cluster.sh up --set config.RATE_LIMIT_MAX_REQUESTS=100000` raises a setting, and a plain `up` puts it back.

The release uses the database `workshop` and the Redis index 0, which are the ones `.env.example` names. `LOCAL_CLUSTER_DATABASE_NAME` and `LOCAL_CLUSTER_REDIS_DB` change them for one run, and `LOCAL_CLUSTER_IMAGE` changes the name the image is built under.

To sign in to the local release, create the SUPER_ADMIN with `npm run seed:admin`, which writes to the database `.env` names, or with the pod command in the section on the prod database, which writes to the database the release uses.

The kubeconfig is `.tools/kind/workshop.kubeconfig`, so `~/.kube/config` stays as it was. `up` prints the line that points `kubectl` at it:

```bash
export KUBECONFIG="$PWD/.tools/kind/workshop.kubeconfig"
scripts/tool.sh kubectl get pods --namespace workshop
```

To remove the cluster and keep the compose containers and their data:

```bash
scripts/local-cluster.sh down
```

Run `down` before `docker compose down`, because the node sits on the compose network and Docker cannot remove a network that has a container on it. kind keeps its own Docker network `kind` after the last cluster is gone, and `docker network rm kind` removes it.

### The tools

`scripts/tool.sh` runs `helm`, `kubectl`, `kind`, `kubeconform` and `k6` at the versions pinned at the top of the script, so Docker is all the machine needs. `helm`, `kubectl` and `kind` are binaries that the script downloads into `.tools/bin` the first time and checks against the checksum their project publishes. `kubeconform` and `k6` run as containers.

## Prod

The CD installs the chart on every merge to `main` with `helm upgrade --install`, and passes the values of the section above:

```bash
helm upgrade --install workshop k8s/workshop --namespace workshop --create-namespace \
  --values k8s/workshop/values-prod.yaml \
  --set-string image.repository="$REPOSITORY_URL" --set-string image.tag="$GITHUB_SHA" \
  --set-string config.DATABASE_HOST="$DATABASE_HOST" --set-string config.DATABASE_PORT="$DATABASE_PORT" \
  --set-string config.DATABASE_NAME="$DATABASE_NAME" --set-string config.DATABASE_USER="$DATABASE_USER" \
  --set-string config.REDIS_HOST="$REDIS_HOST" --set-string config.REDIS_PORT="$REDIS_PORT" \
  --set-string config.APP_PUBLIC_URL="$APP_PUBLIC_URL" \
  --set-string secrets.DATABASE_PASSWORD="$DATABASE_PASSWORD" --set-string secrets.JWT_SECRET="$JWT_SECRET" \
  --wait --timeout 10m
```

The migration runs before the pods change. If it fails, `helm upgrade` stops, the running pods stay, and `--wait` fails the CD run. `kubectl logs job/workshop-migrate --namespace workshop` shows why.

To work in the cluster from your machine, point `kubectl` at it. This needs the AWS CLI, `kubectl` and permission as one of the `cluster_admin_arns`:

```bash
aws eks update-kubeconfig --name workshop-prod --region us-east-1
kubectl get pods --namespace workshop
```

The API is at the hostname of the load balancer:

```bash
kubectl get service workshop --namespace workshop \
  --output jsonpath='{.status.loadBalancer.ingress[0].hostname}'
```

### The Mailpit inbox

The inbox has no public address. Forward its web port to your machine and open `http://localhost:8025`:

```bash
kubectl port-forward --namespace workshop service/workshop-mailpit 8025:8025
```

Mailpit keeps the messages in memory, so a restart of its pod empties the inbox. Inside the cluster its SMTP address is `workshop-mailpit:1025`, in full `workshop-mailpit.workshop.svc.cluster.local`.

### The database

The database accepts connections only from the cluster's nodes, so every way in goes through a pod. The user is the `database_user` output of Terraform, `workshop`, and its password is in Secrets Manager:

```bash
export PGPASSWORD="$(aws secretsmanager get-secret-value --secret-id workshop-prod/database-password \
  --query SecretString --output text)"
export DATABASE_HOST="$(kubectl get configmap workshop --namespace workshop \
  --output jsonpath='{.data.DATABASE_HOST}')"
```

**A `psql` session in a pod.** The pod lives for the session:

```bash
kubectl run psql --namespace workshop --rm --stdin --tty --restart=Never --image=postgres:16-alpine \
  --env PGPASSWORD="$PGPASSWORD" --env PGSSLMODE=require \
  --command -- psql --host "$DATABASE_HOST" --username workshop --dbname workshop
```

**A client on your machine.** A pod relays the connection, and `kubectl port-forward` brings it to a local port:

```bash
kubectl run db-relay --namespace workshop --restart=Never --image=alpine/socat \
  -- tcp-listen:5432,fork,reuseaddr "tcp-connect:$DATABASE_HOST:5432"
kubectl wait --namespace workshop --for=condition=Ready pod/db-relay
kubectl port-forward --namespace workshop pod/db-relay 15432:5432
```

In another terminal, connect any client to `127.0.0.1:15432` with the user `workshop`, the database `workshop` and `sslmode=require`. RDS names its own host in its certificate, so `verify-full` against `127.0.0.1` fails. Stop the port forward and run `kubectl delete pod db-relay --namespace workshop` when you are done.

**The SUPER_ADMIN.** The compiled admin seed creates the account, and does nothing for one that exists. A pod of the image runs it with the settings and the secrets of the release, and the account's own values in a Secret that lives for the run:

```bash
IMAGE="$(kubectl get deployment workshop --namespace workshop \
  --output jsonpath='{.spec.template.spec.containers[0].image}')"
kubectl create secret generic seed-admin --namespace workshop \
  --from-literal=ADMIN_EMAIL=admin@example.com \
  --from-literal=ADMIN_PASSWORD='choose-a-password' \
  --from-literal=ADMIN_DOCUMENT=11144477735
kubectl run seed-admin --namespace workshop --image "$IMAGE" --restart=Never --rm --attach \
  --overrides "$(cat <<EOF
{"spec": {"containers": [{"name": "seed-admin", "image": "$IMAGE",
  "command": ["node", "dist/seed-admin.js"],
  "envFrom": [{"configMapRef": {"name": "workshop"}}, {"secretRef": {"name": "workshop"}},
              {"secretRef": {"name": "seed-admin"}}]}]}}
EOF
)"
kubectl delete secret seed-admin --namespace workshop
```

`ADMIN_PASSWORD` needs 8 characters or more and `ADMIN_DOCUMENT` a valid CPF. Then sign in with `POST /api/v1/auth/sessions`, and create every other record through the API.

## Showing the autoscaler

`k6/board.js` signs in once and lists the board (`GET /api/v1/work-orders?page=1&pageSize=20`) while the number of virtual users climbs. The account needs the `work-orders:read` permission, which the SUPER_ADMIN has. `scripts/tool.sh k6 inspect k6/board.js` checks the scenario without running it.

Every request leaves one machine, and the rate limit counts by address, so the default of 100 requests a minute would answer 429 to most of the load. Raise `RATE_LIMIT_MAX_REQUESTS` for the run and restore it afterwards.

In prod:

```bash
helm upgrade workshop k8s/workshop --namespace workshop --reuse-values \
  --set config.RATE_LIMIT_MAX_REQUESTS=100000 --wait
```

In the local cluster:

```bash
scripts/local-cluster.sh up --set config.RATE_LIMIT_MAX_REQUESTS=100000
```

Watch the replicas in one terminal:

```bash
kubectl get hpa workshop --namespace workshop --watch
```

and run the load in another, against the load balancer's hostname in prod or `http://localhost:18080` locally:

```bash
scripts/tool.sh k6 run -e BASE_URL=http://localhost:18080 \
  -e ADMIN_EMAIL=admin@example.com -e ADMIN_PASSWORD='choose-a-password' k6/board.js
```

The script ramps to 50 users over 2 minutes, holds them for 5 and lets them go in 1. `PEAK_VUS`, `RAMP_UP`, `HOLD` and `RAMP_DOWN` change the stages, such as `-e PEAK_VUS=80 -e HOLD=3m`. The access token lasts 15 minutes, so a run longer than that ends in 401 answers.

The CPU column climbs past 70% and the pods grow from 2 toward 6. The autoscaler waits a minute of sustained load before it adds pods, and five minutes of calm before it removes them, so the count falls back to 2 about five minutes after the run ends.

Restore the limit when you are done. In the local cluster, a plain `scripts/local-cluster.sh up` does it. In prod, `helm rollback` returns to the release before the raise, and any `helm upgrade` that runs without `--reuse-values`, such as a deploy by the CD, drops the override too:

```bash
helm history workshop --namespace workshop
helm rollback workshop --namespace workshop --wait
```
