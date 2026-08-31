# Service Catalog Validation

## Validation Verdict: PASS

**Date**: 2026-08-31
**Spec**: `.specs/features/service-catalog/spec.md`
**Diff range**: `1c9d225..HEAD` (14 commits, `main` at `101f62e`)
**Verifier**: independent sub-agent (author != verifier) - first pass on this feature

---

## Task Completion

All 10 tasks in `tasks.md` show every Done-when box checked. Every stated file location and test
count verified against the real diff and a direct read of each file, not taken from the task notes.

| Task | Status | Notes |
| --- | --- | --- |
| T1 | Done | `src/modules/services/domain/value-objects/service-name.ts` - trims, collapses internal whitespace, 1-120 chars, stores as typed; 5 tests in `service-name.spec.ts`, matches the stated count |
| T2 | Done | `service-duration.ts` - positive-integer-minutes guard; 4 tests in `service-duration.spec.ts`, matches |
| T3 | Done | `service.ts` aggregate - `create`/`restore`/`updateDetails`/`deactivate`; 8 tests in `service.spec.ts`, matches |
| T4 | Done | `1787702400004-create-services-table.ts` - no `deleted_at`, `chk_services_price_cents >= 0`, `chk_services_duration > 0`, `chk_services_status`, `ux_services_active_name` on `lower(name)` filtered by `status='ACTIVE'`; wired into `test/support/global-setup.ts:61`; 5 tests in `services-table.migration.spec.ts`, matches |
| T5 | Done | `typeorm-service.repository.ts`, `service.mapper.ts`, `service.orm-entity.ts` - explicit `Money.fromDatabase` conversion, `existsActiveByName` with `lower()` both sides and `excludingId`, unique-violation mapping; `ServiceOrmEntity` registered in `test/support/db.ts:31`; `uniqueServiceName()` factory added; 6 tests in `service.repository.spec.ts`, matches |
| T6 | Done | `typeorm-service-query.adapter.ts` - `getById` unfiltered, `listActive` filtered, both convert price via `Money.fromDatabase`; 5 tests in `service-query.adapter.spec.ts`, matches |
| T7 | Done | `create-service.handler.ts` - value-object validation plus `existsActiveByName` pre-check; 6 tests in `create-service.handler.spec.ts`, matches |
| T8 | Done | `update-service.handler.ts` (6 tests) + `deactivate-service.handler.ts` (3 tests) = 9, matches the "9, not 8" deviation the closing note claims |
| T9 | Done | `get-service.handler.ts` (malformed-id guard returns null), `list-services.handler.ts`; 5 tests in `service-read-queries.spec.ts`, matches |
| T10 | Done | `services.controller.ts`, `services.module.ts` registered in `src/app.module.ts:81`; 10 e2e tests in `services.e2e.spec.ts`, matches |

File tree confirmed by direct listing: `src/modules/services`, 35 files, a four-layer module
matching `design.md`'s Components section exactly (`ServiceName`, `ServiceDuration`, `Service`
aggregate, `TypeOrmServiceRepository`, `TypeOrmServiceQueryAdapter`, the five command/query
handlers, `ServicesController`). `git diff 1c9d225..HEAD --stat` shows 50 files changed, purely
additive (1991 insertions, 0 deletions in `src/`/`test/`) - no existing module's file was rewritten,
only `src/app.module.ts` (+1 import, +1 registration), `test/support/global-setup.ts` (+2, the
migration array precondition), `test/support/db.ts` (+2, the entity list precondition). The RBAC
seed migration `1787702400001-seed-rbac-catalog.ts` is untouched by this diff, confirming the
design.md claim of "no RBAC seed change in this feature."

---

## Spec-Anchored Acceptance Criteria

Evidence-or-zero: every row cites a `file:line` and the exact assertion. 19 ACs across 4 stories,
full rigor as instructed.

