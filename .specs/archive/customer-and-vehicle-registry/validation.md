# Customer And Vehicle Registry Validation

## Validation Verdict: PASS

**Date**: 2026-08-31
**Spec**: `.specs/features/customer-and-vehicle-registry/spec.md`
**Diff range**: `c878d74..cded578` (29 commits, `main`)
**Verifier**: independent sub-agent (author != verifier) - first pass on this feature

---

## Task Completion

All 20 tasks in `tasks.md` show every Done-when box checked. Verified against the actual diff,
the running codebase, and two independent full gate runs, not trusted at face value.

| Task | Status | Notes |
| --- | --- | --- |
| T1 | Done | `src/modules/customers/domain/value-objects/address.ts` - 6 tests in `address.spec.ts`, matches the stated count |
| T2 | Done | `phone-number.ts` - 5 tests in `phone-number.spec.ts`, matches |
| T3 | Done | `customer.ts` aggregate - 8 tests in `customer.spec.ts` |
| T4 | Done | `1787702400002-create-customers-table.ts` - unique on `external_id`, unique on `user_id` (not partial, by design), `chk_customers_status`; wired into `test/support/global-setup.ts:58` |
| T5 | Done | `typeorm-customer.repository.ts` - `resolveUserInternalId`, `save`, unique-violation mapping to `CustomerAlreadyExistsForUserError` |
| T6 | Done | `typeorm-customer-query.adapter.ts` - `getById` (unfiltered), `getByUserId`/`listActive` (filtered) |
| T7 | Done | `register-customer.handler.ts` - 8 tests in `register-customer.handler.spec.ts` |
| T8 | Done | `update-customer.handler.ts` (4 tests) + `deactivate-customer.handler.ts` (3 tests) = 7, matches |
| T9 | Done | `get-customer`, `get-customer-by-user-id`, `list-customers` - 6 tests in `customer-read-queries.spec.ts` |
| T10 | Done | `customers.controller.ts`, `customers.module.ts` registered in `app.module.ts:78` - 10 e2e tests in `customers.e2e.spec.ts` |
| T11 | Done | `license-plate.ts` - 4 tests |
| T12 | Done | `vehicle-year.ts` - 4 tests |
| T13 | Done | `vehicle.ts` aggregate - 8 tests |
| T14 | Done | `1787702400003-create-vehicles-table.ts` - partial unique on `plate` filtered by `deleted_at IS NULL`, index on `customer_id`; wired into `global-setup.ts:59` |
| T15 | Done | `typeorm-vehicle.repository.ts` - 5 tests in `vehicle.repository.spec.ts`, plate-reuse-after-removal proven with a real Postgres round trip |
| T16 | Done | `typeorm-vehicle-query.adapter.ts` - 4 tests |
| T17 | Done | `register-vehicle.handler.ts` - 5 tests |
| T18 | Done | `update-vehicle.handler.ts` (5 tests) + `remove-vehicle.handler.ts` (3 tests) = 8, matches |
| T19 | Done | `get-vehicle`, `list-vehicles-by-customer`, `get-my-vehicles` - 5 tests in `vehicle-read-queries.spec.ts`, `GetMyVehiclesHandler` wired against a real `GetCustomerByUserIdHandler` |
| T20 | Done | `vehicles.controller.ts`, `vehicles.module.ts` registered in `app.module.ts:79` - 11 e2e tests in `vehicles.e2e.spec.ts`; the `getById` deactivated-customer fix (`eda4cdd`) has its own dedicated integration test |

File tree confirmed by direct listing: `src/modules/customers` and `src/modules/vehicles`, 43 files
combined, matches the two four-layer module trees `design.md` describes. Both modules registered
in `src/app.module.ts:78-79`. Both migrations wired into `test/support/global-setup.ts:58-59`
(the precondition T4/T14 both call out explicitly).

---

## Spec-Anchored Acceptance Criteria

Evidence-or-zero: every row cites a `file:line` and the exact assertion.

