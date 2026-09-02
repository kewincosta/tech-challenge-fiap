# Tracking And Metrics Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: `.specs/features/tracking-and-metrics/design.md`
**Status**: Approved

---

## Test Coverage Matrix

> Generated from codebase, project guidelines and spec. Guidelines found: `vitest.config.ts`, `vitest.integration.config.ts`, `vitest.e2e.config.ts`, `package.json` scripts, `eslint.config.mjs`. This feature is the one that adds the coverage thresholds, so from T9 onward the floor itself is part of every gate.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| --- | --- | --- | --- | --- |
| Domain value object / entity / aggregate | unit | All branches; 1:1 to spec ACs | `src/modules/**/domain/**/*.spec.ts` | `npm run test:unit` |
| Application handler / query handler | unit | Every branch it owns, including each error-producing call site at this layer (L-003) | `src/modules/**/application/**/*.spec.ts` | `npm run test:unit` |
| Repository / query adapter / migration | integration | Key query paths, every filter the design claims, and any aggregation it claims | `test/integration/*.spec.ts` | `npm run test:integration` |
| Controller / route | e2e | Every route in scope: happy path, every listed edge case, and every error path including one 403 per permission per route | `test/e2e/*.e2e.spec.ts` | `npm run test:e2e` |
| Test configuration / README | none executable beyond the gate they define | the threshold config is proven by a run that fails without it; the README by following it | - | `npm run test:coverage` |

## Gate Check Commands

> Generated from `package.json` - confirm before Execute.

| Gate Level | When to Use | Command |
| --- | --- | --- |
| Quick | After tasks with unit tests only | `npm run test:unit` |
| Full | After tasks with integration or e2e tests | `npm run test:unit && npm run test:integration && npm run test:e2e` |
| Build | After phase completion or contract/wiring-only tasks | `npm run lint && npm run build && npm run test:unit && npm run test:integration && npm run test:e2e` |
| Coverage | From T9 onward, since this feature is what makes it a gate | `npm run test:coverage` |

---

## Confirmed lessons applied to this breakdown

Both confirmed lessons in `.specs/LESSONS.md` shape this file directly:

- **L-002** (every spec Edge Case needs an owning task): the Edge Case Ownership table below assigns each of spec.md's six edge cases to the task that proves it and the layer that proves it, and each assignment also appears as its own **Done when** line in that task.
- **L-003** (a sibling call site's test does not substitute for this one's own, x4): each of the three new routes gets its own 403 test with an actor genuinely lacking that route's permission, rather than one 403 standing in for the group. The two customer routes have different failure shapes (empty list vs 404) and get separate tests for each.

One design-level rule also lands here: **the ownership refusal and the missing-number refusal must be asserted as identical**, not merely as both-404. T3 asserts the handler answers the same `null` for all three causes, and T6 asserts the route answers the same body for a stranger's number and for a number nobody carries.

## Edge Case Ownership

| spec.md Edge Case | Owning task | Proof layer |
| --- | --- | --- |
| A user with no customer record gets an empty list, never an error | T2, T6 | unit handler, e2e |
| A stranger's work order number answers identically to a missing one | T3, T6 | unit handler, e2e |
| No work order ever completed gives zero with a count of zero | T4, T7 | integration adapter, e2e |
| A date range excluding everything gives the same zero shape | T4 | integration, against real Postgres |
| A work order carrying three services counts once per service, and the response says it is an approximation | T4, T7 | integration adapter, e2e |
| A `DELIVERED` work order still counts, since it completed before delivery | T4 | integration, seeded in both states |

---

## Preconditions

