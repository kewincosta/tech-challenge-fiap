# Phase 2 infrastructure verification

**Verdict**: FAIL
**Proofs**: `proofs.md` at c37b779 for C1 to C72, and at 7351442 for C73 to C78
**Verifier**: independent sub-agent (author != verifier)

Judged at 761b163. Every commit after c37b779 changes only `.specs`, so the code and the tests are the ones `proofs.md` ran. C33 and C65 are judged against the wording c621333 gave them with the user's approval. No capture binds this feature, so no check is judged against a picture. C73 to C78, appended after the first round, are judged at 055f816, whose code is that of b21c99d, the fix pass.

## Checks

| Check | Test | Holds |
| --- | --- | --- |
| C1 | `health.e2e.spec.ts` `answers live with 200 and status ok with no token` | yes |
| C2 | `health.e2e.spec.ts` `answers live beyond the rate limit` | yes: six calls against a limit of five; with `@SkipThrottle()` removed, call 6 answers 429 (M4) |
| C3 | `health.e2e.spec.ts` `answers ready beyond the rate limit` | yes: the same, and M4 fails it at call 6 |
| C4 | `health.e2e.spec.ts` `answers ready with 200 when the database and Redis answer` | yes: the whole body |
| C5 | `health.e2e.spec.ts` `answers ready with 503 and redis down when Redis is unreachable` and `answers ready with 503 and database down when the database is unreachable` | yes: each cuts its own relay and asserts 503 with the whole body |
| C6 | `check-readiness.use-case.spec.ts` `reports every combination of the two checks` | yes: four combinations, whole report |
| C7 | `check-readiness.use-case.spec.ts` `gives up on a check after 2 seconds` | yes: fake timers, nothing reported at 1999 ms, the report at 2000 ms with the 1.9 s check up; a timeout 1 ms off, or checks run one after the other, fail it |
| C8 | `health.e2e.spec.ts` `answers live while the database and Redis are unreachable` | yes |
| C9 | `database.config.spec.ts` `maps DATABASE_SSL and DATABASE_SSL_CA to the TLS options` | no: the two cases with TLS off assert `toBeFalsy()`, which `undefined` passes (M2), and `pg` then takes TLS from `PGSSLMODE` |
| C10 | `redis.config.spec.ts` `maps REDIS_TLS to the client's TLS option` | no: `toBeDefined()` passes a TLS option that skips verification (M3); only a test no proof names refuses it |
| C11 | `database.config.spec.ts` `gives the application and the migrations the same connection options` | no: the migrations' TLS is checked by its `ca` alone and the key loop leaves out `ssl`, so a data source that stops verifying the server passes (M1) |
| C12 | `tls.spec.ts` `verifies the server against the bundle DATABASE_SSL_CA names` | yes: `pg_stat_ssl` reports TLS for the session; the throwaway server also accepts plain connections, so the TLS comes from the client's setting |
| C13 | `tls.spec.ts` `refuses a server signed by another authority` and `refuses a private authority when no bundle is named` | yes: both assert a certificate-not-trusted code, and a connection that opens fails the test |
| C14 | `tls.spec.ts` `connects without TLS when DATABASE_SSL is unset` | yes |
| C15 | `tls.spec.ts` `reaches a Redis that accepts only TLS when REDIS_TLS is true` and `reports redis down against that Redis when REDIS_TLS is unset` | yes: the image's whole ready body in both cases |
| C16 | `image.spec.ts` `applies every migration to an empty database with node` | yes: the applied timestamps equal those of the migration files, and a second run leaves the table as it was |
| C17 | `image.spec.ts` `runs the admin seed twice and leaves one super administrator` | yes: exactly one holder of `SUPER_ADMIN`, with the seeded address |
| C18 | `image.spec.ts` `runs as a non-root user with no development tooling` | yes |
| C19 | `image.spec.ts` `carries the RDS certificate bundle the prod values name` | yes: the path comes from `values-prod.yaml`, and every block parses as a certificate |
| C20 | `compose.spec.ts` `reports the app healthy only while ready answers 200` | yes: a health check on `/health/live`, or one that accepts 503, never fails while Redis is down, so the test would time out |
| C21 | `chart.spec.ts` `runs the Deployment with both probes, its requests and limits, as non-root` | yes |
| C22 | `chart.spec.ts` `exposes port 80 to 3000 through a Network Load Balancer that keeps the client's address` | yes |
| C23 | `chart.spec.ts` `splits the settings between the ConfigMap and the Secret` | yes: the Secret is exactly the two secrets, and no secret value is in the ConfigMap |
| C24 | `chart.spec.ts` `gives the pods settings the application accepts`, with the prod values and with the local values | yes: `validateEnv` parses what the container reads |
| C25 | `chart.spec.ts` `runs Mailpit beside the application` and `leaves Mailpit to the compose stack` | yes |
| C26 | `chart.spec.ts` `scales the Deployment from 2 to 6 replicas on CPU at 70% and memory at 80%` | yes: one HPA, its target and both metrics exactly |
| C27 | `chart.spec.ts` `runs the migrations with node in a pre-install and pre-upgrade hook` | yes: what the Job reads is a hook of a lower weight |
| C28 | `chart.spec.ts` `renders no Job but the migration hook with either values file` | yes |
| C29 | `chart.spec.ts` `renders manifests kubeconform accepts with the prod and the local values` | yes: every object valid and none skipped |
| C30 | `chart.spec.ts` `passes helm lint with the prod and the local values` | yes |
| C31 | `chart.spec.ts` `keeps every secret out of the values files and fails without the ones the deploy passes` | yes: the walk goes by key name and value shape, so a password inside another value, such as a URL, would pass it; the values files hold none today |
| C32 | `scripts/tool.sh k6 inspect k6/board.js` | yes |
| C33 | `local-cluster.spec.ts` `runs the k6 scenario with one sign-in and the board listed` | yes, as amended: one pass of the 201 sign-in check, no failed listing, every request counted, and one session for the account |
| C34 | `local-cluster.spec.ts` `answers ready on localhost:18080 after up` | yes: the node holds the layers of a fresh build of the working tree |
| C35 | `local-cluster.spec.ts` `applies every migration in a Job that ends before the pods start` | yes |
| C36 | `local-cluster.spec.ts` `upgrades the release in place on a second up` | yes |
| C37 | `local-cluster.spec.ts` `stops with a message naming PostgreSQL when the compose PostgreSQL is down` | yes: all three services are down in the empty project it uses, and the message must say `PostgreSQL` |
| C38 | `local-cluster.spec.ts` `reads CPU and memory in the HPA and holds 2 replicas at rest` | yes |
| C39 | `local-cluster.spec.ts` `deletes the cluster on down and leaves the compose containers and their data` | yes |
| C40 | `local-cluster.spec.ts` `gives the release the secrets of .env` | yes: the Secret equals the two values exactly |
| C41 | `local-cluster.spec.ts` `runs the admin seed from a pod of the image against the release's database` | yes |
| C42 | `network.tftest.hcl` `prod_network` | yes |
| C43 | `cluster.tftest.hcl` `prod_cluster` | yes: the version and the add-on come from the planned resources; the node group's size and type come from `module.cluster.node_groups`, an output that echoes the module's own `local.node_groups` because the EKS module outputs no scaling settings, and that local goes whole to the module, whose variable takes those names |
| C44 | `database.tftest.hcl` `prod_database` | no: the run tests the module alone with made-up subnets, so "in the private subnets" rests on `terraform.spec.ts` `places the cluster, the database and the cache in the private subnets`, which no proof names |
| C45 | `cache.tftest.hcl` `prod_cache` | no: the same as C44, for the cache |
| C46 | `secrets.tftest.hcl` `prod_secrets` | yes |
| C47 | `registry.tftest.hcl` `prod_registry` | yes |
| C48 | `reachability.tftest.hcl` `prod_reachability` | yes: one rule each, from the nodes' group only; `main.tf` attaches the groups, which `terraform.spec.ts` `gives the database and the cache a security group of their own` checks |
| C49 | `environments.tftest.hcl` `another_environment` | no: the run never reads the database's name; `database.tftest.hcl` `another_environment_database` does, and no proof names it |
| C50 | `terraform.spec.ts` `holds no environment literal in the main file or the modules` | yes |
| C51 | `cluster.tftest.hcl` `cluster_access` and `cluster_access_without_admins` | yes for both cases, read from the planned access entries; a list that repeats an ARN fails the plan (finding) |
| C52 | `bootstrap.tftest.hcl` `state_bucket` | yes |
| C53 | `bootstrap.tftest.hcl` `oidc_provider` | yes |
| C54 | `bootstrap.tftest.hcl` `deploy_role_trust` | yes: the whole condition is compared, and the repository it names is the `origin` remote |
| C55 | `terraform.spec.ts` `keeps the prod state in the bootstrap bucket with a lock file` | yes |
| C56 | `terraform.spec.ts` `pins the community modules to exact versions` | yes |
| C57 | `scripts/tool.sh terraform fmt -check -recursive infra` | yes |
| C58 | `scripts/tool.sh terraform -chdir=infra validate -no-color`, after `init -backend=false` | yes |
| C59 | `scripts/tool.sh terraform -chdir=infra/bootstrap validate -no-color`, after `init -backend=false` | yes |
| C60 | `database.tftest.hcl` `prod_database_lifecycle` | yes |
| C61 | `workflows.spec.ts` `runs lint, unit and build as parallel jobs on every push and pull request` | yes |
| C62 | `workflows.spec.ts` `deploys only after a successful CI of a push to main` | yes: twelve kinds of CI run, among them a fork's and a pull request's run from a branch named `main`, through an evaluator of GitHub's expression rules; it also holds the tip rule that hop 7 now states |
| C63 | `workflows.spec.ts` `applies Terraform, pushes the image and upgrades the chart in that order` | yes: the job scripts run against stand-ins |
| C64 | `workflows.spec.ts` `queues a second deploy behind the first` | yes: it reads the group and `cancel-in-progress`; GitHub's queue itself is not run |
| C65 | `workflows.spec.ts` `assumes the deploy role through OIDC and names no access key` | yes, as amended: the jobs that call AWS are exactly `terraform`, `image` and `deploy`, and `tip` holds `contents: read` only; the test pins `vars.AWS_DEPLOY_ROLE_ARN`, which door 6 now moves to a secret (finding) |
| C66 | `workflows.spec.ts` `reads the secrets from Secrets Manager at run time` | yes |
| C67 | `workflows.spec.ts` `points APP_PUBLIC_URL at the load balancer's hostname` | yes: five cases, among them a first install and a hostname that never comes |
| C68 | `scripts/tool.sh actionlint` | yes |
| C69 | `readme.spec.ts` `documents every part the brief asks for` | yes: it reads that each part is there, not that it is right |
| C70 | `readme.spec.ts` `names only files and scripts that exist` | yes |
| C71 | `documents.spec.ts` `records AD-022 to AD-025 as ADRs 0038 to 0041 that name each other` | yes |
| C72 | `documents.spec.ts` `draws the prod deployment` | yes |
| C73 | `workflows.spec.ts` `takes the deploy role's ARN from a secret of the prod environment` | yes: each job that calls AWS runs in `prod` and resolves `role-to-assume` to the secret whatever the variables hold, and no variable named for a role or an ARN is read but `CLUSTER_ADMIN_ARNS`; M6 and M7 fail it; the masking the claim names is GitHub's own and outside any test |
| C74 | `cluster.tftest.hcl` `cluster_access_with_a_repeated_arn` | yes: two access entries, the deploy role's and the listed user's, and one administrator association for that user; without `distinct()` the plan stops (M8) |
| C75 | `terraform.spec.ts` `places the cluster, the database and the cache in the private subnets` | no: it reads the expression `main.tf` passes, `module.network.private_subnet_ids`, and nothing checks what that output holds; with the network module's two ID outputs swapped (M9) it passes while the three get the public subnets |
| C76 | `database.tftest.hcl` `another_environment_database` | yes: the instance, its subnet group and its parameter group all carry `workshop-staging` |
| C77 | `database.config.spec.ts` `refuses a DATABASE_SSL other than true or false` | yes: four values, each refused by the migrations' data source and by `DatabaseModule` with an error that names `DATABASE_SSL`; a switch that takes any value (M5) fails it |
| C78 | `tls.spec.ts` `reports redis down when the authority that signed the Redis is not trusted` | yes: the image's whole ready body, 503 with `redis` down and `database` up; the Redis certificate names the host the image dials, so trust is the one thing that differs from C15's first case, and M3 fails it |

