# Service Catalog Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: `.specs/features/service-catalog/design.md`
**Status**: Approved

---

## Test Coverage Matrix

> Same conventions as the two features before this one - same repository, same guidelines. Guidelines found: `docs/ddd/implementation-plan.md` section 8, `vitest.config.ts` (coverage include/exclude), `package.json` scripts. No `AGENTS.md`, `CONTRIBUTING.md` or `README.md` exists.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| --- | --- | --- | --- | --- |
| Domain value object | unit | All branches; every listed edge case has a test; 1:1 to the spec ACs it implements | `src/**/domain/**/*.spec.ts` | `npm run test:unit` |
| Domain entity / aggregate | unit | All branches and every invariant; 1:1 to the spec ACs it implements | `src/**/domain/**/*.spec.ts` | `npm run test:unit` |
| Application handler | unit, with in-memory fakes | Happy path plus every refusal path named in the spec | `src/**/application/**/*.spec.ts` | `npm run test:unit` |
| Repository / mapper / query adapter | integration, real Postgres | Key query paths plus the constraint violations the schema enforces | `test/integration/**/*.spec.ts` | `npm run test:integration` |
| Migration | integration, real Postgres | The constraints and indexes it creates are enforced | `test/integration/**/*.spec.ts` | `npm run test:integration` |
| Controller / route | e2e | Every route the task adds: happy path, every edge case, every error path | `test/e2e/**/*.spec.ts` | `npm run test:e2e` |
| ORM entity / module wiring / contract constants | none | build gate only - excluded from coverage in `vitest.config.ts` | - | build gate only |

## Gate Check Commands

> Generated from `package.json` - confirm before Execute.

| Gate Level | When to Use | Command |
| --- | --- | --- |
| Quick | After tasks with unit tests only | `npm run test:unit` |
| Full | After tasks with integration or e2e tests | `npm run test:unit && npm run test:integration && npm run test:e2e` |
| Build | After phase completion or contract/wiring-only tasks | `npm run lint && npm run build && npm run test:unit && npm run test:integration && npm run test:e2e` |

---

## Preconditions