### SVC-01: An administrator maintains the service catalog (8 ACs)

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1: create with name/price/duration | stored `ACTIVE`, external id returned | `service.ts:44-57` (`Service.create` sets `ServiceStatus.Active`); `create-service.handler.ts:38-49`; unit `create-service.handler.spec.ts:25-37` - `expect(result.id).toBe(created.id.value)`, `expect(created.status).toBe(ServiceStatus.Active)`; e2e `services.e2e.spec.ts:54-66` - `POST /api/v1/services -> 201 {id: expect.any(String)}` | PASS |
| AC2: negative price | 400 | `money.ts:6-9` (`InvalidMoneyAmountError`, `ErrorKind.Validation`); unit `create-service.handler.spec.ts:39-46` - `rejects.toThrow(InvalidMoneyAmountError)` + `expect(services.services).toHaveLength(0)`; e2e `services.e2e.spec.ts:110-116` - `priceCents: -1 -> 400` | PASS |
| AC3: zero/negative duration | 400 | `service-duration.ts:7-11` (`InvalidServiceDurationError`); unit `create-service.handler.spec.ts:48-55`; e2e `services.e2e.spec.ts:117-121` - `estimatedDurationMinutes: 0 -> 400` | PASS |
| AC4: name already active, case-insensitive | 409 | `create-service.handler.ts:34-36` (pre-check); unit `create-service.handler.spec.ts:57-65` - creates `'Troca de oleo'` then `'TROCA DE OLEO'` -> `rejects.toThrow(ServiceNameAlreadyInUseError)`, length stays 1; e2e `services.e2e.spec.ts:124-138` - uppercased duplicate -> `409 {code: 'SERVICE_NAME_ALREADY_IN_USE'}` | PASS |
| AC5: update applies change, leaves omitted untouched | applied/untouched exactly | `service.ts:63-78` (`updateDetails`); unit `update-service.handler.spec.ts:36-47` - updates price only, then asserts `name`/`description`/`duration` unchanged (not just the one field that did change); e2e `services.e2e.spec.ts:140-154` - updates price+description, asserts `name` unchanged | PASS |
| AC6: deactivate | `INACTIVE`, record kept | `service.ts:80-87`; unit `deactivate-service.handler.spec.ts:34-42` - `expect(services.services).toHaveLength(1)` + `status` is `Inactive`; e2e `services.e2e.spec.ts:156-176` - `DELETE -> 204`, then `GET -> 200 {status: 'INACTIVE'}` | PASS |
| AC7: accept service with no description | accepted, `description: null` | `service.ts:48` (`input.description ?? null`); unit `service.spec.ts:37-39` - `create().description` is `null`; `create-service.handler.spec.ts:67-73` | PASS |
| AC8: lacks `services:manage` | 403 on create, update, deactivate | `services.controller.ts:52` (`@RequirePermissions(ServicesManage)` on `POST`), `:97` (`PATCH`), `:122` (`DELETE`); e2e `services.e2e.spec.ts:68-78` - `SERVICE_ADVISOR` creating -> `403 AUTH_FORBIDDEN`, **create only**. Update/deactivate rest on the same decorator plus the generic `permissions.guard.spec.ts` (5 tests, `identity-foundation`), not a route-specific e2e case | PASS (create direct; update/deactivate by construction) - see Fix 1 |

**SVC-01 status**: 8/8 ACs match the spec-defined outcome. AC8's update/deactivate branches rest on
the guard mechanism proven generically rather than a dedicated e2e 403 case - logged as Fix 1, the
same class of gap `customer-and-vehicle-registry`'s Verifier accepted as non-blocking for its own
PATCH/DELETE 403 routes.

