# phase-2-infrastructure proofs

**HEAD**: dd991bf
**Tree**: clean
**Shell**: /bin/sh
**Result**: 86 pass, 0 fail

| Check | Proof | Result |
| --- | --- | --- |
| C1 | `run e2e / ✓ Health endpoints > answers live with 200 and status ok with no token` | pass |
| C2 | `run e2e / ✓ Health endpoints > answers live beyond the rate limit` | pass |
| C3 | `run e2e / ✓ Health endpoints > answers ready beyond the rate limit` | pass |
| C4 | `run e2e / ✓ Health endpoints > answers ready with 200 when the database and Redis answer` | pass |
| C5 | `run e2e / ✓ Health endpoints > answers ready with 503 and redis down when Redis is unreachable` | pass |
| C5 | `run e2e / ✓ Health endpoints > answers ready with 503 and database down when the database is unreachable` | pass |
| C6 | `run unit / ✓ Readiness > reports every combination of the two checks` | pass |
| C7 | `run unit / ✓ Readiness > gives up on a check after 2 seconds` | pass |
| C8 | `run e2e / ✓ Health endpoints > answers live while the database and Redis are unreachable` | pass |
| C9 | `run unit / ✓ database config > maps DATABASE_SSL and DATABASE_SSL_CA to the TLS options` | pass |
| C10 | `run unit / ✓ redis config > maps REDIS_TLS to the client's TLS option` | pass |
| C11 | `run unit / ✓ database config > gives the application and the migrations the same connection options` | pass |
| C12 | `run tls / ✓ Database TLS > verifies the server against the bundle DATABASE_SSL_CA names` | pass |
| C13 | `run tls / ✓ Database TLS > refuses a server signed by another authority` | pass |
| C13 | `run tls / ✓ Database TLS > refuses a private authority when no bundle is named` | pass |
| C14 | `run tls / ✓ Database TLS > connects without TLS when DATABASE_SSL is unset` | pass |
| C15 | `run tls / ✓ Redis TLS > reaches a Redis that accepts only TLS when REDIS_TLS is true` | pass |
| C15 | `run tls / ✓ Redis TLS > reports redis down against that Redis when REDIS_TLS is unset` | pass |
| C16 | `run image / ✓ Production image > applies every migration to an empty database with node` | pass |
| C17 | `run image / ✓ Production image > runs the admin seed twice and leaves one super administrator` | pass |
| C18 | `run image / ✓ Production image > runs as a non-root user with no development tooling` | pass |
| C19 | `run image / ✓ Production image > carries the RDS certificate bundle the prod values name` | pass |
| C20 | `run compose / ✓ Compose stack > reports the app healthy only while ready answers 200` | pass |
| C77 | `run unit / ✓ database config > refuses a DATABASE_SSL other than true or false` | pass |
| C78 | `run tls / ✓ Redis TLS > reports redis down when the authority that signed the Redis is not trusted` | pass |
| C21 | `run infra / ✓ Chart with the prod values > runs the Deployment with both probes, its requests and limits, as n` | pass |
| C22 | `run infra / ✓ Chart with the prod values > exposes port 80 to 3000 through a Network Load Balancer that keeps ` | pass |
| C23 | `run infra / ✓ Chart with the prod values > splits the settings between the ConfigMap and the Secret` | pass |
| C24 | `run infra / ✓ Chart with the prod values > gives the pods settings the application accepts` | pass |
| C24 | `run infra / ✓ Chart with the local values > gives the pods settings the application accepts` | pass |
| C25 | `run infra / ✓ Chart with the prod values > runs Mailpit beside the application` | pass |
| C25 | `run infra / ✓ Chart with the local values > leaves Mailpit to the compose stack` | pass |
| C26 | `run infra / ✓ Chart with the prod values > scales the Deployment from 2 to 6 replicas on CPU at 70% and memory` | pass |
| C27 | `run infra / ✓ Chart with the prod values > runs the migrations with node in a pre-install and pre-upgrade hook` | pass |
| C28 | `run infra / ✓ Chart > renders no Job but the migration hook with either values file` | pass |
| C29 | `run infra / ✓ Chart > renders manifests kubeconform accepts with the prod and the local values` | pass |
| C30 | `run infra / ✓ Chart > passes helm lint with the prod and the local values` | pass |
| C31 | `run infra / ✓ Chart > keeps every secret out of the values files and fails without the ones the deploy passes` | pass |
| C32 | `scripts/tool.sh k6 inspect k6/board.js` | pass |
| C33 | `run cluster / ✓ Local cluster > runs the k6 scenario with one sign-in and the board listed` | pass |
| C34 | `run cluster / ✓ Local cluster > answers ready on localhost:18080 after up` | pass |
| C35 | `run cluster / ✓ Local cluster > applies every migration in a Job that ends before the pods start` | pass |
| C36 | `run cluster / ✓ Local cluster > upgrades the release in place on a second up` | pass |
| C37 | `run cluster / ✓ Local cluster > stops with a message naming PostgreSQL when the compose PostgreSQL is down` | pass |
| C38 | `run cluster / ✓ Local cluster > reads CPU and memory in the HPA and holds 2 replicas at rest` | pass |
| C39 | `run cluster / ✓ Local cluster > deletes the cluster on down and leaves the compose containers and their data` | pass |
| C40 | `run cluster / ✓ Local cluster > gives the release the secrets of .env` | pass |
| C41 | `run cluster / ✓ Local cluster > runs the admin seed from a pod of the image against the release's database` | pass |
| C42 | `run terraform / run "prod_network"... pass` | pass |
| C43 | `run terraform / run "prod_cluster"... pass` | pass |
| C44 | `run terraform / run "prod_database"... pass` | pass |
| C45 | `run terraform / run "prod_cache"... pass` | pass |
| C46 | `run terraform / run "prod_secrets"... pass` | pass |
| C47 | `run terraform / run "prod_registry"... pass` | pass |
| C48 | `run terraform / run "prod_reachability"... pass` | pass |
| C49 | `run terraform / run "another_environment"... pass` | pass |
| C50 | `run infra / ✓ Terraform files > holds no environment literal in the main file or the modules` | pass |
| C51 | `run terraform / run "cluster_access"... pass` | pass |
| C51 | `run terraform / run "cluster_access_without_admins"... pass` | pass |
| C52 | `run bootstrap / run "state_bucket"... pass` | pass |
| C53 | `run bootstrap / run "oidc_provider"... pass` | pass |
| C54 | `run bootstrap / run "deploy_role_trust"... pass` | pass |
| C55 | `run infra / ✓ Terraform files > keeps the prod state in the bootstrap bucket with a lock file` | pass |
| C56 | `run infra / ✓ Terraform files > pins the community modules to exact versions` | pass |
| C57 | `scripts/tool.sh terraform fmt -check -recursive infra` | pass |
| C58 | `scripts/tool.sh terraform -chdir=infra init -backend=false -input=false -no-color >/dev/null && scripts/tool.s` | pass |
| C59 | `scripts/tool.sh terraform -chdir=infra/bootstrap init -backend=false -input=false -no-color >/dev/null && scri` | pass |
| C60 | `run terraform / run "prod_database_lifecycle"... pass` | pass |
| C74 | `run terraform / run "cluster_access_with_a_repeated_arn"... pass` | pass |
| C75 | `run infra / ✓ Terraform files > places the cluster, the database and the cache in the private subnets` | pass |
| C76 | `run terraform / run "another_environment_database"... pass` | pass |
| C61 | `run infra / ✓ CI workflow > runs lint, unit and build in parallel on pull requests into main and pushes to mai` | pass |
| C62 | `run infra / ✓ CD workflow > deploys only after a successful CI of a push to main` | pass |
| C63 | `run infra / ✓ CD workflow > applies Terraform, pushes the image and upgrades the chart in that order` | pass |
| C64 | `run infra / ✓ CD workflow > queues a second deploy behind the first` | pass |
| C65 | `run infra / ✓ CD workflow > assumes the deploy role through OIDC and names no access key` | pass |
| C66 | `run infra / ✓ CD workflow > reads the secrets from Secrets Manager at run time` | pass |
| C67 | `run infra / ✓ CD workflow > points APP_PUBLIC_URL at the load balancer's hostname` | pass |
| C68 | `scripts/tool.sh actionlint` | pass |
| C73 | `run infra / ✓ CD workflow > takes the deploy role's ARN from a secret of the prod environment` | pass |
| C69 | `run infra / ✓ README > documents every part the brief asks for` | pass |
| C70 | `run infra / ✓ README > names only files and scripts that exist` | pass |
| C71 | `run infra / ✓ Decision records > records AD-022 to AD-025 as ADRs 0038 to 0041 that name each other` | pass |
| C72 | `run infra / ✓ Architecture diagrams > draws the prod deployment` | pass |
| Build | `npm run build` | pass |
| Build | `npm run lint` | pass |

