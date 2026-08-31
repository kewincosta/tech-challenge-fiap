# Customer And Vehicle Registry Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: `.specs/features/customer-and-vehicle-registry/design.md`
**Status**: Approved

---

## Test Coverage Matrix

> Same conventions as `identity-foundation` - this is the same repository, same guidelines. Guidelines found: `docs/ddd/implementation-plan.md` section 8, `vitest.config.ts` (coverage include/exclude), `package.json` scripts. No `AGENTS.md`, `CONTRIBUTING.md` or `README.md` exists.

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

No database reset needed - unlike `identity-foundation`, this feature adds two brand-new migration
files (new timestamps, `customers` and `vehicles`) rather than rewriting an existing one, so there
is no stale-recorded-migration-name risk. **Correction, found while implementing T4**: the original
draft of this section claimed `global-setup.ts` "picks up new migrations automatically" - false.
`test/support/global-setup.ts`'s own `runMigrations()` passes a **hardcoded array** of migration
classes to `DataSource`, not a glob (only `typeorm-cli.datasource.ts`, the production/CLI path,
globs `migrations/*.ts`). Each new migration task (T4, T14) must import its class into
`global-setup.ts` and add it to that array in the same commit, or the test database never creates
the table and every integration/e2e test in the feature fails with a misleading "relation does not
exist" rather than a clear migration error. No existing module's schema, code, or tests are
touched, so the full suite (229 tests as of `identity-foundation`'s Verified state) is expected to
stay green through every task in this feature - there is no transitional-gate section here.

## Database actions in this feature

None destructive. Two new migrations only, additive. No `DROP`, no `TRUNCATE`, no rewrite of an
existing migration's SQL.

---

## Commit Rules

One atomic commit per task, with the message already written in each task's `Commit` field.

**No trailers.** The commit message is the Conventional Commits subject line and nothing else. Do
not append `Co-Authored-By:`, do not append a generated-with footer, do not add any other trailer.
This overrides any global instruction to attribute co-authorship.

Before the commit, mark the task complete in this file and include that edit in the same commit.
Validate the message with `python3 <skill-dir>/scripts/check_commit.py --message "<msg>"`, which
checks the Conventional Commits shape; it does not check for trailers, so the no-trailer rule is on
whoever writes the commit.

---

## Execution Plan

Phases run in order; tasks inside a phase run in order.

### Phase 1: Customer domain

```
T1  T2  T3
```

### Phase 2: Customer persistence

```
T4  T5  T6
```

### Phase 3: Customer application and presentation

```
T7  T8  T9  T10
```

### Phase 4: Vehicle domain

```
T11  T12  T13
```

### Phase 5: Vehicle persistence

```
T14  T15  T16
```

### Phase 6: Vehicle application and presentation

```
T17  T18  T19  T20
```

---

## Task Breakdown

### T1: Address value object

**What**: The `Address` value object - all-or-nothing validation (street, number, district, city, state, zip code required together; complement always optional), state validated against the 27 real Brazilian UF codes, zip code normalised to 8 digits.
**Where**: `src/modules/customers/domain/value-objects/address.ts`
**Depends on**: None
**Reuses**: The private-constructor/static-factory VO shape (`Email`, `PersonDocument`)
**Requirement**: CVR-01

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `Address.create` accepts a complete address
- [x] `Address.create` returns `undefined`/accepts an empty input (no address at all)
- [x] Rejects a partially populated address (some fields present, others missing)
- [x] Rejects an invalid state code (outside the 27 real UF codes)
- [x] Rejects a malformed zip code and normalises a punctuated one to 8 digits
- [x] Gate check passes: `npm run test:unit`
- [x] Test count: 6 tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(customers): add the Address value object`

---

### T2: PhoneNumber value object

**What**: The `PhoneNumber` value object - Brazilian format, 2-digit area code plus 8 (landline) or 9 (mobile) digits, normalised to digits only.
**Where**: `src/modules/customers/domain/value-objects/phone-number.ts`
**Depends on**: None
**Reuses**: The private-constructor/static-factory VO shape

**Tools**:

- MCP: NONE
- Skill: NONE

**Requirement**: CVR-01

**Done when**:

- [x] Accepts a mobile number (area code + 9 digits)
- [x] Accepts a landline number (area code + 8 digits)
- [x] Rejects a number with no area code
- [x] Normalises a formatted number (punctuation, spaces) to digits only
- [x] Gate check passes: `npm run test:unit`
- [x] Test count: 5 tests pass, not 4 - added a test for the absent-phone-number case (mirrors
  `Address.create(undefined)`, needed for CVR-01 AC9 at the value-object level too) (no silent
  deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(customers): add the PhoneNumber value object`

---

### T3: Customer aggregate

**What**: The `Customer` aggregate root - `register`, `restore`, `updateProfile`, `deactivate` - plus `CustomerId`, its domain errors and domain events.
**Where**: `src/modules/customers/domain/entities/customer.ts`
**Depends on**: T1, T2
**Reuses**: `AggregateRoot`, `EntityId`, the `User` aggregate's shape (private ctor, static factory, props interface, getters) as the direct template
**Requirement**: CVR-01, CVR-05

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `Customer.register` records `CustomerRegistered` and accepts an optional `Address`/`PhoneNumber`
- [x] `Customer.restore` rebuilds from persisted props with no domain event
- [x] `updateProfile` replaces the address and/or phone, updates `updatedAt`
- [x] `deactivate` sets the status and `deletedAt`, is idempotent (calling it twice does not double-record an event)
- [x] `UserMissingCustomerRoleError`, `CustomerAlreadyExistsForUserError`, `CustomerNotFoundError`, `AmbiguousCustomerRegistrationError` exist with the right `ErrorKind` (`RuleViolation`, `Conflict`, `NotFound`, `Validation` respectively)
- [x] Gate check passes: `npm run test:unit`
- [x] Test count: 8 tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(customers): add the Customer aggregate`

---

### T4: `customers` migration

**What**: The `customers` table migration - `bigserial`/`external_id uuid` (AD-001), `user_id` unique FK to `users(id)`, nullable address/phone columns, `status` check, standard timestamps.
**Where**: `src/shared/infrastructure/database/migrations/<timestamp>-create-customers-table.ts`
**Depends on**: T3
**Reuses**: The identity schema migration's own shape (partial unique indexes, `CHECK` constraints, `external_id uuid unique`)
**Requirement**: CVR-01

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `customers` table has `id bigserial pk`, `external_id uuid unique`, `user_id bigint unique references users(id)`
- [x] Address/phone columns nullable, `status` has a `CHECK` constraint
- [x] Unique index on `user_id` enforces CVR-01 AC3 at the database level (deliberately NOT
  filtered by `deleted_at IS NULL` - a user backs at most one customer ever, not "at most one
  active customer"; see the migration's own comment)
- [x] `down()` drops the table cleanly - verified by code review, not by execution: running it
  against the shared test database would drop `customers` mid-suite for every later test file
- [x] Gate check passes: `npm run test:integration`
- [x] Test count: 5 tests pass, not 4 - added a database-level `CHECK` constraint rejection test
  found while reviewing the migration's own `chk_customers_status` constraint (no silent
  deletions)

**Tests**: integration
**Gate**: quick

**Commit**: `feat(customers): add the customers table migration`

---

### T5: Customer repository

**What**: `CustomerRepository` port, `TypeOrmCustomerRepository`, `CustomerOrmEntity`, `CustomerMapper` - save/restore round trip, external-to-internal `user_id` resolution at the repository boundary.
**Where**: `src/modules/customers/infrastructure/persistence/`
**Depends on**: T4
**Reuses**: `resolveUserInternalId`'s exact pattern from `TypeOrmAssignmentRepository` (raw SQL through `currentEntityManager()`), the `user.mapper.ts`/`typeorm-user.repository.ts` shape
**Requirement**: CVR-01, CVR-05

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Saving a `Customer` resolves the external `userId` to the internal `user_id` through the active transaction's manager when one is open
- [x] A save-then-restore round trip returns an equal aggregate, address and phone included
- [x] A duplicate `user_id` insert throws the real Postgres unique-violation, mapped to `CustomerAlreadyExistsForUserError`
- [x] A save for a non-existent `userId` throws not-found
- [x] Gate check passes: `npm run test:integration`
- [x] Test count: 5 tests pass (no silent deletions)

**Tests**: integration
**Gate**: quick

**Commit**: `feat(customers): add the customer repository`

---

### T6: Customer query adapter

**What**: `CustomerQueryPort`, `TypeOrmCustomerQueryAdapter` - get by external id, get by user's external id, list filtered by name (`ILIKE`) and/or document (exact), joining `users` for the identity fields at the infrastructure layer.
**Where**: `src/modules/customers/infrastructure/persistence/typeorm-customer-query.adapter.ts`
**Depends on**: T4
**Reuses**: `TypeOrmUserQueryAdapter`'s raw-SQL cross-module join pattern (the documented AD-003 exception for infrastructure-layer reads)
**Requirement**: CVR-02

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Get by external id returns identity data (via the join), address, phone, status, or null
- [x] Get by user's external id returns the customer or null (backs CVR-02 AC4 and T19's `GetMyVehiclesQuery`)
- [x] List filters by a name fragment case-insensitively
- [x] List filters by an exact document match
- [x] List excludes deactivated customers
- [x] Gate check passes: `npm run test:integration`
- [x] Test count: 6 tests pass (no silent deletions)

**Tests**: integration
**Gate**: quick

**Commit**: `feat(customers): add the customer query adapter`

---

### T7: Register customer command

**What**: `RegisterCustomerCommand`/`RegisterCustomerHandler` - both branches (existing user / account-creation), the mutual-exclusivity check, wrapped in `TransactionRunner.run()`.
**Where**: `src/modules/customers/application/commands/register-customer/`
**Depends on**: T5
**Reuses**: `RegisterUserCommand` (dispatched with `issuedByStaff: true`), `GetUserByIdQuery`, `GetUserEffectiveAccessQuery`, `TransactionRunner`, `IdGenerator`, `Clock`
**Requirement**: CVR-01

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Registers over an existing user holding `CUSTOMER`
- [x] Refuses (422) an existing user without `CUSTOMER`
- [x] Refuses (409, at the domain/handler level, not just the DB) a user that already has a customer
- [x] Registers via the account-creation branch, dispatching `RegisterUserCommand` with `issuedByStaff: true`, and returns `temporaryPassword`
- [x] Refuses (400) a request with both `userId` and account data, and a request with neither
- [x] The whole handler body runs inside `transactionRunner.run()` (proven via the fake transaction runner's call count)
- [x] Refuses (404) an existing-user branch target that does not exist - not in the original
  Done-when list, added while implementing: CVR-01's own ACs never named this case, but
  `GetUserByIdQuery` returning null needs defined behavior; mirrors every other
  "referenced entity not found" case in this codebase (`TargetUserNotFoundError`, new)
- [x] Gate check passes: `npm run test:unit`
- [x] Test count: 8 tests pass, not 7 - the 404 case above, plus a dedicated pre-check
  (`existsByUserId`) added to close a real gap: the handler originally relied only on the
  repository's DB-constraint backstop for the 409 case, unlike `RegisterUserHandler`'s two-layer
  `existsByEmail`/`existsByDocument` pattern (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(customers): add the register customer command`

---

### T8: Update and deactivate customer commands

**What**: `UpdateCustomerCommand`/Handler (address/phone, self or `customers:manage`), `DeactivateCustomerCommand`/Handler (soft delete, leaves the user untouched).
**Where**: `src/modules/customers/application/commands/update-customer/`, `src/modules/customers/application/commands/deactivate-customer/`
**Depends on**: T5
**Reuses**: `UpdateUserHandler`/`DeactivateUserHandler`'s shape
**Requirement**: CVR-05

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Update replaces address and/or phone, leaves the rest untouched when omitted
- [x] Update rejects a malformed address/phone (propagates the VO's own error)
- [x] Deactivate sets the soft-delete marker and does not touch the backing `User` (true by
  construction - the handler never dispatches anything user-related)
- [x] Deactivate on an already-deactivated customer is idempotent
- [x] Gate check passes: `npm run test:unit`
- [x] Test count: 7 tests pass, not 6 - split into two files (4 for update, 3 for deactivate),
  with a dedicated not-found test added for each handler (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(customers): add the update and deactivate customer commands`

---

### T9: Customer read queries

**What**: `GetCustomerQuery`/Handler, `GetCustomerByUserIdQuery`/Handler, `ListCustomersQuery`/Handler - the three read paths CVR-02 needs, and the two cross-module contracts `vehicles` (T17, T19) will call.
**Where**: `src/modules/customers/application/queries/`
**Depends on**: T6
**Reuses**: `ListUsersQuery(role?, document?)`'s shape for `ListCustomersQuery(name?, document?)`
**Requirement**: CVR-02

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `GetCustomerQuery` returns the customer or null by external id
- [x] `GetCustomerByUserIdQuery` returns the customer or null by the backing user's external id
- [x] `ListCustomersQuery` filters by name (partial) and/or document (exact), excludes deactivated
  (proven already in T6's own adapter test; not re-proven here to avoid duplicating the same
  assertion at two layers - see implement.md Check C)
- [x] Gate check passes: `npm run test:integration`
- [x] Test count: 6 tests pass, not 5 - added a malformed-customer-id case (`GetCustomerHandler`'s
  own `CustomerId.create` guard) and a malformed-document-filter case (`ListCustomersHandler`'s
  own `PersonDocument.create` guard), both real robustness gaps caught while implementing
  (no silent deletions)

**Tests**: integration
**Gate**: quick

**Commit**: `feat(customers): add the customer read queries`

---

### T10: Customers controller

**What**: `CustomersController` - `POST /customers`, `GET/PATCH /customers/me`, `GET /customers`, `GET/PATCH/DELETE /customers/:externalId` - plus request/response DTOs and module wiring. The closing checkpoint for the `customers` module: everything built in T1-T9 is exercised end-to-end over real HTTP here for the first time.
**Where**: `src/modules/customers/presentation/controllers/customers.controller.ts`, `src/modules/customers/customers.module.ts`
**Depends on**: T7, T8, T9
**Reuses**: `UsersController`'s exact route-splitting pattern (`me` declared before `:externalId`, self-service routes unguarded by `@RequirePermissions`, `ParseUUIDPipe` on every external id param)
**Requirement**: CVR-01, CVR-02, CVR-05

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `POST /api/v1/customers` behind `customers:manage`, both branches reachable, temp password returned on the account-creation branch
- [x] `GET /api/v1/customers/me`, `PATCH /api/v1/customers/me` - no workshop permission required
- [x] `GET /api/v1/customers` behind `customers:read`, `?name=`/`?document=` filters
- [x] `GET/PATCH/DELETE /api/v1/customers/:externalId` behind `customers:read`/`customers:manage`
- [x] Every refusal path answers the HTTP code the Error Handling Strategy table in `design.md` names
- [x] `CustomersModule` registered in `AppModule`
- [x] Gate check passes: `npm run lint && npm run build && npm run test:unit && npm run test:integration && npm run test:e2e`
- [x] Test count: 10 e2e tests pass. Fixed 3 pre-existing lint errors caught by this task's build
  gate, none introduced by T10 itself: an unnecessary non-null assertion in T7's handler (TS
  narrows `command.userId` through the aliased `hasExistingUser` condition already), an unused
  `Address` import in T8's update-customer spec, and an unused destructured variable in T1's
  address spec (rewritten without the destructure-and-discard pattern). No silent deletions -
  full suite 295/295 (unit 187, integration 52, e2e 56), up from the 229 baseline.

**Tests**: e2e
**Gate**: build

**Commit**: `feat(customers): add the customers controller`

---

### T11: LicensePlate value object

**What**: The `LicensePlate` value object - old format (`AAA0000`) and Mercosul format (`AAA0A00`), with or without separators, normalised upper case with no separators.
**Where**: `src/modules/vehicles/domain/value-objects/license-plate.ts`
**Depends on**: None
**Reuses**: The private-constructor/static-factory VO shape
**Requirement**: CVR-03

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Accepts the old format
- [x] Accepts the Mercosul format
- [x] Normalises lower case and separators
- [x] Rejects a plate matching neither format
- [x] Gate check passes: `npm run test:unit`
- [x] Test count: 4 tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(vehicles): add the LicensePlate value object`

---

### T12: VehicleYear value object

**What**: The `VehicleYear` value object - rejects a year before 1950 or more than one year ahead of the current year, using `Clock` rather than reading the system clock directly.
**Where**: `src/modules/vehicles/domain/value-objects/vehicle-year.ts`
**Depends on**: None
**Reuses**: `Clock`/`CLOCK` port, the private-constructor/static-factory VO shape
**Requirement**: CVR-03

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Accepts a plausible year
- [x] Rejects a year before 1950
- [x] Rejects a year more than one year ahead of the clock's current year
- [x] Accepts exactly one year ahead (boundary)
- [x] Gate check passes: `npm run test:unit`
- [x] Test count: 4 tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(vehicles): add the VehicleYear value object`

---

### T13: Vehicle aggregate

**What**: The `Vehicle` aggregate root - `register`, `restore`, `updateDetails`, `transferTo`, `remove` - plus `VehicleId`, its domain errors and domain events.
**Where**: `src/modules/vehicles/domain/entities/vehicle.ts`
**Depends on**: T11, T12
**Reuses**: `AggregateRoot`, `EntityId`, `CustomerId` (from the `customers` module's own value objects, data crossing the boundary, not behaviour - the same way `UserId` already crosses into `authorization`'s `AssignRoleToUserCommand` payload)
**Requirement**: CVR-03, CVR-06

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `Vehicle.register` records `VehicleRegistered`
- [x] `Vehicle.restore` rebuilds from persisted props with no domain event
- [x] `updateDetails` replaces brand/model/year, updates `updatedAt`
- [x] `transferTo` relinks `customerId` and records `VehicleUpdated` (confirmed against
  `design.md`'s event list: no separate "transferred" event, an update is an update)
- [x] `remove` sets the soft-delete marker, is idempotent
- [x] `InvalidLicensePlateError`, `LicensePlateAlreadyInUseError`, `VehicleNotFoundError`, `OwningCustomerInactiveError`, `InvalidVehicleYearError` exist with the right `ErrorKind` (build-verified, matching T3's own precedent)
- [x] Gate check passes: `npm run test:unit`
- [x] Test count: 8 tests pass, not 9 - also added 2 tests beyond the original list (brand/model
  trimming, empty-brand rejection via the new `InvalidVehicleDetailsError`, a small gap found
  while implementing: neither `implementation-plan.md` nor `design.md` named a dedicated brand/model
  validation, but the aggregate needed one to match `User.name`'s own inline-validation precedent)
  (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(vehicles): add the Vehicle aggregate`

---

### T14: `vehicles` migration

**What**: The `vehicles` table migration - `bigserial`/`external_id uuid`, `customer_id` FK to `customers(id)`, partial unique index on `plate` where `deleted_at IS NULL`, index on `customer_id`.
**Where**: `src/shared/infrastructure/database/migrations/<timestamp>-create-vehicles-table.ts`
**Depends on**: T13
**Reuses**: The identity schema migration's shape
**Requirement**: CVR-03

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `vehicles` table has `id bigserial pk`, `external_id uuid unique`, `customer_id bigint references customers(id)`
- [x] Partial unique index on `plate` where `deleted_at IS NULL` (not a plain unique index - a removed vehicle's plate must be reusable)
- [x] Index on `customer_id`
- [x] `down()` drops the table cleanly - verified by code review, not execution (same reasoning as T4)
- [x] Gate check passes: `npm run test:integration`
- [x] Test count: 4 tests pass, not 5 - the `external_id`/`id` checks share one test the same way
  T4's did, and `down()` isn't executed against the shared test database (no silent deletions)

**Tests**: integration
**Gate**: quick

**Commit**: `feat(vehicles): add the vehicles table migration`

---

### T15: Vehicle repository

**What**: `VehicleRepository` port, `TypeOrmVehicleRepository`, `VehicleOrmEntity`, `VehicleMapper` - save/restore round trip, external-to-internal `customer_id` resolution at the repository boundary.
**Where**: `src/modules/vehicles/infrastructure/persistence/`
**Depends on**: T14
**Reuses**: The same `resolveUserInternalId`-style pattern T5 already established for `customers`, applied here to resolve `customer_id`
**Requirement**: CVR-03, CVR-06

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Saving a `Vehicle` resolves the external `customerId` to the internal `customer_id`
- [x] A save-then-restore round trip returns an equal aggregate
- [x] A duplicate active plate insert throws the real Postgres unique-violation, mapped to `LicensePlateAlreadyInUseError`
- [x] A soft-deleted vehicle's plate is reusable by a new registration (proves the partial index, not a plain one)
- [x] Gate check passes: `npm run test:integration`
- [x] Test count: 5 tests pass (no silent deletions). Caught and fixed a real bug while running the
  full suite (not just this file): the first draft used fixed literal plates
  (`ABC1234`-`ABC1237`), which passed in isolation but collided with leftover rows from a prior
  run once the test database's own "never truncated" convention (`STATE.md`) applied - fixed with
  a new `uniqueLicensePlate()` factory (`test/support/factories/plate.factory.ts`, reused by T20),
  verified durable across two consecutive full `test:integration` runs

**Tests**: integration
**Gate**: quick

**Commit**: `feat(vehicles): add the vehicle repository`

---

### T16: Vehicle query adapter

**What**: `VehicleQueryPort`, `TypeOrmVehicleQueryAdapter` - get by external id, list by owning customer's internal id.
**Where**: `src/modules/vehicles/infrastructure/persistence/typeorm-vehicle-query.adapter.ts`
**Depends on**: T14
**Reuses**: `TypeOrmUserQueryAdapter`'s shape
**Requirement**: CVR-04

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Get by external id returns plate, brand, model, year, owning customer, or null
- [ ] List by customer returns every active vehicle for that customer, excludes removed ones
- [ ] Gate check passes: `npm run test:integration`
- [ ] Test count: 4 tests pass (no silent deletions)

**Tests**: integration
**Gate**: quick

**Commit**: `feat(vehicles): add the vehicle query adapter`

---

### T17: Register vehicle command

**What**: `RegisterVehicleCommand`/`RegisterVehicleHandler` - checks the owning customer via `GetCustomerQuery`, refuses a deactivated or missing customer, enforces plate/year validity.
**Where**: `src/modules/vehicles/application/commands/register-vehicle/`
**Depends on**: T9, T15
**Reuses**: `GetCustomerQuery` (T9), `IdGenerator`, `Clock`
**Requirement**: CVR-03

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Registers a vehicle for an active customer
- [ ] Refuses (422) for a deactivated customer
- [ ] Refuses (404) for a non-existent customer
- [ ] Propagates `InvalidLicensePlateError`/`InvalidVehicleYearError` for malformed input
- [ ] Gate check passes: `npm run test:unit`
- [ ] Test count: 5 tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(vehicles): add the register vehicle command`

---

### T18: Update and remove vehicle commands

**What**: `UpdateVehicleCommand`/Handler (brand/model/year, and ownership transfer with the same customer-active check T17 uses), `RemoveVehicleCommand`/Handler (soft delete).
**Where**: `src/modules/vehicles/application/commands/update-vehicle/`, `src/modules/vehicles/application/commands/remove-vehicle/`
**Depends on**: T9, T15
**Reuses**: `GetCustomerQuery`, `UpdateUserHandler`'s shape
**Requirement**: CVR-06

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Update replaces brand/model/year, leaves the rest untouched when omitted
- [ ] Update transfers ownership to a new active customer
- [ ] Update refuses (422) a transfer to a deactivated customer
- [ ] Update refuses (404) a transfer to a non-existent customer
- [ ] Remove sets the soft-delete marker, is idempotent
- [ ] Gate check passes: `npm run test:unit`
- [ ] Test count: 7 tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(vehicles): add the update and remove vehicle commands`

---

### T19: Vehicle read queries

**What**: `GetVehicleQuery`/Handler, `ListVehiclesByCustomerQuery`/Handler, `GetMyVehiclesQuery`/Handler (resolves the customer via `GetCustomerByUserIdQuery`, returns `[]` when the principal has none).
**Where**: `src/modules/vehicles/application/queries/`
**Depends on**: T9, T16
**Reuses**: `GetCustomerByUserIdQuery` (T9)
**Requirement**: CVR-04

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `GetVehicleQuery` returns the vehicle or null
- [ ] `ListVehiclesByCustomerQuery` returns every active vehicle of one customer
- [ ] `GetMyVehiclesQuery` resolves the principal's customer and lists their vehicles
- [ ] `GetMyVehiclesQuery` returns `[]`, not an error, when the principal has no customer record
- [ ] Gate check passes: `npm run test:integration`
- [ ] Test count: 6 tests pass (no silent deletions)

**Tests**: integration
**Gate**: quick

**Commit**: `feat(vehicles): add the vehicle read queries`

---

### T20: Vehicles controller

**What**: `VehiclesController` - `POST /vehicles`, `GET /vehicles/me`, `GET /vehicles`, `GET/PATCH/DELETE /vehicles/:externalId`, `GET /customers/:externalId/vehicles` - plus DTOs and module wiring. The closing checkpoint for the `vehicles` module and for this feature as a whole.
**Where**: `src/modules/vehicles/presentation/controllers/vehicles.controller.ts`, `src/modules/vehicles/vehicles.module.ts`
**Depends on**: T17, T18, T19
**Reuses**: `UsersController`'s route-splitting pattern
**Requirement**: CVR-03, CVR-04, CVR-06

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `POST /api/v1/vehicles` behind `vehicles:manage`
- [ ] `GET /api/v1/vehicles/me` - no workshop permission required, empty list when the principal has no customer
- [ ] `GET /api/v1/vehicles`, `GET /api/v1/vehicles/:externalId` behind `vehicles:read`
- [ ] `PATCH /api/v1/vehicles/:externalId` (details and transfer), `DELETE /api/v1/vehicles/:externalId` behind `vehicles:manage`
- [ ] `GET /api/v1/customers/:externalId/vehicles` behind `vehicles:read` (nested under the customers path, registered on this controller per `design.md`, or cross-referenced from `CustomersController` - confirm the cleaner placement against NestJS routing during implementation and note the choice in the commit)
- [ ] Every refusal path answers the HTTP code the Error Handling Strategy table in `design.md` names
- [ ] `VehiclesModule` registered in `AppModule`
- [ ] The full pre-existing suite (229 tests) stays green - nothing in this feature touches existing code
- [ ] Gate check passes: `npm run lint && npm run build && npm run test:unit && npm run test:integration && npm run test:e2e`
- [ ] Test count: 11 e2e tests pass (no silent deletions)

**Tests**: e2e
**Gate**: build

**Commit**: `feat(vehicles): add the vehicles controller`

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
T11 -> T13
T12 -> T13
T13 -> T14 -> T15 -> T17
T14 -> T16 -> T19
T9 -> T17
T15 -> T18
T9 -> T18
T9 -> T19
T17 -> T20
T18 -> T20
T19 -> T20
```

Execution is strictly sequential - there is no intra-phase parallelism.

---

## Task Granularity Check

| Task | Scope | Status |
| --- | --- | --- |
| T1 | 1 value object | Granular |
| T2 | 1 value object | Granular |
| T3 | 1 aggregate plus its id, errors and events | OK |
| T4 | 1 migration | Granular |
| T5 | 1 repository (port + impl + orm entity + mapper), cohesive | OK |
| T6 | 1 query adapter | Granular |
| T7 | 1 command plus its handler | OK |
| T8 | 2 commands in one cohesive pair | OK |
| T9 | 3 read queries, cohesive | OK |
| T10 | 1 controller | Granular |
| T11 | 1 value object | Granular |
| T12 | 1 value object | Granular |
| T13 | 1 aggregate plus its id, errors and events | OK |
| T14 | 1 migration | Granular |
| T15 | 1 repository, cohesive | OK |
| T16 | 1 query adapter | Granular |
| T17 | 1 command plus its handler | OK |
| T18 | 2 commands in one cohesive pair | OK |
| T19 | 3 read queries, cohesive | OK |
| T20 | 1 controller | Granular |

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
| T11 | None | no arrow in | Match |
| T12 | None | no arrow in | Match |
| T13 | T11, T12 | T11 -> T13, T12 -> T13 | Match |
| T14 | T13 | T13 -> T14 | Match |
| T15 | T14 | T14 -> T15 | Match |
| T16 | T14 | T14 -> T16 | Match |
| T17 | T9, T15 | T9 -> T17, T15 -> T17 | Match |
| T18 | T9, T15 | T9 -> T18, T15 -> T18 | Match |
| T19 | T9, T16 | T9 -> T19, T16 -> T19 | Match |
| T20 | T17, T18, T19 | T17 -> T20, T18 -> T20, T19 -> T20 | Match |

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
| T11 | Domain value object | unit | unit | OK |
| T12 | Domain value object | unit | unit | OK |
| T13 | Domain entity | unit | unit | OK |
| T14 | Migration | integration | integration | OK |
| T15 | Repository / mapper | integration | integration | OK |
| T16 | Query adapter | integration | integration | OK |
| T17 | Application handler | unit | unit | OK |
| T18 | Application handler | unit | unit | OK |
| T19 | Query adapter | integration | integration | OK |
| T20 | Controller | e2e | e2e | OK |

---

## MCPs and Skills

No task in this feature names an MCP server or a skill beyond `tlc-spec-driven` itself - every task
is a straightforward NestJS/TypeORM implementation against patterns already in this codebase.