- No database reset. The test database is never truncated (STATE.md Conventions), so every test here generates its own customer, vehicle, plate, work order number, SKU and service name.
- No migration. Every column the metric reads (`execution_started_at`, `completed_at`, `status`) was created in features 5 and 8, verified against the running database while designing.
- `work-orders:read-own` and `metrics:read` have been seeded since feature 1 and are written by nothing until this feature.
- The three new routes must be declared before every `:number` route on `WorkOrdersController`, or `/work-orders/me` is read as a work order number (design.md's first risk).

## Database actions

None. No migration, no new table, no new column, no new ORM entity.

## Commit rules

One atomic commit per task, with that task's checkboxes flipped in this file in the same commit. Conventional Commits, no trailers. Validate every message with `python3 .claude/skills/tlc-spec-driven/scripts/check_commit.py --message "..."` before committing.

---

## Execution Plan

Phases run in order; tasks inside a phase run in order. The real dependencies are the arrows in the Phase Execution Map further down, not this listing.

### Phase 1: The customer reads

```
T1  T2  T3
```

### Phase 2: The metric

```
T4  T5
```

### Phase 3: Presentation

```
T6  T7
```

### Phase 4: The coverage floor and the README

```
T8  T9  T10
```

---

## Task Breakdown

### T1: The customer-scoped work order list on the query port

**What**: `listByCustomerId` on `WorkOrderQueryPort` and its TypeORM adapter, reusing the existing `SELECT_WORK_ORDERS` with one more `WHERE`.
**Where**: `src/modules/work-orders/infrastructure/persistence/typeorm-work-order-query.adapter.ts`
**Depends on**: None
**Reuses**: `SELECT_WORK_ORDERS`, which already joins customers, vehicles and users and already carries every item, budget and closing field
**Requirement**: TAM-01

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `listByCustomerId(customerExternalId)` returns every work order of that customer, whatever its status, including cancelled and delivered ones
- [x] It returns them in the same shape `listByStatus` already returns, items and budgets and closing fields included
- [x] It returns an empty list for a customer with no work order, never an error
- [x] A second customer's work orders never appear in the first customer's list, asserted with two seeded customers rather than one
- [x] Gate check passes: `npm run test:unit && npm run test:integration && npm run test:e2e`
- [x] The integration suite passes twice consecutively
- [x] Test count: 4 tests pass (no silent deletions)

Unplanned but required: the full e2e suite (unrelated to this task's own files) showed one transient failure from `registerUser`/`uniqueValidCpf` in `test/e2e/work-order-withdrawals.e2e.spec.ts` - the same shape of flake logged twice before in this project (features 6 and 8's own tasks.md closures), now a third occurrence, always in a file this session never touches. Two immediate clean re-runs at 179/179 confirm it. Worth raising to the Verifier as a lesson candidate given the recurrence count.

**Tests**: integration
**Gate**: full

**Commit**: `feat(work-orders): read a customer's own work orders from the query port`

---

### T2: The my-work-orders query handler

**What**: `GetMyWorkOrdersQuery` and its handler, resolving the acting customer over the `QueryBus`.
**Where**: `src/modules/work-orders/application/queries/get-my-work-orders/get-my-work-orders.handler.ts`
**Depends on**: T1
**Reuses**: `GetMyVehiclesHandler` verbatim as the template, `GetCustomerByUserIdQuery` (AD-003)
**Requirement**: TAM-01

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] The handler resolves the customer from `userId` over the `QueryBus`, never by importing the customers module's repository
- [x] A user backing no customer record gets an empty list, not an error - spec.md's first edge case at this layer
- [x] A user backing a customer gets exactly what `listByCustomerId` returns for that customer's id
- [x] Gate check passes: `npm run test:unit`
- [x] Test count: 3 tests pass (matches the plan exactly)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(work-orders): add the my work orders query handler`

---

### T3: The my-work-order query handler and its ownership rule

**What**: `GetMyWorkOrderQuery` and its handler, answering one `null` for every reason the caller may not have it.
**Where**: `src/modules/work-orders/application/queries/get-my-work-order/get-my-work-order.handler.ts`
**Depends on**: None
**Reuses**: `WorkOrderQueryPort.getByNumber` unchanged, `GetCustomerByUserIdQuery`, `BudgetDecisionAuthorizer`'s reasoning about answering not-found rather than forbidden
**Requirement**: TAM-01

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] A customer reading their own work order gets it in full
- [ ] A customer reading another customer's work order gets `null` - spec.md's second edge case at this layer
- [ ] A user backing no customer record gets `null`
- [ ] A number nobody carries gets `null`
- [ ] The three refusals are asserted to be the identical value, so nothing downstream can tell them apart
- [ ] The `QueryBus` stub branches on the query instance, never on call order
- [ ] Gate check passes: `npm run test:unit`
- [ ] Test count: 5 tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(work-orders): add the my work order query handler`