## Output

`Run e2e` - exit 0

```
stderr | test/e2e/health.e2e.spec.ts > Health endpoints > answers ready with 503 and redis down when Redis is unreachable
[ioredis] Unhandled error event: Error: connect ECONNREFUSED 127.0.0.1:42121
    at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1705:16)

stderr | test/e2e/health.e2e.spec.ts > Health endpoints > answers ready with 503 and both down when neither is reachable
[ioredis] Unhandled error event: Error: connect ECONNREFUSED 127.0.0.1:39539
    at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1705:16)

stderr | test/e2e/health.e2e.spec.ts > Health endpoints > answers ready with 503 and both down when neither is reachable
[ioredis] Unhandled error event: Error: connect ECONNREFUSED 127.0.0.1:39539
    at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1705:16)

stderr | test/e2e/health.e2e.spec.ts > Health endpoints > answers live while the database and Redis are unreachable
[ioredis] Unhandled error event: Error: connect ECONNREFUSED 127.0.0.1:46673
    at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1705:16)
```

`Run unit` - exit 0

```
 ✓ src/config/env.validation.spec.ts > TLS settings > refuses REDIS_TLS set to "on", which would leave TLS off without saying so 1ms
 ✓ src/config/env.validation.spec.ts > TLS settings > refuses REDIS_TLS set to "0", which would leave TLS off without saying so 0ms
 ✓ src/config/env.validation.spec.ts > TLS settings > refuses REDIS_TLS set to "", which would leave TLS off without saying so 0ms
 ✓ src/config/redis.config.spec.ts > redis config > maps REDIS_TLS to the client's TLS option 5ms
 ✓ src/config/redis.config.spec.ts > redis config > passes the host, the port and the database to the client, and gives a command two retries 2ms
 ✓ src/config/database.config.spec.ts > database config > maps DATABASE_SSL and DATABASE_SSL_CA to the TLS options 3ms
 ✓ src/config/database.config.spec.ts > database config > treats an empty DATABASE_SSL_CA as no bundle 0ms
 ✓ src/config/database.config.spec.ts > database config > gives the application and the migrations the same connection options 54ms
 ✓ src/config/database.config.spec.ts > database config > gives the application and the migrations no TLS when DATABASE_SSL is unset 9ms
 ✓ src/config/database.config.spec.ts > database config > refuses a DATABASE_SSL other than true or false 38ms

 Test Files  4 passed (4)
      Tests  38 passed (38)
   Start at  10:18:16
   Duration  1.15s (transform 191ms, setup 101ms, collect 1.08s, tests 180ms, environment 1ms, prepare 584ms)
```

