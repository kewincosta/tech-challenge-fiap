# Phase 2 infrastructure checks

Build: `npm run build`; `npm run lint`
Run unit: `npx vitest run --config vitest.config.ts --reporter=verbose src/config health`
Run e2e: `npx vitest run --config vitest.e2e.config.ts --reporter=verbose health`
Run infra: `npx vitest run --config vitest.infra.config.ts --reporter=verbose test/infra/static`
Run image: `npx vitest run --config vitest.infra.config.ts --reporter=verbose test/infra/runtime/image`
Run tls: `npx vitest run --config vitest.infra.config.ts --reporter=verbose test/infra/runtime/tls`
Run compose: `npx vitest run --config vitest.infra.config.ts --reporter=verbose test/infra/runtime/compose`
Run cluster: `npx vitest run --config vitest.infra.config.ts --reporter=verbose test/infra/runtime/local-cluster`
Run terraform: `scripts/tool.sh terraform -chdir=infra init -backend=false -input=false -no-color && scripts/tool.sh terraform -chdir=infra test -no-color -var-file=environments/prod.tfvars`
Run bootstrap: `scripts/tool.sh terraform -chdir=infra/bootstrap init -backend=false -input=false -no-color && scripts/tool.sh terraform -chdir=infra/bootstrap test -no-color`
Plan: `.specs/features/phase-2-infrastructure/plan.md`

The infra specs run under `vitest.infra.config.ts`, a configuration of their own that `npm run test:unit`, the integration and e2e suites and the CI do not load. Every tool they need (Terraform, Helm, kubectl, kind, kubeconform, actionlint, k6) runs through `scripts/tool.sh` at a pinned version, as a Docker image or as a binary downloaded with its checksum into `.tools/`, so the machine needs only Docker. The static group renders the chart and reads files. The runtime groups start containers and never touch `workshop`, `workshop_test` or their Redis indexes: the image and TLS specs start throwaway PostgreSQL and Redis containers on free ports; the compose spec runs the stack under a compose project of its own, with free host ports and a volume of its own; the cluster spec uses the compose PostgreSQL and Redis with a database it creates and drops and a Redis index of its own, and refuses to start while a kind cluster named `workshop` exists. The unit run selects `src/config` and every spec whose path holds `health`, so the TLS settings are mapped and tested in `src/config`.

78 checks in 6 slices · 6 one-way doors · 0 open, of which 0 block

## Checks

### S1 - The application is ready for a cluster

**C1** - `GET /health/live` with no token answers 200 `{ "status": "ok" }` (AC 1)
Proof: run e2e | ✓ Health endpoints > answers live with 200 and status ok with no token

**C2** - One call more than the limit `RATE_LIMIT_MAX_REQUESTS` sets, made to `GET /health/live` within one window, all answer 200 (AC 1)
Proof: run e2e | ✓ Health endpoints > answers live beyond the rate limit

**C3** - One call more than the same limit, made to `GET /health/ready` within one window, all answer 200 (Surface)
Proof: run e2e | ✓ Health endpoints > answers ready beyond the rate limit

**C4** - `GET /health/ready` with no token, the database and Redis answering, returns 200 `{ "status": "ok", "checks": { "database": "up", "redis": "up" } }` (AC 2)
Proof: run e2e | ✓ Health endpoints > answers ready with 200 when the database and Redis answer

**C5** - With Redis unreachable, `GET /health/ready` answers 503 `{ "status": "error", "checks": { "database": "up", "redis": "down" } }`; with the database unreachable, 503 with `"status": "error"` and `database` "down" (AC 3)
Proof: run e2e | ✓ Health endpoints > answers ready with 503 and redis down when Redis is unreachable
Proof: run e2e | ✓ Health endpoints > answers ready with 503 and database down when the database is unreachable

**C6** - The readiness rule over its two checks gives, table-driven over the four combinations: both up → `ok`; Redis down → `error` with `database` "up" and `redis` "down"; the database down → `error` with `database` "down" and `redis` "up"; both down → `error` with both "down" (AC 3)
Proof: run unit | ✓ Readiness > reports every combination of the two checks

**C7** - A check that answers after 1.9 seconds is "up", and one that has not answered after 2 seconds is "down" without being awaited any longer (AC 3, door 4)
Proof: run unit | ✓ Readiness > gives up on a check after 2 seconds

