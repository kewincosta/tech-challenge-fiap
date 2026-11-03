# health

The module at `src/health`. The two probes that tell the cluster whether the process runs and
whether it can serve.

**This unit holds no aggregate.** It has no table, no domain layer and no command. It asks the
database and Redis one question each and reports the answers. Its routes are the only ones of the
API that sit outside the `api` prefix and the version, and they need no token and have no rate
limit ([0040](../../adr/0040-the-application-runs-in-kubernetes-as-a-helm-chart.md)).

Conventions this page does not repeat are in [the high level design](../high-level-design.md).

## Composition

`HealthModule` (`src/health/health.module.ts`) imports `RedisModule` and registers
`HealthController`. It binds the injection token `READINESS_CHECKS`, declared in
`src/health/health.tokens.ts`, to `DependencyReadinessChecks`, and builds `CheckReadinessUseCase`
with a factory provider that hands it that binding. `AppModule` imports the module. The database
comes from the `DataSource` that `DatabaseModule` already registers.

## Use case

`CheckReadinessUseCase` (`src/health/application/check-readiness.use-case.ts`) runs the database
check and the Redis check together and returns a report:

```json
{ "status": "ok", "checks": { "database": "up", "redis": "up" } }
```

`status` is `ok` only when both checks are `up`, and `error` otherwise. Each check has 2 seconds. A
check that rejects, throws before it returns a promise, or has not answered by then is `down`, and
the report is sent at that moment, however long the dependency would hang. A check never makes the
use case throw.

## Port and adapter

`ReadinessChecks` (`src/health/application/ports/readiness-checks.port.ts`) has one method for
each dependency, `database()` and `redis()`. A method resolves when the dependency answers and
rejects when it cannot.

`DependencyReadinessChecks` (`src/health/infrastructure/dependency-readiness-checks.ts`) implements
it:

| Check        | How the adapter asks                     |
| ------------ | ---------------------------------------- |
| `database()` | Runs `SELECT 1` through the `DataSource` |
| `redis()`    | Sends `PING` through the Redis client    |

## Routes

`HealthController` (`src/health/presentation/health.controller.ts`) is declared with the path
`health` and no version, and carries `@Public()` and `@SkipThrottle()`. `configureApp` in
`src/app.setup.ts` excludes both paths from the `api` prefix, so `/api/health/live` and
`/api/v1/health/ready` answer 404.

| Route               | Status | Body                                                                                                             |
| ------------------- | ------ | ---------------------------------------------------------------------------------------------------------------- |
| `GET /health/live`  | 200    | `{ "status": "ok" }`, while the process answers                                                                  |
| `GET /health/ready` | 200    | `{ "status": "ok", "checks": { "database": "up", "redis": "up" } }`                                              |
| `GET /health/ready` | 503    | `{ "status": "error", "checks": { "database": "down", "redis": "up" } }`, with `down` for each check that failed |

The live route asks nothing, so it answers 200 while the database and Redis are unreachable. The
bodies are `LiveResponseDto` and `ReadinessResponseDto` in
`src/health/presentation/dtos/health.response.dto.ts`.

## Who calls them

The chart's `Deployment` (`k8s/workshop/templates/deployment.yaml`) sends the startup and liveness
probes to `/health/live` and the readiness probe to `/health/ready`. The readiness probe waits 5
seconds, longer than the 2 seconds a check takes to give up. A pod that is not ready leaves the
Service until its checks are up again.

The `app` service of `docker-compose.yml` has a health check that asks `/health/ready` from inside
the container and counts a 200 as healthy.

## Tests

- `src/health/application/check-readiness.use-case.spec.ts` covers the four combinations of the two checks, the 2-second limit and a check that throws before it returns a promise.
- `test/e2e/health.e2e.spec.ts` calls both routes through the application with the database and Redis cut off one at a time and together, and checks the 503 after 2 seconds, the rate limit and the 404 outside the prefix.
- `test/infra/static/chart.spec.ts` checks the probe paths, the port and the readiness timeout in the rendered chart.
- `test/infra/runtime/compose.spec.ts` checks that the `app` service is healthy only while `/health/ready` answers 200.

## What this page does not hold

The probe settings of the chart and of the compose file, which `k8s/README.md` describes, and the
reasoning behind them, which is in the record linked above.