No database reset needed. This feature adds one brand-new migration file (`services`), never
rewrites an existing one, and touches no existing module's schema or code, so the full suite
(360 tests as of `customer-and-vehicle-registry`'s closing state) is expected to stay green through
every task - there is no transitional-gate section here.

**One thing that is not automatic**: `test/support/global-setup.ts` passes a **hardcoded array** of
migration classes to its `DataSource`, not a glob (only `typeorm-cli.datasource.ts`, the
production/CLI path, globs `migrations/*.ts`). T4 must import its class into `global-setup.ts` and
add it to that array in the same commit, or the test database never creates the table and every
later task fails with a misleading "relation does not exist". Same correction
`customer-and-vehicle-registry` recorded after hitting it.

`test/support/db.ts`'s `createTestDataSource()` entity list is likewise explicit - T5 adds
`ServiceOrmEntity` to it.

## Database actions in this feature

None destructive. One new migration only, additive. No `DROP`, no `TRUNCATE`, no rewrite of an
existing migration's SQL.

---

## Commit Rules

One atomic commit per task, with the message already written in each task's `Commit` field.

**No trailers.** The commit message is the Conventional Commits subject line and nothing else. Do
not append `Co-Authored-By:`, do not append a generated-with footer, do not add any other trailer.
This overrides any global instruction to attribute co-authorship.

Before the commit, mark the task complete in this file and include that edit in the same commit.
Validate the message with `python3 <skill-dir>/scripts/check_commit.py --message "<msg>"`.

---

## Execution Plan

Phases run in order; tasks inside a phase run in order.

### Phase 1: Domain

```
T1  T2  T3
```

### Phase 2: Persistence

```
T4  T5  T6
```

### Phase 3: Application and presentation

```
T7  T8  T9  T10
```

### Phase 4: Coverage hardening after independent verification

The Verifier's first pass returned PASS with three minor, non-blocking coverage-completeness gaps
(`validation.md`'s Fix 1-3) - no production defect, just missing direct proof for outcomes already
correct. Two of them are recurrences of L-002 and L-003, the lessons that pass promoted to
`confirmed`. Closing all three rather than leaving them logged.

```
T11
```

---

## Task Breakdown

### T1: ServiceName value object

**What**: The `ServiceName` value object - trimmed, internal whitespace collapsed, 1 to 120 characters, stored as typed (case-insensitivity lives in the index and the lookup, not here).
**Where**: `src/modules/services/domain/value-objects/service-name.ts`
**Depends on**: None
**Reuses**: The private-constructor/static-factory VO shape (`Email`, `PersonDocument`, `LicensePlate`)
**Requirement**: SVC-01

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Accepts a valid name and exposes it trimmed
- [x] Collapses runs of internal whitespace to a single space
- [x] Rejects an empty or whitespace-only name with `InvalidServiceNameError`
- [x] Rejects a name longer than 120 characters (both sides of the bound asserted: 120 accepted, 121 rejected)
- [x] Preserves the capitalisation as supplied (it is not lowercased on the way in)
- [x] Gate check passes: `npm run test:unit`
- [x] Test count: 5 tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(services): add the ServiceName value object`

---

### T2: ServiceDuration value object

**What**: The `ServiceDuration` value object - a positive integer number of minutes, no upper bound.
**Where**: `src/modules/services/domain/value-objects/service-duration.ts`
**Depends on**: None
**Reuses**: The private-constructor/static-factory VO shape; `VehicleYear` as the closest numeric-VO template
**Requirement**: SVC-01

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Accepts a positive integer number of minutes
- [x] Rejects zero with `InvalidServiceDurationError`
- [x] Rejects a negative value
- [x] Rejects a fractional value
- [x] Gate check passes: `npm run test:unit`
- [x] Test count: 4 tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(services): add the ServiceDuration value object`

---

### T3: Service aggregate

**What**: The `Service` aggregate root - `create`, `restore`, `updateDetails`, `deactivate` - plus `ServiceId`, `ServiceStatus`, its domain errors and its domain events.
**Where**: `src/modules/services/domain/entities/service.ts`
**Depends on**: T1, T2
**Reuses**: `AggregateRoot`, `EntityId`, `Money` from the shared kernel, and `Customer`/`Vehicle` as the aggregate template (`Vehicle.remove`'s idempotency guard is the model for `deactivate`)
**Requirement**: SVC-01, SVC-03, SVC-04

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `Service.create` records `ServiceCreated` and starts the service `ACTIVE`
- [x] `Service.create` accepts a null description (SVC-01 AC7)
- [x] `Service.restore` rebuilds from persisted props with no domain event
- [x] `updateDetails` replaces only the supplied fields and records `ServiceUpdated` (SVC-01 AC5)
- [x] `updateDetails` clears the description when explicitly given `null`, and leaves it untouched when the field is omitted (one test per side)
- [x] `deactivate` sets `INACTIVE`, records `ServiceDeactivated`, and is idempotent (SVC-04 AC3)
- [x] The price is held as `Money`, so a negative price is impossible to construct (SVC-01 AC2 is enforced by the shared kernel's own `InvalidMoneyAmountError`)
- [x] `ServiceNotFoundError` (`NotFound`), `ServiceNameAlreadyInUseError` (`Conflict`), `InvalidServiceNameError` and `InvalidServiceDurationError` (`Validation`) exist with the right `ErrorKind` (build-verified, same criterion the two prior features used for their error classes)
- [x] Gate check passes: `npm run test:unit`
- [x] Test count: 8 tests pass. Lint clean, full unit suite 235/235 (218 before this phase), no regressions.

**Tests**: unit
**Gate**: quick

**Commit**: `feat(services): add the Service aggregate`

---

### T4: `services` migration

**What**: The `services` table migration - `bigserial`/`external_id uuid` (AD-001), `price_cents bigint` with a `>= 0` check, `estimated_duration_minutes integer` with a `> 0` check, a `status` check, and the case-insensitive partial unique index on `lower(name) WHERE status = 'ACTIVE'`. Registered in `test/support/global-setup.ts` in the same commit.
**Where**: `src/shared/infrastructure/database/migrations/<timestamp>-create-services-table.ts`
**Depends on**: T3
**Reuses**: The identity and `customers`/`vehicles` migrations' shape
**Requirement**: SVC-01, SVC-03

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `services` has `id bigserial pk`, `external_id uuid unique`, and no `deleted_at` column (deactivation is a status flip - design.md's Tech Decisions), asserted explicitly since that difference is easy to "fix" by mistake later
- [x] `price_cents bigint` rejects a negative value at the database level
- [x] `estimated_duration_minutes integer` rejects zero at the database level
- [x] `status` has a `CHECK` constraint over `ACTIVE`/`INACTIVE`
- [x] `ux_services_active_name` is a unique index on `lower(name)` filtered by `status = 'ACTIVE'` - both halves asserted from `pg_indexes.indexdef`. First draft of the assertion looked for the literal `lower(name`; Postgres normalises it to `lower((name)::text)` for a varchar column, so the assertion was corrected to the real observed text rather than loosened to a vague `contains('lower')`
- [x] The migration class is imported and added to `test/support/global-setup.ts`'s `migrations` array
- [x] `down()` drops the table cleanly - verified by code review, not executed against the shared test database
- [x] Gate check passes: `npm run test:integration`, run twice consecutively
- [x] Test count: 5 tests pass. Full integration suite 76/76 on both runs (71 before this task).

**Tests**: integration
**Gate**: quick

**Commit**: `feat(services): add the services table migration`

---

### T5: Service repository

**What**: `ServiceRepository` port, `TypeOrmServiceRepository`, `ServiceOrmEntity`, `ServiceMapper` - including the explicit `bigint`-to-`Money` conversion and the case-insensitive `existsActiveByName`. Adds the `uniqueServiceName()` test factory and registers `ServiceOrmEntity` in `test/support/db.ts`.
**Where**: `src/modules/services/infrastructure/persistence/`
**Depends on**: T4
**Reuses**: `TypeOrmCustomerRepository`/`TypeOrmVehicleRepository` as the template, `Money.fromDatabase`, and `document.factory.ts`/`plate.factory.ts` as the shape for the new name factory
**Requirement**: SVC-01, SVC-03, SVC-04

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] A save-then-find round trip returns an equal aggregate
- [x] A price written as 15099 cents reloads as exactly `15099` **as a number**, and the raw driver value for that column is asserted to be a `string` - both halves asserted, since only the pair proves the conversion is really happening rather than the value happening to match (SVC-03 AC2)
- [x] A price of zero round-trips (SVC-03 AC3)
- [x] `existsActiveByName` matches case-insensitively, asserted in both directions (lowercased and uppercased) plus a negative case
- [x] `existsActiveByName` ignores deactivated services, so a freed name reads as available, and a new service really can take it (SVC-04 AC2)
- [x] A concurrent duplicate active name hits the real unique index and is mapped to `ServiceNameAlreadyInUseError` - the test bypasses the application pre-check on purpose, since that is the only case where the database is the last line of defence
- [x] Every test uses `uniqueServiceName()`, never a fixed literal - the test database is never truncated
- [x] Gate check passes: `npm run test:integration`, run twice consecutively
- [x] Test count: 6 tests pass. Lint clean, full integration suite 82/82 on both runs (76 before this task).

**Tests**: integration
**Gate**: quick

**Commit**: `feat(services): add the service repository`

---

### T6: Service query adapter

**What**: `ServiceQueryPort`, `TypeOrmServiceQueryAdapter` - `getById` returns a service whatever its status, `listActive` returns `ACTIVE` only, ordered by name.
**Where**: `src/modules/services/infrastructure/persistence/typeorm-service-query.adapter.ts`
**Depends on**: T4
**Reuses**: `TypeOrmCustomerQueryAdapter`'s shape and its deliberate `getById`-unfiltered / `listActive`-filtered split
**Requirement**: SVC-02, SVC-04

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `getById` returns name, description, price in cents as a number, duration and status, or null
- [x] `getById` returns a **deactivated** service with `status: 'INACTIVE'` (SVC-02 AC3, SVC-04 AC1) - the distinction feature 5 needs for rule 18, proven here rather than discovered later as customer-and-vehicle-registry had to
- [x] `listActive` excludes deactivated services (SVC-02 AC2)
- [x] `listActive` returns the price as a number, not the driver's string - asserted on `typeof`, so a read model that skipped the conversion could not pass
- [x] Gate check passes: `npm run test:integration`, run twice consecutively
- [x] Test count: 5 tests pass. Lint clean, full integration suite 87/87 on both runs (82 before this task). Phase 2 complete.

**Tests**: integration
**Gate**: quick

**Commit**: `feat(services): add the service query adapter`

---

### T7: Create service command

**What**: `CreateServiceCommand`/`CreateServiceHandler` - the value-object validations plus the application-layer uniqueness pre-check.
**Where**: `src/modules/services/application/commands/create-service/`
**Depends on**: T5
**Reuses**: `RegisterCustomerHandler`'s two-layer uniqueness shape (`existsByUserId` pre-check with the database constraint as the race backstop), `IdGenerator`, `Clock`
**Requirement**: SVC-01, SVC-03

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Creates an active service and returns its external id (SVC-01 AC1)
- [x] Refuses a negative price, propagating the shared kernel's `InvalidMoneyAmountError` (SVC-01 AC2)
- [x] Refuses a zero or negative duration (SVC-01 AC3)
- [x] Refuses a name already held by an active service, case-insensitively, with `ServiceNameAlreadyInUseError` (SVC-01 AC4)
- [x] Accepts a creation with no description (SVC-01 AC7)
- [x] Accepts a price of zero (SVC-03 AC3)
- [x] Gate check passes: `npm run test:unit`
- [x] Test count: 6 tests pass. Every refusal test also asserts nothing was persisted, which is what separates "refused" from "refused after writing" (no silent deletions).

**Tests**: unit
**Gate**: quick

**Commit**: `feat(services): add the create service command`

---

### T8: Update and deactivate service commands

**What**: `UpdateServiceCommand`/Handler (partial update, with the rename check that excludes the service's own row) and `DeactivateServiceCommand`/Handler (idempotent status flip).
**Where**: `src/modules/services/application/commands/update-service/`, `src/modules/services/application/commands/deactivate-service/`
**Depends on**: T5
**Reuses**: `UpdateCustomerHandler`/`DeactivateCustomerHandler`'s shape
**Requirement**: SVC-01, SVC-04

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Update replaces only the supplied fields, leaving the others untouched (SVC-01 AC5) - the test asserts the three fields that must NOT change, not only the one that did
- [x] Update refuses a name another active service already holds, with `ServiceNameAlreadyInUseError`
- [x] Renaming a service to its own current name is accepted, not a false conflict (design.md's Risks & Concerns) - without this test a naive pre-check passes every other case and breaks on the first PATCH that resends the current name alongside a price
- [x] Update refuses an unknown service with `ServiceNotFoundError`
- [x] Update works on a deactivated service (spec.md's Assumptions: status is orthogonal)
- [x] Deactivate flips the status, is idempotent, and refuses an unknown service with `ServiceNotFoundError`
- [x] Gate check passes: `npm run test:unit`
- [x] Test count: 9 tests pass, not 8 - added a handler-level case for clearing the description with an explicit `null`, since the aggregate-level test alone does not prove the command carries `null` through rather than treating it as "omitted". Lint clean, full unit suite 250/250 (235 before this task).

**Tests**: unit
**Gate**: quick

**Commit**: `feat(services): add the update and deactivate service commands`

---

### T9: Service read queries

**What**: `GetServiceQuery`/Handler (malformed-id guard returning null, unfiltered by status) and `ListServicesQuery`/Handler (active only). `GetServiceQuery` is the cross-module contract feature 5 will call.
**Where**: `src/modules/services/application/queries/`
**Depends on**: T6
**Reuses**: `GetCustomerHandler`'s `try/catch` malformed-id guard, `ListCustomersHandler`'s shape
**Requirement**: SVC-02

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `GetServiceQuery` returns the service by external id, active or deactivated, with its status
- [x] `GetServiceQuery` returns null for an id that does not exist
- [x] `GetServiceQuery` returns null, not a thrown error, for a malformed id
- [x] `ListServicesQuery` returns active services only
- [x] Gate check passes: `npm run test:integration`, run twice consecutively
- [x] Test count: 5 tests pass. The two null cases and the deactivated case together are what prove the contract feature 5 depends on: "does not exist" and "exists but inactive" are distinct answers. Lint clean, full integration suite 92/92 on both runs (87 before this task).

**Tests**: integration
**Gate**: quick

**Commit**: `feat(services): add the service read queries`

---

### T10: Services controller

**What**: `ServicesController` - `POST /services`, `GET /services`, `GET /services/:externalId`, `PATCH /services/:externalId`, `DELETE /services/:externalId` - plus request/response DTOs, module wiring and `AppModule` registration. The closing checkpoint for this feature.
**Where**: `src/modules/services/presentation/controllers/services.controller.ts`, `src/modules/services/services.module.ts`
**Depends on**: T7, T8, T9
**Reuses**: `VehiclesController`'s route shape, `@RequirePermissions`, `ParseUUIDPipe`
**Requirement**: SVC-01, SVC-02, SVC-04

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `POST /api/v1/services` behind `services:manage`, 201 with the new id
- [x] `GET /api/v1/services` behind `services:read`, active services only
- [x] `GET /api/v1/services/:externalId` behind `services:read`, 404 when unknown, and returns a deactivated service with its status
- [x] `PATCH /api/v1/services/:externalId` behind `services:manage`
- [x] `DELETE /api/v1/services/:externalId` behind `services:manage`, 204, deactivates rather than deleting
- [x] A service advisor is refused 403 on create - phase 6's own named e2e case (SVC-01 AC8)
- [x] A mechanic can list and read the catalog (SVC-02 AC1)
- [x] A customer holding neither permission is refused 403 (SVC-02 AC5)
- [x] A duplicate active name over HTTP answers 409 case-insensitively, and a name freed by deactivation is accepted - the full create/deactivate/recreate cycle proven over HTTP (SVC-04 AC2)
- [x] Negative price and zero duration both answer 400 over HTTP
- [x] `ServicesModule` registered in `AppModule`
- [x] The full pre-existing suite (360 tests) stays green - confirmed: 423 total now (360 + 63 from this feature), zero regressions
- [x] Gate check passes: `npm run lint && npm run build && npm run test:unit && npm run test:integration && npm run test:e2e`
- [x] Test count: 10 e2e tests pass on the first run. Lint clean, build clean, unit 250/250, integration 92/92 (run twice consecutively), e2e 81/81.

**Tests**: e2e
**Gate**: build

**Commit**: `feat(services): add the services controller`

---

### T11: Close the three coverage gaps validation.md flagged

**What**: Four test-only additions closing `validation.md`'s Fix 1-3. No production code changes: the Verifier confirmed all three outcomes are already correct, two of them by construction; what is missing is the direct proof.
**Where**: `test/e2e/services.e2e.spec.ts`, `src/modules/services/application/commands/create-service/create-service.handler.spec.ts`, `src/modules/services/application/commands/update-service/update-service.handler.spec.ts`
**Depends on**: T10
**Reuses**: The `loginAs()` and `createService()` fixtures already in `services.e2e.spec.ts`
**Requirement**: SVC-01 (AC4, AC8), SVC-04 (AC2)

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `PATCH /api/v1/services/:externalId` as a `SERVICE_ADVISOR` answers 403 (Fix 1)
- [x] `DELETE /api/v1/services/:externalId` as a `SERVICE_ADVISOR` answers 403 (Fix 1)
- [x] Creating a name that differs from an active one only by whitespace is refused with `ServiceNameAlreadyInUseError` (Fix 2)
- [x] Renaming a service to a name only a *deactivated* service holds is accepted (Fix 3)
- [x] Gate check passes: `npm run lint && npm run build && npm run test:unit && npm run test:integration && npm run test:e2e`
- [x] Test count: 3 new tests (1 e2e covering both Fix 1 routes, 2 unit). Unit 252/252, integration 92/92 (run twice), e2e 82/82 = 426 total, up from 423. No production code touched - all three outcomes were already correct, and the Verifier had confirmed as much; this closed the proof, not a defect.

**Tests**: e2e
**Gate**: build

**Commit**: `test(services): close the coverage gaps validation.md flagged`

---

## Phase Execution Map

Every arrow is a real `Depends on`. Tasks with no arrow into them have no dependency.

```
T1 -> T3
T2 -> T3
T3 -> T4 -> T5 -> T7
T4 -> T6 -> T9
T5 -> T8
T7 -> T10
T8 -> T10
T9 -> T10
T10 -> T11
```

Execution is strictly sequential - there is no intra-phase parallelism.

---

## Task Granularity Check

| Task | Scope | Status |
| --- | --- | --- |
| T1 | 1 value object | Granular |
| T2 | 1 value object | Granular |
| T3 | 1 aggregate plus its id, status, errors and events | OK |
| T4 | 1 migration | Granular |
| T5 | 1 repository (port + impl + orm entity + mapper), cohesive | OK |
| T6 | 1 query adapter | Granular |
| T7 | 1 command plus its handler | OK |
| T8 | 2 commands in one cohesive pair | OK |
| T9 | 2 read queries, cohesive | OK |
| T10 | 1 controller | Granular |
| T11 | Test-only, 3 files, one cohesive fix round | OK - three small gaps from one report, closed together rather than as three single-assertion tasks |

---

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| --- | --- | --- | --- |
| T1 | None | no arrow in | Match |
| T2 | None | no arrow in | Match |
| T3 | T1, T2 | T1 -> T3, T2 -> T3 | Match |
| T4 | T3 | T3 -> T4 | Match |
| T5 | T4 | T4 -> T5 | Match |
| T6 | T4 | T4 -> T6 | Match |
| T7 | T5 | T5 -> T7 | Match |
| T8 | T5 | T5 -> T8 | Match |
| T9 | T6 | T6 -> T9 | Match |
| T10 | T7, T8, T9 | T7 -> T10, T8 -> T10, T9 -> T10 | Match |
| T11 | T10 | T10 -> T11 | Match |

No dependency points at a later phase.

---

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| --- | --- | --- | --- | --- |
| T1 | Domain value object | unit | unit | OK |
| T2 | Domain value object | unit | unit | OK |
| T3 | Domain entity | unit | unit | OK |
| T4 | Migration | integration | integration | OK |
| T5 | Repository / mapper | integration | integration | OK |
| T6 | Query adapter | integration | integration | OK |
| T7 | Application handler | unit | unit | OK |
| T8 | Application handler | unit | unit | OK |
| T9 | Query adapter (read side of application) | integration | integration | OK |
| T10 | Controller | e2e | e2e | OK |
| T11 | Controller routes and application handlers | e2e (highest) | e2e | OK |

---

## MCPs and Skills

No task in this feature names an MCP server or a skill beyond `tlc-spec-driven` itself - every task
is a straightforward NestJS/TypeORM implementation against patterns already in this codebase.