**C8** - `GET /health/live` answers 200 while the database and Redis are unreachable (door 4)
Proof: run e2e | ✓ Health endpoints > answers live while the database and Redis are unreachable

**C9** - The database settings map to the connection's TLS options, table-driven over four examples: `DATABASE_SSL` "true" with `DATABASE_SSL_CA` naming a file → TLS with that file's certificates and `rejectUnauthorized` true; "true" with no bundle → TLS with `rejectUnauthorized` true over the system's authorities; "false" → no TLS; unset → no TLS (AC 4)
Proof: run unit | ✓ database config > maps DATABASE_SSL and DATABASE_SSL_CA to the TLS options

**C10** - `REDIS_TLS` "true" puts a TLS option in the Redis client's options, and "false" or unset leaves it out (AC 5)
Proof: run unit | ✓ redis config > maps REDIS_TLS to the client's TLS option

**C11** - The application's `DatabaseModule` and the data source of the compiled migrations and admin seed take their connection options, TLS included, from the same settings: with `DATABASE_SSL` "true" both connect with TLS (AC 4)
Proof: run unit | ✓ database config > gives the application and the migrations the same connection options

**C12** - Against a PostgreSQL that requires TLS with a certificate a test authority signed, a connection with `DATABASE_SSL` "true" and `DATABASE_SSL_CA` naming that authority's bundle opens, and the session reports TLS (AC 4)
Proof: run tls | ✓ Database TLS > verifies the server against the bundle DATABASE_SSL_CA names

**C13** - The connection to that server fails with a certificate verification error when `DATABASE_SSL_CA` names another authority's bundle, and when no bundle is named (AC 4)
Proof: run tls | ✓ Database TLS > refuses a server signed by another authority
Proof: run tls | ✓ Database TLS > refuses a private authority when no bundle is named

**C14** - With `DATABASE_SSL` unset, the connection to a server that also accepts plain connections opens, and the session reports no TLS (AC 4)
Proof: run tls | ✓ Database TLS > connects without TLS when DATABASE_SSL is unset

**C15** - The production image, with `REDIS_TLS` "true" and the test authority trusted, answers `GET /health/ready` with `redis` "up" against a Redis that accepts only TLS; with `REDIS_TLS` unset, it answers 503 with `redis` "down" (AC 5)
Proof: run tls | ✓ Redis TLS > reaches a Redis that accepts only TLS when REDIS_TLS is true
Proof: run tls | ✓ Redis TLS > reports redis down against that Redis when REDIS_TLS is unset

**C16** - The production image, run with `node` and the compiled code, applies every migration under `src/shared/infrastructure/database/migrations` to an empty PostgreSQL, and a second run applies none (AC 6)
Proof: run image | ✓ Production image > applies every migration to an empty database with node

**C17** - The admin seed, run twice from the production image with `node`, leaves one user holding `SUPER_ADMIN` (AC 6)
Proof: run image | ✓ Production image > runs the admin seed twice and leaves one super administrator

**C18** - The production image runs as a user other than root and holds neither `ts-node` nor `typescript` (AC 6)
Proof: run image | ✓ Production image > runs as a non-root user with no development tooling

**C19** - The production image holds the RDS certificate bundle at the path the prod values give `DATABASE_SSL_CA`, a PEM file of more than one certificate (AC 4, door 3)
Proof: run image | ✓ Production image > carries the RDS certificate bundle the prod values name

**C20** - Under `docker compose up`, the `app` service reports `starting` until `GET /health/ready` answers 200, then `healthy`, and `unhealthy` once Redis stops (AC 7)
Proof: run compose | ✓ Compose stack > reports the app healthy only while ready answers 200