## Own examples and probes

Run in a scratch worktree at c621333, whose code is that of c37b779, and removed afterwards. The rows from "Round 2" on ran in a second scratch worktree at 055f816, whose code is that of b21c99d, also removed. Each mutant was reverted after its run.

| Probe | Result |
| --- | --- |
| AC 4, own example: a server certificate that chains to the bundle `DATABASE_SSL_CA` names but is issued for `other.example`, reached as `localhost` | refused with `ERR_TLS_CERT_ALTNAME_INVALID`: the rule holds |
| AC 20, own example: the deploy role's own ARN in `cluster_admin_arns` | one access entry: the rule holds |
| AC 20, own example: one ARN listed twice | the plan stops with `Duplicate object key`: finding |
| M1: the migrations' data source sets `rejectUnauthorized: false` when TLS is on | C11's test passes: finding |
| M2: `postgresConnection` gives `ssl: undefined` when TLS is off | C9's test passes: finding |
| M3: `redisClientOptions` gives `tls: { rejectUnauthorized: false }` | C10's test passes, and `tls.spec.ts:198` fails with 200 where it expects 503: finding |
| M4: `@SkipThrottle()` removed from `HealthController` | C2 and C3 fail at call 6: they hold |
| `DATABASE_SSL=TRUE` | `validateEnv` refuses it, while the data source of `dist/migrate.js` and `dist/seed-admin.js` gets `ssl: false`: finding |
| The CD's first read of the Service, against a throwaway kind cluster with no `workshop` namespace, then against a LoadBalancer Service with no address yet | exit 0 and an empty hostname both times, which the deploy script expects |
| Whether EKS offers Kubernetes 1.37 and RDS offers PostgreSQL 16.15 in `us-east-1` | not checked: the plans run against a mocked provider and nothing may reach AWS; `infra/README.md` says each was the newest AWS listed when written |
| Round 2: M1, M2 and M3 again | C11, C9 and C10 now fail on them |
| M5: `databaseConfig` takes any `DATABASE_SSL` | C77 fails |
| M6: one job reads the ARN from `vars.DEPLOY_ROLE_ARN` | C73 and C65 fail |
| M7: one job reads `secrets.DEPLOY_ROLE_ARN` with `vars.AWS_DEPLOY_ROLE_ARN` as a fallback | C73 and C65 fail |
| M8: `distinct()` removed from the cluster module | C74 fails with `Duplicate object key` |
| M9: `private_subnet_ids` and `public_subnet_ids` swapped in `infra/modules/network/outputs.tf` | all 13 Terraform runs and every test of `terraform.spec.ts` pass, C75 among them: finding |
| A run that overrides the VPC module's private and public subnets with distinct ids during the plan and compares the network module's outputs | fails on M9 and passes at b21c99d |