### SVC-02: Staff read the catalog to pick work (5 ACs)

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1: `services:read` lists with name/description/price/duration/status | every active service, all fields | `services.controller.ts:70-82`; `typeorm-service-query.adapter.ts:37-42` (`listActive`) shares the same `toDto` (`:44-55`) that `getById` uses; integration `service-query.adapter.spec.ts:44-57` - `toMatchObject` over all six fields (shared code path, proven once); e2e `services.e2e.spec.ts:80-95` - list contains the created id, read returns `{id, priceCents, status}` | PASS |
| AC2: deactivated excluded from list | excluded | `typeorm-service-query.adapter.ts:37-39` (`WHERE status = 'ACTIVE'`); integration `service-query.adapter.spec.ts:83-94` - `should exclude a deactivated service from the active list`; `service-read-queries.spec.ts:76-86`; e2e `services.e2e.spec.ts:156-168` | PASS |
| AC3: read one by id, active or deactivated, with status | returned either way, status carried | `typeorm-service-query.adapter.ts:30-35` (`getById` unfiltered); integration `service-query.adapter.spec.ts:72-81` - `should still return a deactivated service by id, with INACTIVE status`; `service-read-queries.spec.ts:58-66`; e2e `services.e2e.spec.ts:170-175` | PASS |
| AC4: unknown external id | 404 | `services.controller.ts:134-141` (`getServiceOrThrow` throws `ServiceNotFoundError`, `NotFound` -> 404); integration `service-read-queries.spec.ts:68-70` - `getServiceHandler` returns `null`; e2e `services.e2e.spec.ts:192-196` | PASS |
| AC5: lacks both `services:read`/`services:manage` | 403 | `services.controller.ts:71,85` (`@RequirePermissions(ServicesRead)` on list and get); e2e `services.e2e.spec.ts:97-107` - customer gets `403` on both list and get | PASS |

**SVC-02 status**: 5/5 ACs match.

### SVC-03: A price is integer BRL cents, end to end (3 ACs)

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1: price as integer BRL cents via `Money` | domain holds `Money`, not a primitive | `service.ts:15,101-102` (`price: Money`); `service.mapper.ts:17` (`Money.fromDatabase(row.priceCents)`); `typeorm-service-query.adapter.ts:51` (same, read-model side) | PASS |
| AC2: write then read back the exact same amount | exact value, both halves proven | integration `service.repository.spec.ts:51-66` - `expect(typeof raw[0].price_cents).toBe('string')` **and** `expect(found?.price.cents).toBe(15099)` **and** `expect(typeof found?.price.cents).toBe('number')` - the pair the task brief specifically asked to check for; `service-query.adapter.spec.ts:59-66` proves the same pair on the read-model side | PASS |
| AC3: price of zero accepted | accepted | `money.ts:7` (`cents < 0` rejected, `0` is not); unit `create-service.handler.spec.ts:75-81`; integration `service.repository.spec.ts:68-74` | PASS |

**SVC-03 status**: 3/3 ACs match. Both `ServiceMapper.toDomain` and
`TypeOrmServiceQueryAdapter.toDto` call `Money.fromDatabase` explicitly (`service.mapper.ts:17`,
`typeorm-service-query.adapter.ts:51`), and the `typeof` assertion is real in both directions in
`service.repository.spec.ts:63,65` - not a loose `===` comparison that a string could pass by
coincidence (`"15099" == 15099` would in fact be `true` under `==`, so the `toBe`/`typeof` pairing
here matters and is present).

### SVC-04: A deactivated service leaves the catalog without disappearing (3 ACs)

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1: deactivated keeps row/id/price readable by id | readable, unchanged | No `deleted_at` column (`1787702400004-create-services-table.ts:11-25`; `services-table.migration.spec.ts:35-53` asserts its absence explicitly); `typeorm-service-query.adapter.ts:30-35`; `service-query.adapter.spec.ts:72-81` | PASS |
| AC2: deactivation frees the name for a new service | new create with the same name succeeds | `typeorm-service.repository.ts:34-43` (`existsActiveByName` filters `status = Active`); integration `service.repository.spec.ts:85-94` - `should stop matching a name once its service is deactivated, freeing it for reuse` - `resolves.not.toThrow()` on re-creation; e2e `services.e2e.spec.ts:178-190` - deactivate then `POST` same name -> `201` | PASS |
| AC3: deactivating twice leaves it deactivated, no error | idempotent | `service.ts:80-83` (early return if already `Inactive`); unit `service.spec.ts:97-105`; `deactivate-service.handler.spec.ts:44-53` | PASS |