**C77** - Loading the data source of the compiled migrations and admin seed with `DATABASE_SSL` "TRUE" fails with an error that names `DATABASE_SSL`, so every entry point takes only "true" and "false", as `validateEnv` does (AC 4; appended after the verification's finding 7)
Proof: run unit | ✓ database config > refuses a DATABASE_SSL other than true or false

**C78** - The production image, with `REDIS_TLS` "true" against a Redis whose certificate an authority it does not trust signed, answers `GET /health/ready` 503 with `redis` "down" and `database` "up" (AC 5, door 3; appended after the verification's finding 3)
Proof: run tls | ✓ Redis TLS > reports redis down when the authority that signed the Redis is not trusted

### S2 - The application runs in Kubernetes and scales

**C21** - The prod render holds a `Deployment` whose liveness probe calls `GET /health/live` and readiness probe `GET /health/ready` on port 3000, with requests of 250m CPU and 256Mi and limits of 1 CPU and 512Mi, and `runAsNonRoot` true (AC 8)
Proof: run infra | ✓ Chart with the prod values > runs the Deployment with both probes, its requests and limits, as non-root

**C22** - The prod render holds a `Service` of type LoadBalancer from port 80 to port 3000, with `externalTrafficPolicy: Local` and the annotation that makes it a Network Load Balancer (AC 8, door 5)
Proof: run infra | ✓ Chart with the prod values > exposes port 80 to 3000 through a Network Load Balancer that keeps the client's address

**C23** - In the prod render, the `ConfigMap` holds `DATABASE_SSL` "true", `DATABASE_SSL_CA` the bundle's path, `REDIS_TLS` "true", `SMTP_HOST` the Mailpit `Service` and the other settings that are not secret; the `Secret` holds `DATABASE_PASSWORD` and `JWT_SECRET`; and no key is in both (AC 8, AC 11)
Proof: run infra | ✓ Chart with the prod values > splits the settings between the ConfigMap and the Secret

**C24** - The settings each render gives the pods, its `ConfigMap` and `Secret` together, pass the application's own `validateEnv` (AC 8)
Proof: run infra | ✓ Chart with the prod values > gives the pods settings the application accepts
Proof: run infra | ✓ Chart with the local values > gives the pods settings the application accepts

**C25** - The prod values run Mailpit, a `Deployment` and a `Service` with the SMTP port 1025 and the web port 8025; the local values run neither and point `SMTP_HOST` at the compose Mailpit (AC 8)
Proof: run infra | ✓ Chart with the prod values > runs Mailpit beside the application
Proof: run infra | ✓ Chart with the local values > leaves Mailpit to the compose stack

**C26** - The prod render holds an `autoscaling/v2` `HorizontalPodAutoscaler` on the `Deployment`, from 2 to 6 replicas, at 70% average CPU utilization and 80% average memory utilization (AC 8)
Proof: run infra | ✓ Chart with the prod values > scales the Deployment from 2 to 6 replicas on CPU at 70% and memory at 80%

**C27** - The migration `Job` carries the hook `pre-install,pre-upgrade`, runs the compiled migrations with `node`, and the settings it reads are created before it (AC 9)
Proof: run infra | ✓ Chart with the prod values > runs the migrations with node in a pre-install and pre-upgrade hook

**C28** - With either values file, the render holds no `Job` but the migration hook (AC 9)
Proof: run infra | ✓ Chart > renders no Job but the migration hook with either values file

**C29** - With the prod and with the local values, every rendered manifest passes kubeconform in strict mode for the Kubernetes version the cluster pins (AC 10)
Proof: run infra | ✓ Chart > renders manifests kubeconform accepts with the prod and the local values

**C30** - `helm lint` passes with the prod and with the local values (AC 10)
Proof: run infra | ✓ Chart > passes helm lint with the prod and the local values

**C31** - No values file holds a password, a key or a token, and rendering the prod values without the secrets the deploy passes fails with a message naming them (AC 11, AC 16)
Proof: run infra | ✓ Chart > keeps every secret out of the values files and fails without the ones the deploy passes

**C32** - `k6 inspect` accepts the scenario in `k6/board.js` (AC 12)
Proof: `scripts/tool.sh k6 inspect k6/board.js`

**C33** - Run with short stages against the local cluster and an account's credentials, the k6 script signs in once and lists the board, the sign-in answered 201 and every listing 200, and every check passing (AC 12)
Proof: run cluster | ✓ Local cluster > runs the k6 scenario with one sign-in and the board listed

### S3 - The chart runs in a local cluster

**C34** - With the compose PostgreSQL, Redis and Mailpit up, `scripts/local-cluster.sh up` creates the kind cluster with metrics-server, loads the image built from the working tree and installs the chart with the local values, and `GET /health/ready` on `localhost:18080` answers 200 with `database` and `redis` "up" (AC 13)
Proof: run cluster | ✓ Local cluster > answers ready on localhost:18080 after up

**C35** - The migration `Job` completes before the application's pods start, and the database the release names holds every migration (AC 9, AC 13)
Proof: run cluster | ✓ Local cluster > applies every migration in a Job that ends before the pods start

**C36** - A second `up` upgrades the release in place: the same cluster, the release at revision 2, and ready again on `localhost:18080` (AC 13)
Proof: run cluster | ✓ Local cluster > upgrades the release in place on a second up

**C37** - With the compose PostgreSQL not running, `up` exits non-zero with a message naming PostgreSQL and creates no cluster (AC 13)
Proof: run cluster | ✓ Local cluster > stops with a message naming PostgreSQL when the compose PostgreSQL is down

**C38** - While the local release runs, `kubectl get hpa` shows the CPU and the memory targets as numbers, neither `<unknown>`, and 2 replicas (AC 14)
Proof: run cluster | ✓ Local cluster > reads CPU and memory in the HPA and holds 2 replicas at rest

**C39** - `scripts/local-cluster.sh down` deletes the kind cluster, and the compose containers keep running with the same ids while the database the release used keeps its rows (AC 15)
Proof: run cluster | ✓ Local cluster > deletes the cluster on down and leaves the compose containers and their data

**C40** - The local release's `Secret` holds the `DATABASE_PASSWORD` and the `JWT_SECRET` of `.env`, which no values file holds (AC 16)
Proof: run cluster | ✓ Local cluster > gives the release the secrets of .env

**C41** - A pod of the image, started with `kubectl run`, runs the compiled admin seed against the database the release uses and creates the SUPER_ADMIN (AC 27, Shape step 11)
Proof: run cluster | ✓ Local cluster > runs the admin seed from a pod of the image against the release's database

### S4 - Terraform provisions prod from one main file

**C42** - With `prod.tfvars`, the network has a VPC with a public and a private subnet in each of two zones, and one NAT gateway (AC 17)
Proof: run terraform | run "prod_network"... pass

**C43** - With `prod.tfvars`, the EKS cluster runs the Kubernetes version the file pins, with a managed node group of two `t3.medium` nodes, and metrics-server is installed (AC 17)
Proof: run terraform | run "prod_cluster"... pass

**C44** - With `prod.tfvars`, the database is RDS PostgreSQL 16, `db.t4g.micro`, not Multi-AZ, not publicly accessible, in the private subnets, with a parameter group that sets `rds.force_ssl` to 1, and its user's password comes from a password Terraform generates, with `manage_master_user_password` off (AC 17, door 3)
Proof: run terraform | run "prod_database"... pass

**C45** - With `prod.tfvars`, the cache is ElastiCache Redis 7, `cache.t4g.micro`, with encryption in transit, in the private subnets (AC 17)
Proof: run terraform | run "prod_cache"... pass

**C46** - Secrets Manager holds the generated database password and a generated `JWT_SECRET` of at least 32 characters (AC 17, door 3)
Proof: run terraform | run "prod_secrets"... pass

**C47** - The ECR repository scans each image on push, and its lifecycle policy keeps the last 20 images (AC 17)
Proof: run terraform | run "prod_registry"... pass

**C48** - The database's security group admits only the nodes' security group, on 5432, and the cache's admits only the nodes' security group, on 6379 (AC 18)
Proof: run terraform | run "prod_reachability"... pass

**C49** - A plan with another environment's name gives that name to the cluster, the database, the cache, the repository and the secrets (AC 19)
Proof: run terraform | run "another_environment"... pass

**C50** - `infra/main.tf` and the files under `infra/modules` hold no environment's name or size as a literal (AC 19)
Proof: run infra | ✓ Terraform files > holds no environment literal in the main file or the modules

**C51** - The cluster gives administrator access to the deploy role and to each ARN in `cluster_admin_arns`, and with an empty list to the deploy role only (AC 20)
Proof: run terraform | run "cluster_access"... pass
Proof: run terraform | run "cluster_access_without_admins"... pass

**C52** - The bootstrap's state bucket has versioning, server-side encryption and all four public access blocks on (AC 21)
Proof: run bootstrap | run "state_bucket"... pass

**C53** - The bootstrap creates the OIDC provider for `https://token.actions.githubusercontent.com` with the client id `sts.amazonaws.com` (AC 21)
Proof: run bootstrap | run "oidc_provider"... pass

**C54** - The role `workshop-deploy` trusts only that provider, with the audience `sts.amazonaws.com` and the subject `repo:kewincosta/tech-challenge-fiap:environment:prod` (AC 21)
Proof: run bootstrap | run "deploy_role_trust"... pass

**C55** - `prod.backend.hcl` keeps the state in the bootstrap's bucket under a key for `prod`, in `us-east-1`, with `use_lockfile = true` (door 1)
Proof: run infra | ✓ Terraform files > keeps the prod state in the bootstrap bucket with a lock file

**C56** - The `network` and `cluster` modules call `terraform-aws-modules/vpc/aws` and `terraform-aws-modules/eks/aws`, each at one exact version (door 2)
Proof: run infra | ✓ Terraform files > pins the community modules to exact versions

**C57** - `terraform fmt -check -recursive infra` passes (AC 22)
Proof: `scripts/tool.sh terraform fmt -check -recursive infra`

**C58** - `terraform validate` passes on the main stack (AC 22)
Proof: `scripts/tool.sh terraform -chdir=infra init -backend=false -input=false -no-color >/dev/null && scripts/tool.sh terraform -chdir=infra validate -no-color`

**C59** - `terraform validate` passes on the bootstrap (AC 22)
Proof: `scripts/tool.sh terraform -chdir=infra/bootstrap init -backend=false -input=false -no-color >/dev/null && scripts/tool.sh terraform -chdir=infra/bootstrap validate -no-color`

**C60** - The database is destroyed with no final snapshot and with deletion protection off, so `terraform destroy` removes `prod` in one run (AC 27, data lifecycle)
Proof: run terraform | run "prod_database_lifecycle"... pass

**C74** - A plan whose `cluster_admin_arns` lists one ARN twice succeeds and gives that principal one access entry, two in all with the deploy role's (AC 20; appended after the verification's finding 4)
Proof: run terraform | run "cluster_access_with_a_repeated_arn"... pass

**C75** - `infra/main.tf` hands the cluster's nodes, the database and the cache the private subnets of the network module (AC 17; appended after the verification's finding 6)
Proof: run infra | ✓ Terraform files > places the cluster, the database and the cache in the private subnets