`Run tls` - exit 0

```
RUN  v3.2.7 /home/kewin/side_projects/fiap/tech_challenger_1

 ✓ test/infra/runtime/tls.spec.ts > Database TLS > verifies the server against the bundle DATABASE_SSL_CA names 27ms
 ✓ test/infra/runtime/tls.spec.ts > Database TLS > refuses a server signed by another authority 8ms
 ✓ test/infra/runtime/tls.spec.ts > Database TLS > refuses a private authority when no bundle is named 6ms
 ✓ test/infra/runtime/tls.spec.ts > Database TLS > connects without TLS when DATABASE_SSL is unset 9ms
 ✓ test/infra/runtime/tls.spec.ts > Redis TLS > reaches a Redis that accepts only TLS when REDIS_TLS is true 1540ms
 ✓ test/infra/runtime/tls.spec.ts > Redis TLS > reports redis down against that Redis when REDIS_TLS is unset 1463ms
 ✓ test/infra/runtime/tls.spec.ts > Redis TLS > reports redis down when the authority that signed the Redis is not trusted 2015ms

 Test Files  1 passed (1)
      Tests  7 passed (7)
   Start at  10:18:18
   Duration  14.74s (transform 89ms, setup 0ms, collect 346ms, tests 14.17s, environment 0ms, prepare 65ms)
```