**SVC-04 status**: 3/3 ACs match.

**Overall**: 19/19 ACs across the 4 stories match their spec-defined outcome. Zero spec-precision
gaps - every criterion in `spec.md` states a precise status code or field value, and every test
asserted targets that exact value.

---

## Edge Cases

Evidence-or-zero per `references/validate.md`. This is where this feature's own gaps, distinct from
the two features before it, surface.

| Edge Case | Result |
| --- | --- |
| Concurrent duplicate names -> exactly one succeeds, other 409 | PASS by construction - `ux_services_active_name` (`1787702400004-create-services-table.ts:30-32`) plus `typeorm-service.repository.ts:55-62`'s violation mapping; integration `service.repository.spec.ts:96-105` proves the mapping against a real Postgres unique violation (bypassing the app pre-check on purpose). No literal concurrent `Promise.all` test, matching the reasoning `customer-and-vehicle-registry`'s Verifier already accepted for the same class of edge case |
| Name differs only by case -> treated as duplicate, 409 | PASS - direct evidence at three layers: `service.repository.spec.ts:76-83` (`existsActiveByName` case-insensitive both directions), `create-service.handler.spec.ts:57-65`, `services.e2e.spec.ts:124-138` |
| Name differs only by surrounding whitespace -> treated as duplicate, 409 | **GAP** - `service-name.ts:14` normalises (trim + collapse) before any comparison happens, and `service-name.spec.ts:6-9` proves the VO-level normalisation alone, but no test submits a name differing only by whitespace against an *existing active service* to assert the 409. Correct by construction (the DB constraint and the app pre-check both operate on the already-normalised `ServiceName.value`), not demonstrated end-to-end - see Fix 2 |
| Price of zero accepted | PASS - `create-service.handler.spec.ts:75-81`, `service.repository.spec.ts:68-74` |
| Update sets a name another active service already holds -> 409 | PASS - `update-service.handler.spec.ts:49-57` |
| Update sets a name only a deactivated service holds -> accepted | **GAP** - `UpdateServiceHandler` calls the identical `existsActiveByName(name, serviceId)` (`update-service.handler.ts:31`) that `CreateServiceHandler` calls, and the name-freed-by-deactivation behaviour is proven for the *create* path (`service.repository.spec.ts:85-94`, e2e `services.e2e.spec.ts:178-190`) but never for the *update/rename* path specifically. `update-service.handler.spec.ts`'s six tests do not include this case | PASS by construction (same repository method, same call shape) - see Fix 3 |

**Status**: 4/6 edge cases with direct evidence, 2/6 correct by construction but without a
path-specific test (Fix 2, Fix 3) - both genuine, both non-blocking. Neither is copied from the
prior two features' reports; both are specific to this feature's own uniqueness-check code paths.

---

## Discrimination Sensor

Isolated scratch: `git worktree add <scratch> HEAD --detach` at `101f62e`, `node_modules`
symlinked in, never `git stash`. Pre-sensor real-tree `git status --porcelain` was empty (0 bytes);
confirmed byte-identical again after every mutation was reverted and after
`git worktree remove --force`.