**C76** - A plan of the database module with another environment's name gives that name to the instance, its subnet group and its parameter group (AC 19; appended after the verification's finding 6)
Proof: run terraform | run "another_environment_database"... pass

### S5 - GitHub Actions builds, tests and deploys

**C61** - The CI workflow runs on every push and every pull request, with the jobs `lint`, `unit` and `build`, none needing another or allowed to fail, running `npm run lint`, `npm run test:unit` and `npm run build` (AC 23)
Proof: run infra | ✓ CI workflow > runs lint, unit and build as parallel jobs on every push and pull request

**C62** - The CD workflow starts from a completed run of the CI workflow and deploys only when that run was a push to `main` and succeeded: a failed run, a pull request's run and another branch's run deploy nothing (AC 24)
Proof: run infra | ✓ CD workflow > deploys only after a successful CI of a push to main

**C63** - The CD checks out the commit the CI tested, applies Terraform with `prod.tfvars` and `prod.backend.hcl`, then builds and pushes the image tagged with that commit's SHA, then runs `helm upgrade --install` with the prod values, that tag and `--wait`, each job needing the one before (AC 24)
Proof: run infra | ✓ CD workflow > applies Terraform, pushes the image and upgrades the chart in that order

**C64** - The CD runs one deploy at a time: its concurrency group holds a second run until the first ends, with `cancel-in-progress` false (AC 24)
Proof: run infra | ✓ CD workflow > queues a second deploy behind the first