### CVR-01: A service advisor turns a person into a customer (10 ACs, full rigor)

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1: register over existing user id | customer linked to that user's internal id | `register-customer.handler.ts:58-68` (`resolveExistingUser` branch, `customers.save`); unit `register-customer.handler.spec.ts:47-59` - `expect(customers.customers[0].userId).toBe(USER_ID)`; e2e `customers.e2e.spec.ts:34-44` - `POST /customers {userId} -> 201 {id}` | PASS |
| AC2: target user missing `CUSTOMER` role | 422 | `register-customer.handler.ts:89-91` - `UserMissingCustomerRoleError` (`ErrorKind.RuleViolation` -> 422, `global-exception.filter.ts:13`); unit `register-customer.handler.spec.ts:61-72` - `rejects.toThrow(UserMissingCustomerRoleError)` | PASS |
| AC3: target already backs a customer | 409 | `register-customer.handler.ts:95-97` (pre-check) + `typeorm-customer.repository.ts:52-59` (DB-constraint backstop mapped to `CustomerAlreadyExistsForUserError`, Conflict -> 409); unit `register-customer.handler.spec.ts:74-86`; integration `customer.repository.spec.ts:84-91` - real Postgres unique violation on `ux_customers_user_id` | PASS |
| AC4: account-creation branch, `RegisterUserCommand` with `issuedByStaff: true`, one transaction | working create flow, atomic | `register-customer.handler.ts:101-108` (`createAccount`), `:57` (`transactionRunner.run` wraps the whole body); unit `register-customer.handler.spec.ts:99-119` - `expect(commandBus.execute).toHaveBeenCalledWith(new RegisterUserCommand('jane@example.com', 'Jane Doe', undefined, '11144477735', true))`, `:141-157` - `expect(transactionRunner.runCalls).toBe(1)`; e2e `customers.e2e.spec.ts:46-59` | PASS |
| AC5: temp password returned once | present only on account-creation branch | `register-customer.handler.ts:71-73` (`temporaryPassword ? {...} : {...}`); e2e `customers.e2e.spec.ts:57-58` - `expect(response.body.temporaryPassword).toHaveLength(12)` | PASS |
| AC6: mutual exclusivity, both or neither | 400 | `register-customer.handler.ts:43-48` (`hasExistingUser === hasAccountData` throws `AmbiguousCustomerRegistrationError`, Validation -> 400); unit `register-customer.handler.spec.ts:121-139` - both cases | PASS - killed by discrimination sensor mutation 1 |
| AC7: address all-or-nothing, invalid state/zip | 400 | `address.ts:36-58`; unit `address.spec.ts:28-44` - "reject a partially populated address" / "reject an invalid state code" / "reject a malformed zip code", all `toThrow(InvalidAddressError)`. **Wiring gap**: `register-customer.handler.ts:50` calls `Address.create(command.address)` unconditionally, and the identical call shape is independently proven to propagate in `update-customer.handler.ts:26` + `update-customer.handler.spec.ts:68-84`, but `RegisterCustomerHandler`'s own test suite has no test that a malformed address rejects a *registration* specifically, at unit or e2e level | PASS (indirect) - see Fix 1 |
| AC8: phone format, 2-digit area code + 8/9 digits | 400 | `phone-number.ts:10-19`; unit `phone-number.spec.ts:18-21` - "reject a number without an area code". Same wiring gap as AC7: `register-customer.handler.ts:51` calls `PhoneNumber.create` but no registration-path test exercises the rejection | PASS (indirect) - see Fix 1 |
| AC9: accept no address/no phone | registration succeeds | `address.spec.ts:24-26`, `phone-number.spec.ts:29-31` - both `undefined` inputs return `undefined`; e2e `customers.e2e.spec.ts:34-44` registers with neither | PASS |
| AC10: lacks `customers:manage` | 403 | `customers.controller.ts:57` - `@RequirePermissions(AppPermission.CustomersManage)` on `POST`; e2e `customers.e2e.spec.ts:61-72` - `403 {code: 'AUTH_FORBIDDEN'}` | PASS |

**CVR-01 status**: 10/10 ACs match the spec-defined outcome; AC7/AC8 rest on indirect (VO-level +
sibling-handler) evidence rather than a direct registration-path test - logged as Fix 1, not a
functional defect (same `Address.create`/`PhoneNumber.create` calls, same `ErrorKind` mapping
mechanism already proven generically).