| Mutation | File:line | Description | Killed? |
| --- | --- | --- | --- |
| 1 | `src/modules/services/infrastructure/persistence/service.mapper.ts:17` | Replaced `Money.fromDatabase(row.priceCents)` with `row.priceCents as unknown as Money`, letting the raw driver string leak through untyped | Killed - integration `service.repository.spec.ts` fails 2/6: `should reload a price as an exact number...` (`expected undefined to be 15099` - calling `.cents` on a plain string returns `undefined`) and `should round-trip a price of zero` |
| 2 | `src/modules/services/infrastructure/persistence/typeorm-service.repository.ts:37` | Dropped `lower()` on the column side of `existsActiveByName` (`lower(service.name) = lower(:name)` -> `service.name = lower(:name)`), the exact "one side lowercased, one not" hazard `design.md`'s Risks table names | Killed - integration `service.repository.spec.ts` fails 1/6: `should match existsActiveByName case-insensitively` (`expected false to be true`) |
| 3 | `src/modules/services/infrastructure/persistence/typeorm-service-query.adapter.ts:30-34` | Added `AND status = 'ACTIVE'` to `getById`, the exact bug `customer-and-vehicle-registry` shipped and had to fix late | Killed at both layers - integration `service-query.adapter.spec.ts` fails 1/5 (`should still return a deactivated service by id, with INACTIVE status`, `expected undefined to be 'INACTIVE'`) and `service-read-queries.spec.ts` fails 1/5 (same assertion, one layer up) |

**Sensor depth**: lightweight (3 targeted mutations, standard tier), one on each of the three
sharpest-attention items the task brief named: the first `Money`-backed column, the first
expression index, and the `getById`-unfiltered contract.
**Result**: 3/3 mutations killed, 0 survived.

---

## Interactive UAT Results

Not performed. Backend-only feature, no user-facing UI, per the Verifier's operating instructions.

---

## Code Quality

Spot-checked the highest-risk new code against `references/coding-principles.md`.