## Findings

| Finding | Evidence | Fix | Closed |
| --- | --- | --- | --- |
| The migration Job and the admin seed can stop verifying the RDS certificate while every test stays green | M1 passes C11's test, which checks only the migrations' `ca` and whose key loop (`database.config.spec.ts:111`) leaves out `ssl`; `image.spec.ts` and `local-cluster.spec.ts` run `dist/migrate.js` and `dist/seed-admin.js` with TLS off, and `tls.spec.ts` connects through `postgresConnection`, never through the data source | assert that `migrations.ssl` equals `application.ssl` in C11's test (`toEqual` compares the bundle by content) | `ecd3c59`. C11 now asserts that the migrations' `ssl` equals the application's, and fails on M1 |
| C9 accepts `undefined` for TLS off, which hands the choice to `PGSSLMODE` | `database.config.spec.ts:75`, `:76`, `:123` and `:124` assert `toBeFalsy()`; M2 passes them; `pg/lib/connection-parameters.js:85` reads `PGSSLMODE` when `ssl` is undefined, and `no-verify` there gives TLS with no verification | assert `toBe(false)` in those four places | `09e9a5e`. C9 asserts `toBe(false)` in the four places, and fails on M2; the code already returned `false` |
| C10 accepts a Redis TLS option that skips verification, and the test that refuses one is named by no check | `redis.config.spec.ts:22` asserts `toBeDefined()`, which M3 passes; `tls.spec.ts:198` `reports redis down when the authority that signed the Redis is not trusted` fails on M3, but no proof names it, so removing it would leave every check green | assert that `options.tls` equals `{}` in C10's test, and add the `tls.spec.ts:198` test as a third proof line of C15 | `751a026`. C10 asserts `options.tls` equals `{}`, and fails on M3; `2de4118` appended C78, whose proof is the `tls.spec.ts` test for the untrusted authority |
| One ARN listed twice in `cluster_admin_arns` stops the deploy at the plan | own example, `terraform test` with the mocks: a list that holds one user ARN twice fails with `Duplicate object key` at `infra/modules/cluster/main.tf:25`; the CD takes the list from the `CLUSTER_ADMIN_ARNS` variable, so a repeated entry fails the `terraform` job | build the map from `distinct(var.cluster_admin_arns)`, with a `cluster.tftest.hcl` run that lists an ARN twice and expects two access entries | `fe5c203`. The map comes from `distinct(...)`, and C74 proves it with the run `cluster_access_with_a_repeated_arn`, red before the fix |
| Door 6 now keeps the deploy role's ARN in a secret of the `prod` environment, and the code still reads a variable | c621333 amended door 6; `cd.yml:95`, `:124` and `:157` read `vars.AWS_DEPLOY_ROLE_ARN`, `workflows.spec.ts:667` asserts it, and `README.md:503`, `infra/README.md:108` and ADR 0041 (line 54) tell the user to set a variable | read the ARN from a `prod` secret in the three jobs, and change C65's test and the three documents; the pattern at `workflows.spec.ts:647` refuses any `secrets.AWS` text, so name the secret without that prefix, such as `DEPLOY_ROLE_ARN`, or narrow the pattern | `43dc850`. The three jobs read the secret `DEPLOY_ROLE_ARN`, C65 asserts it, C73 refuses a role ARN from a variable, and the README, `infra/README.md`, ADR 0041 and the bootstrap output's description name the secret |
| Parts of C44, C45 and C49 rest on tests no proof names | `prod_database` and `prod_cache` run each module alone with made-up subnets, and `terraform.spec.ts:151` is what holds that `main.tf` hands both `module.network.private_subnet_ids`; `another_environment` never reads the database's name, which `database.tftest.hcl:129` `another_environment_database` checks; both pass today, and removing either would leave every check green | add the infra proof line of `Terraform files > places the cluster, the database and the cache in the private subnets` to C44 and C45, and the terraform proof line of `run "another_environment_database"... pass` to C49 | `2de4118` appended C75 and C76, whose proofs are `Terraform files > places the cluster, the database and the cache in the private subnets` and `run "another_environment_database"` |
| The compiled migrations and admin seed take a TLS switch the application refuses, and then connect without TLS | with `DATABASE_SSL=TRUE`, `validateEnv` throws, while the data source that `dist/migrate.js` and `dist/seed-admin.js` use gets `ssl: false`; neither entry point runs `validateEnv`, though the comment at `database.config.ts:11` says that validation refuses every other value; RDS answers such a connection with a server error, and a server that accepts plain connections takes it unencrypted | refuse any value but `true` and `false` inside `databaseConfig`, so every entry point refuses it, with a unit test that loads the data source with `TRUE` | `b21c99d`. `databaseConfig` refuses any value but "true" and "false", naming `DATABASE_SSL`, and C77 loads the migrations' data source and `DatabaseModule` with "TRUE", "yes", "1" and an empty value |
| The network module's `private_subnet_ids` output is never checked against the private subnets | M9 swaps it with `public_subnet_ids` in `infra/modules/network/outputs.tf`; all 13 Terraform runs and `terraform.spec.ts` stay green, C75 among them, while `main.tf` would then hand the nodes, the database and the cache the public subnets | in `network.tftest.hcl`, override `module.network.module.vpc.aws_subnet.private` and `module.network.module.vpc.aws_subnet.public` with distinct ids during the plan, assert that each output holds its own subnets, and name that run as a second proof of C75; a run written this way fails on M9 and passes at b21c99d | `18cda63`. C75's test now also asserts that the network module's `private_subnet_ids` takes `module.vpc.private_subnets` and `public_subnet_ids` takes `module.vpc.public_subnets`, and fails on M9; C75 keeps its proof line |