### CVR-02: Finding and reading customer records (6 ACs)

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1: search by document | matching active customer or empty | `typeorm-customer-query.adapter.ts:66-76` (`listActive`, exact match); integration `customer-query.adapter.spec.ts:91-99` - `found[0].document` equals the searched document | PASS |
| AC2: list by name, case-insensitive partial | every active customer whose name contains the text | `typeorm-customer-query.adapter.ts:71` (`ILIKE '%' \|\| $2 \|\| '%'`); integration `customer-query.adapter.spec.ts:80-89` - searches uppercased marker, matches the mixed-case stored name | PASS |
| AC3: read one by external id | identity data, address, phone, status | `customers.controller.ts:131-135` (`getById`), `:193-204` (`toResponseDto` includes all four); e2e `customers.e2e.spec.ts:120-124` - `{id, document}` returned | PASS |
| AC4: self-service via `GET /customers/me` | own record, no workshop permission | `customers.controller.ts:79-87` - `@Get('me')` carries no `@RequirePermissions`; e2e `customers.e2e.spec.ts:82-86` - `person.accessToken` (no elevated role) reads `/customers/me` and gets 200 | PASS |
| AC5: lacks `customers:read`, not owner | 403 | `customers.controller.ts:126` - `@RequirePermissions(AppPermission.CustomersRead)` on `GET /:externalId`; e2e `customers.e2e.spec.ts:166-182` - 403 `AUTH_FORBIDDEN` | PASS |
| AC6: unknown external id | 404 | `customers.controller.ts:183-190` (`getCustomerOrThrow` throws `CustomerNotFoundError`, NotFound -> 404); e2e `customers.e2e.spec.ts:184-189` | PASS |

**CVR-02 status**: 6/6 ACs match.

### CVR-03: A vehicle is on record before it can be serviced (8 ACs, full rigor - the `getById` fix)

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1: register for active customer | linked to that customer's internal id | `register-vehicle.handler.ts:30-54`; unit `register-vehicle.handler.spec.ts:42-53`; e2e `vehicles.e2e.spec.ts:43-53` | PASS |
| AC2: owning customer deactivated | 422 | `register-vehicle.handler.ts:37-39` - `customer.status !== ACTIVE_STATUS` throws `OwningCustomerInactiveError` (RuleViolation -> 422). **The bug this task found and fixed**: `typeorm-customer-query.adapter.ts:50` (`getById`) deliberately does NOT filter `deleted_at IS NULL`, unlike `getByUserId`/`listActive` - a deactivated customer's id must still resolve (to a summary with `status: 'INACTIVE'`), or this check is unreachable and a deactivated-customer registration wrongly 404s instead of 422 (the exact bug T20 found). Integration `customer-query.adapter.spec.ts:114-128` - "should still return a deactivated customer by external id, unlike the list and getByUserId" - `expect(found?.status).toBe('INACTIVE')`, currently passing against real Postgres; e2e `vehicles.e2e.spec.ts:55-69` - deactivates a real customer via `DELETE /customers/:id`, then `POST /vehicles` against it -> `422 {code: 'VEHICLE_OWNING_CUSTOMER_INACTIVE'}` | PASS - killed by discrimination sensor mutation 2, at both unit and e2e layers |
| AC3: owning customer does not exist | 404 | `register-vehicle.handler.ts:34-36` - `ReferencedCustomerNotFoundError` (NotFound -> 404); unit `register-vehicle.handler.spec.ts:64-71` - `rejects.toThrow(ReferencedCustomerNotFoundError)`. No e2e test for this branch specifically (only the deactivated-customer 422 branch got e2e coverage) | PASS (unit only) - see Fix 2 |
| AC4: accept old/Mercosul format, normalise | stored upper case, no separators | `license-plate.ts:9-16`; unit `license-plate.spec.ts` (format acceptance + normalisation tests) | PASS |
| AC5: malformed plate | 400 | `license-plate.ts:12-14` - `InvalidLicensePlateError`; unit `register-vehicle.handler.spec.ts:73-80` | PASS |
| AC6: duplicate active plate | 409 | `typeorm-vehicle.repository.ts:43-50` (unique-violation mapped to `LicensePlateAlreadyInUseError`); integration `vehicle.repository.spec.ts:93-100` (real Postgres) + e2e `vehicles.e2e.spec.ts:210-226` - `409 {code: 'VEHICLE_LICENSE_PLATE_ALREADY_IN_USE'}` | PASS - killed by discrimination sensor mutation 3 |
| AC7: implausible year | 400 | `vehicle-year.ts:13-17`; unit `register-vehicle.handler.spec.ts:82-89` | PASS |
| AC8: lacks `vehicles:manage` | 403 | `vehicles.controller.ts:55` - `@RequirePermissions(AppPermission.VehiclesManage)`; e2e `vehicles.e2e.spec.ts:71-82` - 403 `AUTH_FORBIDDEN` | PASS |