**C65** - The CD's jobs that call AWS run under the `prod` environment with `id-token: write` and assume the deploy role through `aws-actions/configure-aws-credentials` and `role-to-assume`; neither workflow names an AWS access key (AC 25)
Proof: run infra | ✓ CD workflow > assumes the deploy role through OIDC and names no access key

**C66** - The CD reads the database password and `JWT_SECRET` from Secrets Manager during the run, masks them, and hands them to the chart without writing them to a file in the repository (AC 25)
Proof: run infra | ✓ CD workflow > reads the secrets from Secrets Manager at run time

**C67** - After the upgrade, the CD reads the load balancer's hostname and upgrades the release again, with `APP_PUBLIC_URL` set to it, only when the value differs (Assumptions)
Proof: run infra | ✓ CD workflow > points APP_PUBLIC_URL at the load balancer's hostname

**C68** - `actionlint` passes on both workflows (AC 26)
Proof: `scripts/tool.sh actionlint`

**C73** - The CD's jobs that call AWS take the deploy role's ARN from the `prod` environment's secret `DEPLOY_ROLE_ARN`, which GitHub masks in the log, and neither workflow reads a role ARN from a variable (AC 25; appended for the user's decision of 2026-11-03 and the verification's finding 5)
Proof: run infra | ✓ CD workflow > takes the deploy role's ARN from a secret of the prod environment