`Run image` - exit 0

```
RUN  v3.2.7 /home/kewin/side_projects/fiap/tech_challenger_1

 ✓ test/infra/runtime/image.spec.ts > Production image > applies every migration to an empty database with node 1697ms
 ✓ test/infra/runtime/image.spec.ts > Production image > runs the admin seed twice and leaves one super administrator 2620ms
 ✓ test/infra/runtime/image.spec.ts > Production image > runs as a non-root user with no development tooling 717ms
 ✓ test/infra/runtime/image.spec.ts > Production image > carries the RDS certificate bundle the prod values name 343ms

 Test Files  1 passed (1)
      Tests  4 passed (4)
   Start at  10:18:33
   Duration  12.62s (transform 49ms, setup 0ms, collect 190ms, tests 12.24s, environment 0ms, prepare 54ms)
```

`Run compose` - exit 0

```
RUN  v3.2.7 /home/kewin/side_projects/fiap/tech_challenger_1

 ✓ test/infra/runtime/compose.spec.ts > Compose stack > reports the app healthy only while ready answers 200 43278ms

 Test Files  1 passed (1)
      Tests  1 passed (1)
   Start at  10:18:47
   Duration  45.00s (transform 40ms, setup 0ms, collect 39ms, tests 44.76s, environment 0ms, prepare 59ms)
```

`Run infra` - exit 0

```
 ✓ test/infra/static/expressions.spec.ts > Workflow expressions > finds the status functions of an expression 0ms
 ✓ test/infra/static/triggers.spec.ts > Workflow triggers > starts on the events the workflow lists and on no other 0ms
 ✓ test/infra/static/triggers.spec.ts > Workflow triggers > matches a pattern against the whole name, and lets * stop at a slash and ** go through it 1ms
 ✓ test/infra/static/triggers.spec.ts > Workflow triggers > reads ?, + and a class of characters 1ms
 ✓ test/infra/static/triggers.spec.ts > Workflow triggers > lets a later ! pattern drop a name and a later plain pattern restore it 1ms
 ✓ test/infra/static/triggers.spec.ts > Workflow triggers > skips what branches-ignore names 0ms
 ✓ test/infra/static/triggers.spec.ts > Workflow triggers > keeps a tag away from a workflow that filters only branches, and a branch from one that filters only tags 0ms
 ✓ test/infra/static/triggers.spec.ts > Workflow triggers > filters a pull request by the branch it targets 0ms
 ✓ test/infra/static/triggers.spec.ts > Workflow triggers > runs a pull request for opened, synchronize and reopened unless types list others 0ms
 ✓ test/infra/static/triggers.spec.ts > Workflow triggers > refuses a filter that needs the files of a change 0ms

 Test Files  7 passed (7)
      Tests  88 passed (88)
   Start at  10:19:32
   Duration  10.69s (transform 245ms, setup 0ms, collect 443ms, tests 9.98s, environment 0ms, prepare 90ms)
```