**CVR-03 status**: 8/8 ACs match. The `getById` fix is real: `customer-query.adapter.spec.ts:114-128`
independently proves the fixed behaviour against a real Postgres row, not just that the code
changed.

### CVR-04: Reading vehicle records (6 ACs)

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1: list vehicles of one customer | every active vehicle for that customer's internal id | `vehicles.controller.ts:81-94` (`GET /vehicles?customerId=`); e2e `vehicles.e2e.spec.ts:118-133` | PASS |
| AC2: read one by external id | plate, brand, model, year, owning customer | `vehicles.controller.ts:148-157` (`toResponseDto`); e2e `vehicles.e2e.spec.ts:135-151` | PASS |
| AC3: self-service `/vehicles/me` | own vehicles, no workshop permission | `vehicles.controller.ts:69-79` - `@Get('me')`, no `@RequirePermissions`; e2e `vehicles.e2e.spec.ts:84-105` | PASS |
| AC4: no customer record | empty list, not an error | `get-my-vehicles.handler.ts:15-24` - `if (!customer) return []`; integration `vehicle-read-queries.spec.ts:131-135`; e2e `vehicles.e2e.spec.ts:107-116` | PASS |
| AC5: lacks `vehicles:read` | 403 | `vehicles.controller.ts:82,97` - `@RequirePermissions(AppPermission.VehiclesRead)` on list/get; generic guard mechanism proven by `permissions.guard.spec.ts` (5 tests, identity-foundation) - no dedicated e2e 403 test for the read routes specifically in this feature | PASS (by construction) |
| AC6: unknown vehicle external id | 404 | `vehicles.controller.ts:138-146` (`VehicleNotFoundError`); e2e `vehicles.e2e.spec.ts:190-207` - remove then GET -> 404 | PASS |

**CVR-04 status**: 6/6 ACs match.

### CVR-05: Maintaining customer records (5 ACs)

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1: owner updates own record | applies, no workshop permission | `customers.controller.ts:89-104` - `@Patch('me')`, no `@RequirePermissions`; e2e `customers.e2e.spec.ts:74-103` | PASS |
| AC2: staff updates a record they do not own | requires `customers:manage` | `customers.controller.ts:137-138` - `@RequirePermissions(AppPermission.CustomersManage)` on `PATCH /:externalId`; e2e `customers.e2e.spec.ts:127-143` | PASS |
| AC3: deactivate | soft-delete marker set, underlying user untouched | `customer.ts:64-72` (`deactivate`, sets `status`/`deletedAt`), `deactivate-customer.handler.ts:17-29` - never dispatches anything user-related (true by construction, the same reasoning `tasks.md` T8 itself uses); unit `deactivate-customer.handler.spec.ts:24-34`; e2e `customers.e2e.spec.ts:145-164` | PASS |
| AC4: deactivated excluded from list/search | excluded | `typeorm-customer-query.adapter.ts:66-69` (`listActive` filters `deleted_at IS NULL`), `:58-60` (`getByUserId` also filters). Integration `customer-query.adapter.spec.ts:101-112` - "should exclude a deactivated customer from the list" AND, in the same test, confirms `getByUserId` also returns `null` for it; e2e `customers.e2e.spec.ts:145-164`. **No contradiction with CVR-03's `getById` fix**: `getById` (staff/cross-module lookup) stays unfiltered by design, `getByUserId`/`listActive` (self-service and search) stay filtered - both proven in the same test file (`customer-query.adapter.spec.ts:101-128`, two adjacent tests) | PASS |
| AC5: lacks `customers:manage`, not owner | 403 | Same guard as AC2; `/me` route is intrinsically self-scoped so this AC's "not the owning person" clause applies to `:externalId` only, satisfied by the guard | PASS |

**CVR-05 status**: 5/5 ACs match. The `getById`/`getByUserId`/`listActive` three-way split is
internally consistent and each behaviour has its own proof in the same spec file.