### S6 - The README documents the solution

**C69** - The README holds each part the brief and the plan ask for: the solution and this phase's goals; a mermaid drawing of the application's components, the AWS infrastructure and the deploy flow; the resources Terraform creates, with the commands to apply and to destroy them and the warning that destroying `prod` erases its database; running locally with compose and with the local cluster; provisioning and deploying `prod`; reaching the `prod` database through the cluster and creating the SUPER_ADMIN by hand or with the admin seed; the collection's link; and the video's link as a marked placeholder (AC 27)
Proof: run infra | ✓ README > documents every part the brief asks for

**C70** - Every file, folder and script the README's links and commands name exists in the repository, `infra/README.md` and `k8s/README.md` among them (AC 27)
Proof: run infra | ✓ README > names only files and scripts that exist

**C71** - ADRs 0038 to 0041 exist, each `Accepted` and naming its row, AD-022 to AD-025, and each row names its ADR (Landing, AD-010)
Proof: run infra | ✓ Decision records > records AD-022 to AD-025 as ADRs 0038 to 0041 that name each other

**C72** - A diagram under `docs/architecture` draws the `prod` deployment: the load balancer, the EKS cluster with the application's pods and Mailpit, RDS, ElastiCache and ECR (Shape)
Proof: run infra | ✓ Architecture diagrams > draws the prod deployment

## Coverage

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| `GET /health/live` statuses (1) | 200 C1, C2, C8 | - |
| `GET /health/ready` statuses (2) | 200 C3, C4 · 503 C5, C15 | - |
| readiness rule, AC 3 (4 combinations) | C6, table-driven over all 4 · through HTTP: Redis down C5 · database down C5 | - |
| readiness timeout, door 4 (2 examples) | 1.9 seconds up C7 · 2 seconds down C7 | - |
| `DATABASE_SSL` examples, AC 4 (5) | true with a bundle C9, C12 · true with no bundle C9, C13 · "false" C9 · unset C9, C14 · another value such as "TRUE" C77 | - |
| `REDIS_TLS` examples, AC 5 (3) | true C10, C15 · true against an untrusted authority C78 · unset or "false" C10, C15 | - |
| startup config: database TLS (2 assemblies) | `DatabaseModule` C11 · data source of the compiled migrations and admin seed C11, C16, C77 | - |
| startup config: Redis TLS (1 assembly) | `RedisModule` C10, C15 | - |
| compiled entry points in the image, AC 6 (2) | migrations C16, C35 · admin seed C17, C41 | - |
| chart objects with the prod values, AC 8 (7) | `Deployment` C21 · `Service` C22 · `ConfigMap` C23, C24 · `Secret` C23, C24, C31 · Mailpit `Deployment` C25 · Mailpit `Service` C25 · `HorizontalPodAutoscaler` C26, C38 | - |
| chart Jobs, AC 9 (2 values files) | prod: the migration hook only C27, C28 · local: the migration hook only C28, C35 | - |
| values files (2) | prod C21 to C31 · local C24, C25, C28 to C31, C34 to C40 | - |
| `scripts/local-cluster.sh` commands (2) | `up` C34, C35, C36, C37 · `down` C39 | - |
| Terraform resources with `prod.tfvars`, AC 17 (7) | network C42 · cluster and node group C43, C75 · metrics-server C43 · database C44, C60, C75 · cache C45, C75 · secrets C46 · registry C47 | - |
| reachability, AC 18 (2) | database C48 · cache C48 | - |
| environment names, AC 19 (3 proofs) | another environment's plan C49 · the database's names C76 · no literal C50 | - |
| cluster access, AC 20 (3 examples) | listed ARNs C51 · empty list C51 · an ARN listed twice C74 | - |
| bootstrap resources, AC 21 (3) | state bucket C52 · OIDC provider C53 · deploy role C54 | - |
| `terraform fmt` and `validate`, AC 22 (3) | fmt C57 · main stack C58 · bootstrap C59 | - |
| CI jobs, AC 23 (3) | `lint` C61 · `unit` C61 · `build` C61 | - |
| CD stages, AC 24 (3) | Terraform C63 · image C63 · chart C63 | - |
| CD triggers, AC 24 (3 examples) | a failed CI C62 · a pull request or another branch C62 · a second merge during a deploy C64 | - |
| README parts, AC 27 (8) | C69, table-driven over all 8 · the files they name C70 | - |
| one-way doors (6) | 1 C42 to C55, C60, C74 to C76 · 2 C56 · 3 C9 to C15, C19, C44, C46, C66, C77, C78 · 4 C1 to C8 · 5 C21 to C41 · 6 C61 to C68, C73; their records C71 | - |
| plan readers (5) | image entry points and RDS bundle C16 to C19 · compose health check C20 · README and the folder READMEs C69, C70 · ADRs C71 · C4 diagram C72 | - |