`Run cluster` - exit 0

```

 ✓ test/infra/runtime/local-cluster.spec.ts > Local cluster > stops with a message naming PostgreSQL when the compose PostgreSQL is down 314ms
 ✓ test/infra/runtime/local-cluster.spec.ts > Local cluster > answers ready on localhost:18080 after up 78842ms
 ✓ test/infra/runtime/local-cluster.spec.ts > Local cluster > applies every migration in a Job that ends before the pods start 265ms
 ✓ test/infra/runtime/local-cluster.spec.ts > Local cluster > reads CPU and memory in the HPA and holds 2 replicas at rest 25577ms
 ✓ test/infra/runtime/local-cluster.spec.ts > Local cluster > gives the release the secrets of .env 65ms
 ✓ test/infra/runtime/local-cluster.spec.ts > Local cluster > runs the admin seed from a pod of the image against the release's database 2275ms
 ✓ test/infra/runtime/local-cluster.spec.ts > Local cluster > runs the k6 scenario with one sign-in and the board listed 12716ms
 ✓ test/infra/runtime/local-cluster.spec.ts > Local cluster > upgrades the release in place on a second up 18758ms
 ✓ test/infra/runtime/local-cluster.spec.ts > Local cluster > deletes the cluster on down and leaves the compose containers and their data 1448ms

 Test Files  1 passed (1)
      Tests  9 passed (9)
   Start at  10:19:44
   Duration  144.25s (transform 89ms, setup 0ms, collect 278ms, tests 143.78s, environment 0ms, prepare 67ms)
```

`Run terraform` - exit 0

```
tests/network.tftest.hcl... pass
tests/reachability.tftest.hcl... in progress
  run "prod_reachability"... pass
tests/reachability.tftest.hcl... tearing down
tests/reachability.tftest.hcl... pass
tests/registry.tftest.hcl... in progress
  run "prod_registry"... pass
tests/registry.tftest.hcl... tearing down
tests/registry.tftest.hcl... pass
tests/secrets.tftest.hcl... in progress
  run "prod_secrets"... pass
tests/secrets.tftest.hcl... tearing down
tests/secrets.tftest.hcl... pass

Success! 13 passed, 0 failed.
```

`Run bootstrap` - exit 0

```
any changes that are required for your infrastructure. All Terraform commands
should now work.

If you ever set or change modules or backend configuration for Terraform,
rerun this command to reinitialize your working directory. If you forget, other
commands will detect it and remind you to do so if necessary.
tests/bootstrap.tftest.hcl... in progress
  run "state_bucket"... pass
  run "oidc_provider"... pass
  run "deploy_role_trust"... pass
  run "deploy_role_permissions"... pass
tests/bootstrap.tftest.hcl... tearing down
tests/bootstrap.tftest.hcl... pass

Success! 4 passed, 0 failed.
```

`scripts/tool.sh k6 inspect k6/board.js` - exit 0

```
  "blockHostnames": null,
  "hosts": null,
  "noConnectionReuse": null,
  "noVUConnectionReuse": null,
  "minIterationDuration": null,
  "ext": null,
  "summaryTrendStats": null,
  "summaryTimeUnit": null,
  "systemTags": null,
  "tags": null,
  "metricSamplesBufferSize": null,
  "noCookiesReset": null,
  "discardResponseBodies": null,
  "features": null
}
```

`scripts/tool.sh terraform fmt -check -recursive infra` - exit 0

```
(no output)
```

`scripts/tool.sh terraform -chdir=infra init -backend=false -input=false -no-color >/dev/null && scripts/tool.s` - exit 0

```
Success! The configuration is valid.
```

`scripts/tool.sh terraform -chdir=infra/bootstrap init -backend=false -input=false -no-color >/dev/null && scri` - exit 0

```
Success! The configuration is valid.
```

`scripts/tool.sh actionlint` - exit 0

```
(no output)
```