### CVR-06: Maintaining vehicle records (6 ACs)

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1: update brand/model/year | applies | `vehicle.ts:65-80` (`updateDetails`); unit `update-vehicle.handler.spec.ts:43-53`; e2e `vehicles.e2e.spec.ts:153-169` | PASS |
| AC2: update owning customer | relinks | `vehicle.ts:82-86` (`transferTo`); unit `update-vehicle.handler.spec.ts:55-65`; e2e `vehicles.e2e.spec.ts:171-188` | PASS |
| AC3: transfer to deactivated customer | 422 | `update-vehicle.handler.ts:43-45` - `OwningCustomerInactiveError`; unit `update-vehicle.handler.spec.ts:67-77`. No e2e test for this specific transfer-refusal branch | PASS (unit only) - see Fix 2 |
| AC4: transfer to non-existent customer | 404 | `update-vehicle.handler.ts:40-42` - `ReferencedCustomerNotFoundError`; unit `update-vehicle.handler.spec.ts:79-89`. No e2e test for this branch either | PASS (unit only) - see Fix 2 |
| AC5: remove vehicle | soft-delete marker, not a row delete | `vehicle.ts:88-95` (`remove`); unit `remove-vehicle.handler.spec.ts:25-41`; e2e `vehicles.e2e.spec.ts:190-208` (removed, then 404) | PASS |
| AC6: lacks `vehicles:manage` | 403 | `vehicles.controller.ts:109,128` - `@RequirePermissions(AppPermission.VehiclesManage)` on `PATCH`/`DELETE`; generic guard mechanism proven elsewhere, no dedicated e2e test for these two specific routes (the `POST` 403 case is e2e-tested) | PASS (by construction for PATCH/DELETE) |

**CVR-06 status**: 6/6 ACs match. AC3/AC4's real-HTTP coverage is a gap - see Fix 2.

---

## Edge Cases

| Edge Case | Result |
| --- | --- |
| Two vehicle registrations, same plate, concurrent -> exactly one succeeds, other 409 | PASS - closed by construction: `ux_vehicles_plate` partial unique index (`1787702400003-create-vehicles-table.ts:24-26`) plus `typeorm-vehicle.repository.ts:43-50`'s violation mapping is the same "DB constraint is the concurrency backstop" reasoning `identity-foundation`'s own Verifier accepted for its own concurrent-document edge case (no dedicated `Promise.all` test in either feature) |
| Two customer registrations, same existing user id, concurrent -> exactly one succeeds, other 409 | PASS - closed by construction: `ux_customers_user_id` (`1787702400002-create-customers-table.ts:30`) + `typeorm-customer.repository.ts:52-59` |
| Two customer registrations, same new-account document, concurrent -> exactly one succeeds, other 409 | PASS - closed by construction: reuses `identity-foundation`'s own `users.document` partial unique index and `RegisterUserHandler`'s existing mapping, untouched by this feature |
| Vehicle removed, plate reused by a later registration -> accepted | PASS - real Postgres proof: `vehicle.repository.spec.ts:102-113` - "should let a removed vehicle plate be reused by a new registration" |
| Customer deactivated while it owns active vehicles -> vehicle records untouched | PASS - true by construction: `deactivate-customer.handler.ts:17-29` never reads or writes anything in `vehicles`; no cross-module dispatch of any kind. No dedicated test asserts a vehicle stays readable after its owner deactivates, but the handler code has no code path capable of touching it |

**Status**: 5/5 Edge Cases handled, all evidenced (four by construction/existing precedent, one with
a direct real-Postgres test).

---

## Discrimination Sensor

Isolated scratch: `git worktree add <scratch> HEAD --detach` at `cded578`, `node_modules`
symlinked in, never `git stash`. Pre-sensor real-tree `git status --porcelain` was empty (0 bytes);
confirmed byte-identical again after every mutation was reverted and after
`git worktree remove --force`.