## Swept

- validation: C9 ("false" means no TLS), C77 (any other value stops every entry point), C24 (the rendered settings pass `validateEnv`), C31 (a render without the secrets fails)
- failure modes: C5, C7, C37; existing - Helm stops an upgrade whose pre-upgrade hook fails, so a failed migration leaves the running pods, and `--wait` fails the CD run (C63)
- idempotency: C16 (a second migration run applies none), C17 (the admin seed twice leaves one), C36 (a second `up` upgrades in place)
- authorization: C1, C4 (no token), C2, C3 (no rate limit), C48 (the nodes only), C51 (cluster access), C54 (the role's trust), C65 (OIDC, no keys), C73 (the role's ARN in a masked secret)
- concurrency: C55 (the state lock), C64 (one deploy at a time)
- dependency failure: C5, C8, C15, C37
- data lifecycle: C47 (20 images kept), C60 (destroying `prod` erases its database, which C69 has the README say); no stored shape changes
- state transitions: n/a - no domain status changes; the release's install and upgrade are C34 and C36
- observability: n/a - the plan sets no logging requirement; Kubernetes records failed probes as pod events

## Handoff

- **Settled mid-build:** 2026-11-03, on three points raised after the build: C33's "every request answered 200" while the sign-in answers 201; the `tip` job, which calls no AWS API and so sits outside C65's "the CD's jobs"; and `AWS_DEPLOY_ROLE_ARN`, a variable whose value, account id included, GitHub prints in the public log of the credentials step: user: "1, 2 e 3", approving the three recommendations; C33 and C65 amended, door 6 and hop 7 reworded, and the role's ARN moves to a secret of the `prod` environment
- **Dispatched:** build 1 (Sonnet sub-agent, S1, C1 to C18 and C20, with `vitest.infra.config.ts`) at `8487598`, stopped by the 5-hour limit at `08d438f`, resumed after the reset, returned at `ee0014b`; build 2 (Sonnet sub-agent, S4, C42 to C60, with `scripts/tool.sh`) at `ee0014b`, returned at `b8f0146`; build 3 (Sonnet sub-agent, S2 and S3, C19 and C21 to C41) at `b8f0146`, returned at `99b3ddc`; build 4 (Sonnet sub-agent, S5 and S6, C61 to C72) at `99b3ddc`, stopped by the 5-hour limit at `2ce3b01`, resumed after the reset, returned at `9515068`; Verifier (fresh sub-agent, default model) at `c37b779`, over `8487598..c37b779`, with `proofs.md` 80 pass at `c37b779`, stopped by the 5-hour limit at `c621333` before writing `verification.md`, resumed at `1d5bad2`, returned FAIL with 7 findings at `761b163`; fix of the 7 findings (Sonnet sub-agent, C9 to C11 and C73 to C78) at `761b163`
- **Boundary:** C1-C18 and C20 closed at `ee0014b`; C42-C60 closed at `b8f0146`; C19 and C21-C41 closed at `99b3ddc`; C61-C72 closed at `9515068`
- **Abandoned:** none