---

### T4: The metrics query port and its aggregation

**What**: `WorkOrderMetricsQueryPort`, its DTO and filter, and the TypeORM adapter running the average in SQL.
**Where**: `src/modules/work-orders/infrastructure/persistence/typeorm-work-order-metrics-query.adapter.ts`
**Depends on**: None
**Reuses**: `TypeOrmWorkOrderQueryAdapter`'s raw-SQL style and its AD-003 reasoning
**Requirement**: TAM-02

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] The average is computed by `AVG(EXTRACT(EPOCH FROM (completed_at - execution_started_at)))` in SQL, and no work order row ever reaches TypeScript
- [ ] It averages `COMPLETED` and `DELIVERED` work orders, and a `DELIVERED` one still counts - spec.md's sixth edge case
- [ ] It excludes work orders in execution and cancelled work orders
- [ ] Both timestamps are named `NOT NULL` in the `WHERE`, rather than left implied by the status filter (design.md's fifth risk)
- [ ] No matching row answers zero with a count of zero, from `COALESCE` rather than a handler branch - spec.md's third edge case
- [ ] A date range excluding every row answers that same zero shape - spec.md's fourth edge case
- [ ] A date range is inclusive at both ends, asserted with a fixture sitting exactly on each bound (L-009)
- [ ] A service filter averages only the work orders carrying that service, and a work order carrying three services contributes its whole elapsed time to each - spec.md's fifth edge case
- [ ] The seconds come back as a whole number, asserted against a fixture whose true average is fractional
- [ ] Gate check passes: `npm run test:unit && npm run test:integration && npm run test:e2e`
- [ ] The integration suite passes twice consecutively
- [ ] Test count: 9 tests pass (no silent deletions)

**Tests**: integration
**Gate**: full

**Commit**: `feat(work-orders): add the average execution time metrics adapter`

---

### T5: The average execution time query handler

**What**: `GetAverageExecutionTimeQuery` and its handler, a thin pass to the port.
**Where**: `src/modules/work-orders/application/queries/get-average-execution-time/get-average-execution-time.handler.ts`
**Depends on**: T4
**Reuses**: `ListWorkOrdersHandler`'s shape, a query handler over a port with no logic of its own
**Requirement**: TAM-02

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] The handler passes the service filter and both date bounds through untouched
- [ ] It marks the response as approximated when, and only when, a service filter was given
- [ ] It never computes an average itself
- [ ] Gate check passes: `npm run test:unit`
- [ ] Test count: 3 tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(work-orders): add the average execution time query handler`

---

### T6: Expose the customer routes and walk them end to end

**What**: `GET /work-orders/me` and `GET /work-orders/me/:number`, their module wiring, and the e2e proving the ownership rule. Also touches `work-orders.controller.ts` and `work-orders.module.ts`.
**Where**: `test/e2e/work-order-tracking.e2e.spec.ts`
**Depends on**: T2, T3
**Reuses**: `toResponseDto` and `WorkOrderResponseDto` unchanged, `test/e2e/work-order-closing.e2e.spec.ts`'s fixtures for reaching a work order, `loginAsCustomer`'s shape from `work-order-budgets.e2e.spec.ts`
**Requirement**: TAM-01

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Both routes are declared before every `:number` route, and an e2e test hits `/work-orders/me` on a customer who owns a work order and gets 200 with a list, which fails loudly if the ordering ever regresses (design.md's first risk)
- [ ] A customer sees their own work orders and none of a second customer's, proven with two seeded customers
- [ ] A user with no customer record gets 200 and an empty list - spec.md's first edge case
- [ ] A customer reads one of their own work orders in full, items and budgets included
- [ ] A customer reading a second customer's number gets 404 with the identical body a number nobody carries returns - spec.md's second edge case
- [ ] Both routes answer 403 to an actor lacking `work-orders:read-own`, one test per route (L-003)
- [ ] Both routes answer 401 without a token, one test per route
- [ ] A malformed number on `/me/:number` answers 400
- [ ] Gate check passes: `npm run lint && npm run build && npm run test:unit && npm run test:integration && npm run test:e2e`
- [ ] The e2e suite passes twice consecutively
- [ ] Test count: 10 tests pass (no silent deletions)

**Tests**: e2e
**Gate**: build

**Commit**: `feat(work-orders): expose the customer tracking routes`

---

### T7: Expose the metrics route and walk it end to end

**What**: `GET /work-orders/metrics/average-execution-time`, its response DTO and query parameters, its wiring, and the e2e.
**Where**: `test/e2e/work-order-tracking.e2e.spec.ts`
**Depends on**: T5, T6
**Reuses**: T6's fixtures, the existing Swagger decorator set
**Requirement**: TAM-02

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] The route is declared before every `:number` route, alongside the two `me` routes
- [ ] An administrator reads an average over work orders driven to completion through the API alone
- [ ] The response carries the average in whole seconds and the count it averaged
- [ ] A service filter marks the response as approximated, its own test rather than a field checked in passing - spec.md's fifth edge case
- [ ] Without a service filter the response is not marked approximated
- [ ] An actor lacking `metrics:read` answers 403 (L-003)
- [ ] No token answers 401
- [ ] Gate check passes: `npm run lint && npm run build && npm run test:unit && npm run test:integration && npm run test:e2e`
- [ ] The e2e suite passes twice consecutively
- [ ] Test count: 6 tests pass (no silent deletions)

**Tests**: e2e
**Gate**: build

**Commit**: `feat(work-orders): expose the average execution time route`

---

### T8: Close the coverage gap the floor would fail on

**What**: The unit tests that raise `customers/domain/value-objects` above 80 on branches and functions.
**Where**: `src/modules/customers/domain/value-objects/address.spec.ts`
**Depends on**: None
**Reuses**: The existing `address.spec.ts` and `phone-number.spec.ts`, extended rather than replaced
**Requirement**: TAM-03

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `address.ts`'s uncovered branches at lines 48 and 62-72 are exercised
- [ ] `phone-number.ts`'s uncovered branches at lines 22-23 are exercised
- [ ] `customers/domain/value-objects` reports at least 80 on statements, branches, functions and lines, read from an actual `npm run test:coverage` run rather than assumed
- [ ] No existing test is weakened or deleted to reach the number
- [ ] Gate check passes: `npm run test:unit`
- [ ] Test count: 6 tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `test(customers): cover the address and phone number branches`

---

### T9: The coverage floor on the critical paths

**What**: Per-glob `coverage.thresholds` in `vitest.config.ts`, one entry per critical path plan section 8 names.
**Where**: `vitest.config.ts`
**Depends on**: T8
**Reuses**: The existing `coverage` block and its `exclude` list
**Requirement**: TAM-03

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Every critical path plan section 8 names carries a threshold of 80 on statements, branches, functions and lines
- [ ] `npm run test:coverage` passes with the thresholds in place
- [ ] Removing a domain test file makes the run fail on the floor rather than on the missing file, verified once by hand and then reverted
- [ ] The existing suites still pass unchanged, so the floor never became a reason to weaken a test
- [ ] Gate check passes: `npm run test:coverage && npm run test:unit`
- [ ] Test count: no new tests; the floor is the gate

**Tests**: none (the coverage gate itself)
**Gate**: coverage

**Commit**: `chore(tests): enforce a coverage floor on the critical paths`

---

### T10: The README

**What**: The repository README covering prerequisites, setup, infrastructure, migrations, the seed, every test suite and the API documentation URL.
**Where**: `README.md`
**Depends on**: T6, T7, T9
**Reuses**: The real `package.json` scripts, `docker-compose.yml` and `.env.example`, read rather than remembered
**Requirement**: TAM-04

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] It states the prerequisites, the environment setup, `docker compose up`, the migration command and the super administrator seed
- [ ] It names every test suite and the command that runs it, including the coverage gate T9 added
- [ ] It gives the URL the API documentation is served at
- [ ] Every command it states is copied from `package.json` or `docker-compose.yml` rather than written from memory, and each one is executed once against this checkout before the task closes
- [ ] It links to `docs/ddd/` only, since the architecture set does not exist until feature 10
- [ ] Gate check passes: `npm run lint && npm run build && npm run test:unit && npm run test:integration && npm run test:e2e && npm run test:coverage`
- [ ] Test count: no new tests; the README is proven by running what it documents

**Tests**: none (documentation, proven by execution)
**Gate**: build

**Commit**: `docs: add the project README`

---

## Phase Execution Map

Every arrow is a real `Depends on`. Tasks with no arrow into them have no dependency.

```
T1 -> T2
T2 -> T6
T3 -> T6
T4 -> T5
T5 -> T7
T6 -> T7
T8 -> T9
T6 -> T10
T7 -> T10
T9 -> T10
```

Execution is strictly sequential, with no intra-phase parallelism.

---

## Task Granularity Check

| Task | Scope | Status |
| --- | --- | --- |
| T1 | 1 port method plus its adapter implementation | Granular |
| T2, T3 | 1 query handler each | Granular |
| T4 | 1 port plus the adapter that is the whole point of it | Cohesive, merged per the test co-location rule |
| T5 | 1 query handler | Granular |
| T6 | 2 sibling routes plus their wiring and the e2e that proves them | Cohesive, the two share one ownership rule and one fixture |
| T7 | 1 route plus its DTO and e2e | Granular |
| T8 | 2 sibling value object specs extended | Cohesive, one coverage target |
| T9 | 1 configuration block | Granular |
| T10 | 1 document | Granular |

---

## Diagram-Definition Cross-Check

| Task | Depends on (task body) | Diagram shows | Status |
| --- | --- | --- | --- |
| T1 | None | no inbound arrow | Match |
| T2 | T1 | `T1 -> T2` | Match |
| T3 | None | no inbound arrow | Match |
| T4 | None | no inbound arrow | Match |
| T5 | T4 | `T4 -> T5` | Match |
| T6 | T2, T3 | `T2 -> T6`, `T3 -> T6` | Match |
| T7 | T5, T6 | `T5 -> T7`, `T6 -> T7` | Match |
| T8 | None | no inbound arrow | Match |
| T9 | T8 | `T8 -> T9` | Match |
| T10 | T6, T7, T9 | `T6 -> T10`, `T7 -> T10`, `T9 -> T10` | Match |

No task depends on a later phase.

---

## Test Co-location Validation

| Task | Code layer created | Matrix requires | Task says | Status |
| --- | --- | --- | --- | --- |
| T1 | query adapter | integration | integration | OK |
| T2, T3 | application query handler | unit | unit | OK |
| T4 | query port and adapter | integration | integration | OK |
| T5 | application query handler | unit | unit | OK |
| T6, T7 | controller, DTOs, module wiring | e2e (highest of the layers touched) | e2e | OK |
| T8 | domain value object specs | unit | unit | OK |
| T9 | test configuration | the coverage gate it defines | coverage | OK |
| T10 | documentation | proven by executing what it documents | none | OK |

Two tasks carry `Tests: none`: T9 defines a gate rather than passing one, and T10 is documentation whose correctness is proven by running the commands it states. Every task that produces application or domain code carries a real test type.

---

## MCPs and Skills

No task needs an MCP or a further skill. Every dependency is in this repository, every pattern has a local precedent named in its `Reuses` line, and the one external contract this feature leans on (Vitest's per-glob `coverage.thresholds`) was verified against the installed package's own type definition while designing, not assumed.