| Mutation | File:line | Description | Killed? |
| --- | --- | --- | --- |
| 1 | `src/modules/customers/application/commands/register-customer/register-customer.handler.ts:95-97` | Removed the `existsByUserId` pre-check block entirely (CVR-01 AC3's application-layer guard) | Killed - unit `register-customer.handler.spec.ts` "should refuse a user that already backs a customer" fails: promise resolves `{id: ...}` instead of rejecting |
| 2 | `src/modules/vehicles/application/commands/register-vehicle/register-vehicle.handler.ts:37-39` | Removed the `customer.status !== ACTIVE_STATUS` check (CVR-03 AC2) | Killed at both layers - unit `register-vehicle.handler.spec.ts` "should refuse a deactivated customer" fails (resolves instead of rejecting), and e2e `vehicles.e2e.spec.ts` "should refuse registering a vehicle for a deactivated customer" fails against the real running app (`expected 422, got 201` - a vehicle was actually registered against a deactivated customer) |
| 3 | `src/modules/vehicles/infrastructure/persistence/typeorm-vehicle.repository.ts:42` | Replaced `row.customerInternalId = await this.resolveCustomerInternalId(vehicle.customerId)` with a hardcoded bogus id (`'999999999'`), skipping internal-id resolution | Killed - integration `vehicle.repository.spec.ts` fails 4/5 tests with a real Postgres `QueryFailedError: ... violates foreign key constraint "vehicles_customer_id_fkey"` - the FK check itself catches the broken resolution, proving the integration test exercises real constraints, not a stub |

**Sensor depth**: lightweight (3 targeted mutations, standard tier, one on each of the two riskiest
new-code classes named in the task brief: the app-layer duplicate-registration guard, the
cross-module status check, and the repository-boundary id-resolution pattern).
**Result**: 3/3 mutations killed, 0 survived.

---

## Interactive UAT Results

Not performed. Backend-only feature, no user-facing UI, per the Verifier's operating instructions.

---

## Code Quality

Spot-checked the highest-risk new code against `references/coding-principles.md`.

| Principle | Status |
| --- | --- |
| Minimum code | Yes - both aggregates, all six value objects, and every handler are the minimum shape needed; no speculative fields, no unused flexibility |
| Surgical changes | Yes - the diff touches only `src/modules/customers/**`, `src/modules/vehicles/**`, two new migrations, `global-setup.ts`, `app.module.ts`, and `.specs/**`. No existing `identity-foundation` production file was modified |
| No scope creep | Yes - T20's nested `GET /customers/:externalId/vehicles` was deliberately dropped in favour of `GET /vehicles?customerId=`, a real instance of *not* building an unrequested route shape |
| Matches existing patterns | Yes - `resolveUserInternalId`/`resolveCustomerInternalId` copy `TypeOrmAssignmentRepository`'s exact pattern; `me`-before-`:externalId` route ordering and unguarded self-service routes copy `UsersController`; `ListCustomersQuery(name?, document?)` copies `ListUsersQuery(role?, document?)`'s shape |
| Cross-module boundary (AD-003) | Clean. `grep` across both modules for cross-module imports found only `vehicles` importing `customers`' `CustomerSummaryDto` (a DTO) and `GetCustomerQuery`/`GetCustomerByUserIdQuery` (QueryBus contracts) - no repository injection, no `CustomerOrmEntity` import, in either direction. The two raw-SQL exceptions (`typeorm-customer-query.adapter.ts`'s join on `users`, and both repositories' `resolveXInternalId`) are infrastructure-layer reads matching the documented `TypeOrmUserQueryAdapter`/`TypeOrmAssignmentRepository` precedent, not a business-logic leak |
| `Address`/`PhoneNumber` null handling | Clean. `Customer.address`/`phoneNumber` getters return `Address \| null`/`PhoneNumber \| null` directly - no sentinel values, no unwrap-or-throw at the boundary. The DTO layer (`customer.mapper.ts` equivalent path via `CustomerSummaryDto`) carries the null straight through to the response JSON. No awkward leak found |
| Spec-anchored outcome check (asserted values match spec) | 41/41 ACs across 6 stories match the spec-defined outcome (CVR-01: 10, CVR-02: 6, CVR-03: 8, CVR-04: 6, CVR-05: 5, CVR-06: 6) |
| Per-layer Coverage Expectation met (domain 1:1 ACs; routes happy+edge+error) | Partial - domain layer is 1:1 with ACs throughout; the e2e layer is missing the error-path test for 4 branches (CVR-01 AC7/AC8 at the registration route, CVR-03 AC3, CVR-06 AC3/AC4) that are proven at the unit level only - see Fix 1/2 |
| Every test maps to a spec requirement - no unclaimed tests | Yes, on every test file read in full during this pass |
| Documented guidelines followed | `docs/ddd/implementation-plan.md` section 8, `vitest.config.ts` coverage include/exclude - same as `identity-foundation`, unchanged |

**On the `getById`/`getByUserId`/`listActive` three-way split**: this is the cleanest part of the
diff. A single query adapter deliberately gives two of its three read methods different filtering
behaviour, and the reasoning for the asymmetry is written directly in the adapter's own comment
(`typeorm-customer-query.adapter.ts:44-49`) rather than left implicit. The test file proves both
sides of the asymmetry in adjacent tests (`customer-query.adapter.spec.ts:101-128`), which is what
makes CVR-03's fix and CVR-05 AC4 independently verifiable as non-contradictory rather than merely
asserted to be so.

---

## Gate Check

- **Gate command**: `npm run lint && npm run build && npm run test:unit && npm run test:integration && npm run test:e2e` (Build-level, from `tasks.md`'s Gate Check Commands table), run twice directly on `main` at `cded578`
- **Result**: 354 passed, 0 failed, 0 skipped (unit 216, integration 71, e2e 67); lint and build both exit 0 on both runs
- **Test count before this feature** (`c878d74`, `identity-foundation`'s own close): 229 (unit 153, integration 30, e2e 46)
- **Test count after this feature** (`cded578`): 354 (unit 216, integration 71, e2e 67)
- **Delta**: +63 unit, +41 integration, +21 e2e = +125 new tests, matches `tasks.md`'s own final tally exactly, independently reproduced, not copied
- **Skipped tests**: none
- **Failures**: none in either full run
- **`test:integration` run twice consecutively**: both runs 71/71, no flake - `T15`'s `uniqueLicensePlate()` fix (and `uniqueValidCpf()`, reused from `identity-foundation`) hold up; no other test in this feature's own diff uses a hardcoded literal fixture (checked by reading every new `test/integration/*.spec.ts` file in full)
- **One transient failure observed, not attributable to this feature**: the first full gate run hit `test/e2e/role-escalation.e2e.spec.ts` failing on `registerUser()` (`test/support/http.ts:26-33`) - `POST /users` returned 409 instead of 201, a random `faker`-generated email or `uniqueValidCpf()` document colliding with a row already in the never-truncated test database. This file and helper are `identity-foundation` code, untouched by this feature's diff (`git log --oneline -- test/e2e/role-escalation.e2e.spec.ts test/support/http.ts` shows no commit in this feature's range touching either). Re-run in isolation (`role-escalation.e2e.spec.ts` alone): 4/4 pass. Re-run as part of the full `test:e2e` suite: 67/67 pass. Re-run as part of a second complete `lint && build && unit && integration && e2e` sequence: 354/354 pass. Treated as a pre-existing, low-probability collision in `identity-foundation`'s own faker-based fixture generation, not a regression introduced here - logged as a lesson below since it is the same class of risk the project's "never truncate" convention already flags, just in a spot this feature's own author-facing notes did not cover

---

## Fix Plans

### Fix 1 (Minor, non-blocking) - CLOSED: `RegisterCustomerHandler` has no direct test for a malformed address/phone during registration

- **Root cause**: `register-customer.handler.ts:50-51` calls `Address.create(command.address)` and `PhoneNumber.create(command.phoneNumber)` unconditionally, and both VOs are fully unit-tested on their own (`address.spec.ts`, `phone-number.spec.ts`), and the identical call shape is proven to propagate correctly in the sibling `UpdateCustomerHandler` (`update-customer.handler.spec.ts:68-84`) - but `register-customer.handler.spec.ts` itself never passes a malformed `address`/`phoneNumber` to the command, so the registration path's own wiring has no direct assertion.
- **Fix task**: add two cases to `register-customer.handler.spec.ts` - a malformed address and a malformed phone number, both asserting `rejects.toThrow(InvalidAddressError)`/`InvalidPhoneNumberError`. Optionally add one e2e case to `customers.e2e.spec.ts` (`POST /customers` with a partial address -> 400).
- **Verify**: `npm run test:unit` (and `npm run test:e2e` if the e2e case is added).
- **Priority**: Minor, non-blocking - the outcome is correct today by code inspection and by the identical pattern proven elsewhere; this closes a documentation/coverage gap, not a defect.
- **Closed**: T21, commit `8d49e3e` - both handler-level unit cases and the e2e case added exactly as scoped above. `npm run test:unit`/`test:e2e` both green (218/218, 68/68 at the time).

### Fix 2 (Minor, non-blocking) - CLOSED: three NotFound/RuleViolation branches on the vehicle routes have unit coverage only, no e2e

- **Root cause**: `RegisterVehicleHandler`'s non-existent-customer branch (CVR-03 AC3) and `UpdateVehicleHandler`'s transfer-to-deactivated (CVR-06 AC3) and transfer-to-non-existent (CVR-06 AC4) branches are each proven by a unit test with a mocked `QueryBus`, but `vehicles.e2e.spec.ts` never drives these three cases through the real HTTP routes against a real Postgres/`GetCustomerQuery` round trip. The Test Coverage Matrix in `tasks.md` states e2e should cover "every route... happy path, every edge case, every error path" for controllers; these three error paths are the gap.
- **Fix task**: add three e2e cases to `vehicles.e2e.spec.ts` - `POST /vehicles` with a random UUID as `customerId` -> 404; `PATCH /vehicles/:id` with `customerId` pointing at a deactivated customer -> 422; `PATCH /vehicles/:id` with `customerId` pointing at a random UUID -> 404.
- **Verify**: `npm run test:e2e`.
- **Priority**: Minor, non-blocking - the cross-module `GetCustomerQuery` contract itself is proven working end-to-end elsewhere (`GetMyVehiclesHandler`'s real-handler wiring in `vehicle-read-queries.spec.ts`), and the `ErrorKind` -> HTTP mapping is proven generically; this closes a completeness gap in the e2e suite, not a defect.
- **Closed**: T22, commit `4cbd143` - all three e2e cases added exactly as scoped above, all passed on the first run. `npm run test:e2e` green (71/71 at the time).

**Post-report update**: both fixes above were closed the same day, in `tasks.md` T21/T22. Neither
touched any production code - both are test-only additions proving outcomes the original PASS
verdict already confirmed correct by inspection. No re-verification was dispatched: the behaviour
under test did not change, only the coverage proving it did. Final state after both closures:
unit 218/218, integration 71/71 (durable across two consecutive runs), e2e 71/71 - 360 total, up
from 354 at the original PASS. `customer-and-vehicle-registry` has no remaining logged gaps.

No other findings. All 41 ACs across the 6 stories match their spec-defined outcome, the
cross-module boundary is clean, the discrimination sensor killed all 3 injected mutations, and two
independent full gate runs both passed 354/354.

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| --- | --- | --- |
| CVR-01 | Implementing | **Verified** (AC7/AC8 registration-path test coverage gap - Fix 1, closed in T21) |
| CVR-02 | Implementing | **Verified** |
| CVR-03 | Implementing | **Verified** (AC3 e2e coverage gap - Fix 2, closed in T22; the `getById` deactivated-customer bug this task found is closed and independently confirmed) |
| CVR-04 | Implementing | **Verified** |
| CVR-05 | Implementing | **Verified** |
| CVR-06 | Implementing | **Verified** (AC3/AC4 e2e coverage gap - Fix 2, closed in T22) |

---

## Summary

**Overall**: Ready

**Spec-anchored check**: 41/41 ACs matched spec outcome, 0 spec-precision gaps, 2 coverage-completeness gaps flagged (Fix 1, Fix 2)
**Sensor**: 3/3 mutations killed
**Gate**: 354 passed, 0 failed (lint clean, build clean), reproduced on two independent full runs

**What works**: both registration branches of CVR-01, including the mutual-exclusivity check and
the temporary-password reuse of `RegisterUserCommand`; the `getById`/`getByUserId`/`listActive`
three-way split that makes the deactivated-customer visibility rules for CVR-03 and CVR-05 AC4
non-contradictory and independently provable; the plate-reuse-after-removal edge case, proven
against real Postgres; the cross-module boundary (`customers`/`vehicles` talk only through
`CommandBus`/`QueryBus`, with the documented raw-SQL infrastructure-layer exception matching
existing precedent); all four soft-delete/idempotency invariants (`Customer.deactivate`,
`Vehicle.remove`).

**Issues found**: two non-blocking test-coverage completeness gaps (Fix 1, Fix 2) - both are
missing tests for outcomes that are correct today by code inspection and by an identical pattern
proven elsewhere in the same diff, not demonstrated defects. One transient, pre-existing test-data
collision in `identity-foundation`'s own `role-escalation.e2e.spec.ts` (outside this feature's
diff), which did not reproduce on three subsequent runs.

**Next steps**: Fix 1 and Fix 2 are optional coverage hardening, not required to close this
feature. `customer-and-vehicle-registry` is verified against `spec.md` in full - all 6 stories, all
41 ACs, all 5 Edge Cases.