| Principle | Status |
| --- | --- |
| Minimum code | Yes - two value objects, one aggregate, one repository, one query adapter, five handlers, one controller; no speculative fields, no reactivate command (matches spec.md's explicit exclusion), no service categories/bundles (matches Out of Scope) |
| Surgical changes | Yes - diff touches only `src/modules/services/**`, one new migration, `app.module.ts` (+2 lines), `global-setup.ts`/`db.ts` (+2 lines each, the stated preconditions), test support files, and `.specs/**`. No existing `identity-foundation`/`customer-and-vehicle-registry` production file was modified |
| No scope creep | Yes - no reactivate route, no price-history table, no per-mechanic pricing; `DELETE` deactivates rather than hard-deletes, matching the stated Tech Decision |
| Matches existing patterns | Yes - `TypeOrmCustomerRepository`'s unique-violation-mapping shape (`typeorm-service.repository.ts:55-62`), `TypeOrmCustomerQueryAdapter`'s `getById`-unfiltered/`listActive`-filtered split, `GetCustomerHandler`'s malformed-id `try/catch` guard (`get-service.handler.ts:21-27`) |
| Cross-module boundary (AD-003) | Clean - `grep` across `src/modules/services` for imports of `customers`/`vehicles`/`users`/`authorization`/`authentication` internals found none beyond the shared `AppPermission` contract and `@RequirePermissions` decorator (both intentional, shared presentation-layer contracts, not domain coupling); no other module imports anything from `services` |
| `ServiceName`'s case-insensitivity placement | Clean, not spread thin. The VO stores the name exactly as typed and does no comparison itself (`service-name.ts:6-19`); the *one* comparison rule lives in exactly two places that must agree - the expression index (`lower(name)`) and `existsActiveByName`'s query (`lower(service.name) = lower(:name)`, `typeorm-service.repository.ts:37`) - both proven to agree by the same test (`service.repository.spec.ts:76-83`) and by the migration test asserting the index's real `indexdef` text. No third, silently-diverging copy of the rule exists anywhere in the diff |
| `description` contract (`null` clears, omitted leaves untouched) | Holds consistently end to end: `UpdateServiceRequestDto.description?: string \| null` with `@ValidateIf((_,v) => v !== null)` (`update-service.request.dto.ts:17-21`) -> `UpdateServiceCommand.description?: string \| null` passed straight through, no coercion (`services.controller.ts:112`) -> `service.updateDetails`'s `input.description !== undefined` check (`service.ts:67-69`). Proven at both ends: `update-service.handler.spec.ts:87-94` (explicit `null` clears) and `:36-47` (omitted leaves untouched); `service.spec.ts:71-85` proves the same pair at the aggregate level directly |
| Spec-anchored outcome check (asserted values match spec) | 19/19 ACs across 4 stories match the spec-defined outcome (SVC-01: 8, SVC-02: 5, SVC-03: 3, SVC-04: 3) |
| Per-layer Coverage Expectation met (domain 1:1 ACs; routes happy+edge+error) | Domain layer is 1:1 with ACs throughout. Route layer is happy+edge+error for every route except the update/deactivate 403 branches (Fix 1) |
| Every test maps to a spec requirement - no unclaimed tests | Yes, on every test file in `src/modules/services/**` and the five new `test/**` files, read in full during this pass |
| Documented guidelines followed | `docs/ddd/implementation-plan.md` phase 6, `vitest.config.ts` coverage include/exclude - same as the two features before this one, unchanged |

---

## Gate Check

- **Gate command**: `npm run lint && npm run build && npm run test:unit && npm run test:integration && npm run test:e2e` (Build-level, from `tasks.md`'s Gate Check Commands table), run directly on `main` at `101f62e`
- **Result**: lint exit 0, build exit 0, unit 250/250, integration 92/92, e2e 81/81 - 423 total, 0 failed, 0 skipped
- **Test count before this feature** (`1c9d225`, `customer-and-vehicle-registry`'s own close): 360 (unit 218, integration 71, e2e 71)
- **Test count after this feature** (`101f62e`): 423 (unit 250, integration 92, e2e 81)
- **Delta**: +32 unit, +21 integration, +10 e2e = +63 new tests, matches `tasks.md`'s own closing tally (423 = 360 + 63) exactly, independently reproduced by running the suite directly, not copied from the task notes
- **Skipped tests**: none
- **Failures**: none
- **`test:integration` run twice consecutively**: both runs 92/92, no flake
- **Fixed-literal-name check**: read every new integration/e2e test file in `src/modules/services/**` and `test/**` in full - every one uses `uniqueServiceName()` from `test/support/factories/service.factory.ts:6-8` (built from `randomUUID()`, the high-entropy pattern `L-004` already recommends), never a fixed literal. No instance of the class of bug that hit `customer-and-vehicle-registry` T15

---

## Fix Plans

### Fix 1 (Minor, non-blocking) - SVC-01 AC8's update/deactivate 403 branches have no dedicated e2e case

- **Root cause**: `services.controller.ts:97,122` carry `@RequirePermissions(AppPermission.ServicesManage)` on `PATCH`/`DELETE`, the identical decorator proven to work generically in `permissions.guard.spec.ts` (5 tests) and directly e2e-tested for `POST` (`services.e2e.spec.ts:68-78`), but `services.e2e.spec.ts` never drives a `SERVICE_ADVISOR` token through `PATCH`/`DELETE` to assert 403 on those two routes specifically.
- **Fix task**: add two e2e cases to `services.e2e.spec.ts` - `PATCH /api/v1/services/:externalId` and `DELETE /api/v1/services/:externalId` as a `SERVICE_ADVISOR`, both asserting `403 {code: 'AUTH_FORBIDDEN'}`.
- **Verify**: `npm run test:e2e`.
- **Priority**: Minor, non-blocking - the guard mechanism and the decorator placement are both already proven; this closes a completeness gap, not a defect.

### Fix 2 (Minor, non-blocking) - whitespace-only duplicate name has no path-specific test

- **Root cause**: `ServiceName.create` (`service-name.ts:14`) trims and collapses whitespace before any uniqueness comparison happens, so a name differing from an existing active one only by surrounding whitespace cannot reach `existsActiveByName` or the database index un-normalised. `service-name.spec.ts:6-9` proves the normalisation alone; no test combines it with an actual duplicate-name submission.
- **Fix task**: add one case to `create-service.handler.spec.ts` - create `'Troca de oleo'`, then attempt `'  Troca de oleo  '` (or with doubled internal spaces), assert `rejects.toThrow(ServiceNameAlreadyInUseError)`.
- **Verify**: `npm run test:unit`.
- **Priority**: Minor, non-blocking - correct today by construction (the VO normalises before comparison), not a demonstrated defect.

### Fix 3 (Minor, non-blocking) - reusing a deactivated service's name via UPDATE (not just CREATE) has no test

- **Root cause**: `UpdateServiceHandler` (`update-service.handler.ts:31`) calls the same `existsActiveByName(name, serviceId)` that `CreateServiceHandler` calls, and the name-freed-by-deactivation behaviour is proven at the repository level for a fresh `save()` (`service.repository.spec.ts:85-94`) and end-to-end for the create route (`services.e2e.spec.ts:178-190`), but `update-service.handler.spec.ts`'s six tests never rename an existing service to a name that only a *deactivated* service holds.
- **Fix task**: add one case to `update-service.handler.spec.ts` - save an active service and a deactivated one sharing no name, then update the active one to the deactivated one's name, assert `resolves.not.toThrow()`.
- **Verify**: `npm run test:unit`.
- **Priority**: Minor, non-blocking - same repository method, same call shape as the already-proven create path; this closes a completeness gap, not a defect. Also flagged as a recurrence of `L-002` (an edge case with no owning task in `tasks.md`) and `L-003` (a sibling call path's test substituting for the specific handler's own) - both lessons recorded below.

No other findings. All 19 ACs across the 4 stories match their spec-defined outcome, the
cross-module boundary is clean, the discrimination sensor killed all 3 injected mutations (one for
each of the feature's three genuinely-new hazards: the `Money`-backed column, the expression index,
and the `getById`-unfiltered contract), and the full gate passed twice with matching counts on both
`test:integration` runs.

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| --- | --- | --- |
| SVC-01 | Implementing | **Verified** (AC8 update/deactivate e2e coverage gap - Fix 1, non-blocking) |
| SVC-02 | Implementing | **Verified** |
| SVC-03 | Implementing | **Verified** |
| SVC-04 | Implementing | **Verified** (deactivated-name reuse via update - Fix 3, non-blocking) |

---

## Summary

**Overall**: Ready

**Spec-anchored check**: 19/19 ACs matched spec outcome, 0 spec-precision gaps, 3 coverage-completeness gaps flagged (Fix 1, Fix 2, Fix 3)
**Sensor**: 3/3 mutations killed
**Gate**: 423 passed, 0 failed (lint clean, build clean), `test:integration` reproduced identically on two consecutive runs (92/92 both times)

**What works**: the project's first `Money`-backed column, with both `ServiceMapper` and
`TypeOrmServiceQueryAdapter` converting explicitly and both directions of the conversion proven
(`typeof` asserted on the raw string and on the mapped number); the project's first expression
index, with the application pre-check and the database constraint agreeing on `lower()` and a real
unique-violation mapped to 409 rather than a raw 500; the deliberate `getById`-unfiltered/
`listActive`-filtered split, designed in from the start and independently proven at the query
adapter, the query handler, and the HTTP route; the RBAC catalog confirmed unchanged and already
correct (`SERVICE_ADVISOR` lacks `services:manage`, `MECHANIC` holds `services:read`); the
`description` null-clears/omitted-untouched contract holding end to end from the HTTP DTO through
the command to the aggregate.

**Issues found**: three non-blocking test-coverage completeness gaps (Fix 1, Fix 2, Fix 3) - all
three are missing tests for outcomes that are correct today by code inspection and by an identical
call pattern already proven elsewhere in the same diff, not demonstrated defects.

**Next steps**: Fix 1-3 are optional coverage hardening, not required to close this feature.
`service-catalog` is verified against `spec.md` in full - all 4 stories, all 19 ACs, all 5 listed
edge cases (with 2 flagged as construction-only, not untested behaviour).
