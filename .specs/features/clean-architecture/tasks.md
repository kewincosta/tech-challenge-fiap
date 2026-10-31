# Clean Architecture Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: `.specs/features/clean-architecture/design.md`
**Status**: Approved

---

## Test Coverage Matrix

> Generated from codebase, project guidelines and spec. Guidelines found: `vitest.config.ts` (per-path 80% thresholds), `vitest.integration.config.ts`, `vitest.e2e.config.ts`, `package.json` scripts, `eslint.config.mjs`, `.specs/STATE.md` Conventions. Where no guideline applies, the strong defaults are used.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| --- | --- | --- | --- | --- |
| Domain (entities, value objects) | unit | Unchanged by this feature; every existing domain spec passes with its assertions untouched | `src/modules/**/domain/**/*.spec.ts` | `npm run test:unit` |
| Use case | unit | Every branch the use case owns and each error-producing call site (L-003); cross-module collaborations through in-memory fakes of the consumer ports, asserted on the fake's state (CA-05) | `src/modules/**/application/**/*.spec.ts` | `npm run test:unit` |
| Gateway to another module | unit | Mapping of the provider's output into the port's type, and the provider's not-found turned into `null` | `src/modules/**/infrastructure/gateways/*.spec.ts` | `npm run test:unit` |
| Domain event dispatcher | unit | Immediate start, no await, a synchronous throw and a rejected promise both logged with the subscriber's name | `src/shared/infrastructure/events/*.spec.ts` | `npm run test:unit` |
| Architecture checks | unit | Each rule fires on its own fixture and the real tree passes | `test/architecture/*.spec.ts` | `npm run test:unit` |
| Key resolver, repository, query adapter | integration | Both translation directions, batch, unknown key as `null`, a row written earlier in the same transaction; adapters: key query paths and composed results | `test/integration/*.spec.ts` | `npm run test:integration` |
| Controller / route | e2e | Every route in scope: existing e2e unchanged, characterization for the routes without one, every spec edge case, the OpenAPI contract | `test/e2e/*.e2e.spec.ts` | `npm run test:e2e` |
| Composition root, tokens, `index.ts`, ORM entity, config | none | Build gate only; excluded from coverage in `vitest.config.ts` | - | build gate only |
| Documentation | none | Docs gate only | `README.md`, `docs/**` | docs gate only |

## Gate Check Commands

> Generated from `package.json`; confirm before Execute.

| Gate Level | When to Use | Command |
| --- | --- | --- |
| Quick | After tasks with unit tests only | `npm run test:unit` |
| Full | After tasks with integration or e2e tests | `npm run test:unit && npm run test:integration && npm run test:e2e` |
| Build | After wiring, configuration, move or rename tasks, and at the end of a module's migration | `npm run lint && npm run build && npm run test:unit && npm run test:integration && npm run test:e2e` |
| Docs | After documentation-only tasks | `npx prettier --check README.md docs` |

---

## Baseline

Filled by T1 before any code changes: the totals of the three suites on the untouched tree. Every later task's test count is checked against these.

| Suite | Tests passing |
| --- | --- |
| unit | 955 |
| integration | 239 |
| e2e | 203 |

---

## Confirmed lessons applied to this breakdown

- **L-002** (every spec Edge Case needs an owning task): the Edge Case Ownership table assigns each of the spec's 22 edge cases to the tasks that prove it and the layer of each proof.
- **L-003** (a sibling's test does not stand in for a call site's own): every route that answers a not-found gets its own e2e assertion in phase 1, before the not-found moves into its use case, and each query use case that throws gets its own unit case when it migrates.

## Edge Case Ownership

| spec.md Edge Case | Owning tasks | Proof layer |
| --- | --- | --- |
| `GET /work-orders/:number` unknown, 404 `WORK_ORDER_NOT_FOUND` | T4, T54 | e2e, unit |
| `GET /work-orders/me/:number` of another customer, 404 `WORK_ORDER_NOT_FOUND` | T4, T54 | e2e, unit |
| `GET /services/:externalId` unknown, 404 `SERVICE_NOT_FOUND` | T5, T37 | e2e, unit |
| `GET /inventory-items/:externalId` unknown, 404 `INVENTORY_ITEM_NOT_FOUND` | T5, T39 | e2e, unit |
| `GET /inventory-items/:externalId/movements` unknown, 404 `INVENTORY_ITEM_NOT_FOUND` | T5, T39 | e2e, unit |
| `GET /vehicles/:externalId` unknown, 404 `VEHICLE_NOT_FOUND` | T5, T49 | e2e, unit |
| `GET /customers/:externalId` unknown, 404 `CUSTOMER_NOT_FOUND` | T5, T47 | e2e, unit |
| `GET /customers/me` without a customer record, 404 `CUSTOMER_NOT_FOUND` | T5, T47 | e2e, unit |
| `GET /users/:externalId` unknown, 404 `USER_NOT_FOUND` | T5, T45 | e2e, unit |
| `GET /roles/:id` unknown, 404 `ROLE_NOT_FOUND` | T2, T42 | e2e, unit |
| `GET /customers?document=` malformed, 200 with `[]` | T6, T19, T33 | e2e, unit, integration |
| `GET /customers?document=` well-formed, only that customer | T6, T33 | e2e, integration |
| `GET /customers?name=` partial and case-insensitive, newest first | T6, T19, T33 | e2e, integration |
| `GET /inventory-items/shortages` outstanding quantities and work order numbers | T6, T23, T24 | e2e, integration |
| `DELETE /inventory-items/:externalId` planned on an open work order, 409 `INVENTORY_ITEM_IN_USE` | T6, T23, T24 | e2e, integration |
| `GET /inventory-items/:externalId/movements` returns the work order and actor UUIDs | T6, T24 | e2e, integration |
| Five drawn work order numbers taken, 409 `WORK_ORDER_NUMBER_TAKEN` | T22 | unit |
| Two concurrent changes to one work order, one 409 `CONCURRENT_MODIFICATION` | T35, T53 | e2e (`work-order-concurrency.e2e.spec.ts`) |
| A withdrawal above stock, 422 `INVENTORY_INSUFFICIENT_STOCK`, nothing changed | T6, T25, T27 | e2e, integration, unit |
| The shared transaction fails after both writes, neither persists | T25, T27, T35 | integration (`cross-module-transaction.spec.ts`) |
| `POST /customers` links the user created earlier in the same transaction | T14, T32 | integration, e2e |
| A subscriber throws, the caller keeps its result and the error is logged | T12 | unit |

---

## Preconditions

- Postgres and Redis from `docker compose` must be running for the integration and e2e suites.
- The test database is never truncated (STATE.md Conventions). Every new fixture uses UUID-derived unique values.
- `test/support/db.ts` holds an explicit list of ORM entities; T11 must update its import paths.
- The e2e suite runs in a single fork, so a test that changes `process.env` must restore it before it ends (T44).
- `.specs` is excluded from Prettier.

## Database actions

None. No migration is added, changed or run.

## Commit rules

One atomic commit per task, with that task's checkboxes flipped in this file in the same commit. Conventional Commits, no trailers. Validate every message with `python3 .claude/skills/tlc-spec-driven/scripts/check_commit.py --message "..."` before committing. Local commits only; pushing needs the user's go-ahead.

---

## Execution Plan

Phases run in order; tasks inside a phase run in order. Phase numbers map to the design's migration sequence as noted in each title.

### Phase 1: Safety net and records (design phase 0)

```
T1 → T2 → T3 → T4 → T5 → T6 → T7
```

### Phase 2: Architecture checks in report mode (design phase 1)

```
T8 → T9 → T10 → T61
```

### Phase 3: Identity module (design phase 2)

```
T11
```

### Phase 4: Shared pieces (design phase 3)

```
T12 → T13
```

### Phase 5: Key resolvers and owner read API (design phase 4)

```
T14 → T15 → T16 → T17 → T18 → T19
```

### Phase 6: Pilot, opening a work order (design phase 5)

```
T20 → T21 → T22
```

### Phase 7: Inventory reads work order data through the inversion (design phase 6)

```
T23 → T24 → T25 → T62
```

### Phase 8: Cross-module calls through consumer ports (design phase 7, part 1)

```
T26 → T27 → T28 → T29 → T30 → T31
```

### Phase 9: Adapters on their own tables (design phase 7, part 2)

```
T32 → T33 → T34 → T35 → T36
```

### Phase 10: services (design phase 7)

```
T37 → T38
```

### Phase 11: inventory (design phase 7)

```
T39 → T40 → T41
```

### Phase 12: identity (design phase 7)

```
T42 → T43 → T44 → T45 → T46
```

### Phase 13: customers (design phase 7)

```
T47 → T48
```

### Phase 14: vehicles (design phase 7)

```
T49 → T50
```

### Phase 15: work-orders (design phase 7)

```
T51 → T52 → T53 → T54 → T55
```

### Phase 16: Bus removal and enforcement (design phase 8)

```
T56 → T57
```

### Phase 17: Documentation (design phase 9)

```
T58 → T59 → T60
```

### Phase 18: Fixes from the first validation

```
T63 → T64 → T65 → T66 → T67
```

---

## Task Breakdown

### Phase 1: Safety net and records

#### T1: OpenAPI baseline and contract test

**What**: Capture the OpenAPI document of the untouched code, move the Swagger setup into `buildOpenApiDocument(app)`, and add an e2e test that compares the current document with the baseline after sorting object keys.
**Where**: `src/openapi.ts` (new), `src/main.ts`, `test/contract/openapi.baseline.json` (new), `test/e2e/openapi-contract.e2e.spec.ts` (new)
**Depends on**: None
**Reuses**: The `DocumentBuilder` setup at `src/main.ts:14-21`; `createTestApp()` from `test/support/app.ts`
**Requirement**: CA-02

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] The baseline JSON is generated from the code as it is before this task, with the current `DocumentBuilder` settings
- [x] `main.ts` serves `/api/docs` from `buildOpenApiDocument(app)`
- [x] The contract test sorts object keys recursively, keeps array order, and passes against the baseline
- [x] Changing one response status in a scratch copy makes the contract test fail (checked by hand, scratch discarded)
- [x] The Baseline section of this file holds the three suite totals of the untouched tree
- [x] Gate check passes: `npm run test:unit && npm run test:integration && npm run test:e2e`
- [x] Test count: e2e total is the baseline plus 1

**Tests**: e2e
**Gate**: full

**Commit**: `test(contract): pin the OpenAPI document`

---

#### T2: Characterize the role routes

**What**: An e2e spec for `GET /roles`, `POST /roles`, `GET /roles/:id`, `PATCH /roles/:id`, `DELETE /roles/:id` and `PUT /roles/:id/permissions`, covering the happy path, the 404 `ROLE_NOT_FOUND` of `GET /roles/:id`, and a 403 for an actor without the route's permission.
**Where**: `test/e2e/roles.e2e.spec.ts` (new)
**Depends on**: T1
**Reuses**: `test/support/http.ts` helpers; the actors `role-escalation.e2e.spec.ts` already builds
**Requirement**: CA-02

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Each of the six routes has a happy-path case asserting status and body shape
- [x] `GET /roles/:id` with an unknown id answers 404 with code `ROLE_NOT_FOUND`
- [x] Each route has a 403 case for an actor lacking its permission
- [x] Gate check passes: `npm run test:unit && npm run test:integration && npm run test:e2e`
- [x] Test count: e2e total grows by the cases added; nothing else changes

**Tests**: e2e
**Gate**: full

**Commit**: `test(e2e): characterize the role routes`

---

#### T3: Characterize the permission and user access routes

**What**: An e2e spec for `GET /permissions`, `GET /users/:userId/access` and `DELETE /users/:userId/roles/:roleId`, with happy path, 403 and the not-found answers each route gives today.
**Where**: `test/e2e/user-access.e2e.spec.ts` (new)
**Depends on**: T2
**Reuses**: `test/support/http.ts`; `role-escalation.e2e.spec.ts` for role assignment
**Requirement**: CA-02

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] The three routes have a happy-path case each
- [x] Each route has a 403 case for an actor lacking its permission
- [x] An unknown user or role on `DELETE /users/:userId/roles/:roleId` is asserted with the status and code the route answers today
- [x] Gate check passes: `npm run test:unit && npm run test:integration && npm run test:e2e`
- [x] Test count: e2e total grows by the cases added

**Tests**: e2e
**Gate**: full

**Commit**: `test(e2e): characterize the permission and access routes`

---

#### T4: Assert the work order not-found answers

**What**: e2e assertions for `GET /work-orders/:number` with an unknown number and `GET /work-orders/me/:number` with another customer's work order, both answering 404 with code `WORK_ORDER_NOT_FOUND`.
**Where**: `test/e2e/work-order-tracking.e2e.spec.ts`
**Depends on**: T3
**Reuses**: The work order setup already in that spec
**Requirement**: CA-02

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Both cases assert status 404 and code `WORK_ORDER_NOT_FOUND`
- [x] Gate check passes: `npm run test:unit && npm run test:integration && npm run test:e2e`
- [x] Test count: e2e total grows by 2 at most

**Tests**: e2e
**Gate**: full

**Commit**: `test(e2e): assert the work order not-found answers`

---

#### T5: Assert the other not-found answers

**What**: One e2e assertion per remaining read route that answers a not-found, adding only the ones missing: services, inventory item and its movements, vehicles, customers by id and `me`, users by id.
**Where**: `test/e2e/` (`services`, `inventory-items`, `vehicles`, `customers` and `users` specs)
**Depends on**: T4
**Reuses**: Each spec's existing setup
**Requirement**: CA-02

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `SERVICE_NOT_FOUND`, `INVENTORY_ITEM_NOT_FOUND` (item and movements), `VEHICLE_NOT_FOUND`, `CUSTOMER_NOT_FOUND` (by id and `me` without a record) and `USER_NOT_FOUND` are each asserted on their route with status 404
- [x] Gate check passes: `npm run test:unit && npm run test:integration && npm run test:e2e`
- [x] Test count: e2e total grows by the cases added

**Tests**: e2e
**Gate**: full

**Commit**: `test(e2e): assert the remaining not-found answers`

---

#### T6: Characterize the reads that phase 9 rewrites

**What**: e2e assertions for the behaviors the read rewrites must keep: the customer document and name filters, the shortage report, the in-use refusal of an item deactivation, the movement history UUIDs, and the untouched state after a withdrawal above stock.
**Where**: `test/e2e/` (`customers`, `inventory-items` and `work-order-withdrawals` specs)
**Depends on**: T5
**Reuses**: Each spec's existing setup
**Requirement**: CA-02

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] A malformed `document` filter answers 200 with `[]`; a well-formed one returns only that customer; a partial name in another letter case returns the matching customers, newest first
- [x] The shortage report lists each short item with its outstanding quantity and the work order numbers
- [x] `DELETE /inventory-items/:externalId` on an item planned on an open work order answers 409 `INVENTORY_ITEM_IN_USE`
- [x] A movement tied to a work order lists that work order's UUID and its actor's UUID
- [x] After a withdrawal above stock answers 422 `INVENTORY_INSUFFICIENT_STOCK`, the item's stock and the work order's withdrawn quantity are unchanged
- [x] Gate check passes: `npm run test:unit && npm run test:integration && npm run test:e2e`
- [x] Test count: e2e total grows by the cases added

**Tests**: e2e
**Gate**: full

**Commit**: `test(e2e): characterize the cross-module reads`

---

#### T7: Record the decisions as ADRs

**What**: ADRs 0026 to 0031 for AD-011 to AD-016, each naming its `AD-NNN`; ADR 0008 marked `Superseded by 0027`; the ADR index updated.
**Where**: `docs/adr/` (six new records, `0008-cross-context-calls-through-the-buses.md`, `README.md`)
**Depends on**: T6
**Reuses**: The structure of the existing ADRs; the reasoning in `design.md` and `context.md`
**Requirement**: CA-07

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] ADR 0031 justifies the command/query split, one class per use case, Nest's container confined to the composition roots, and domain events
- [x] ADR 0030 records that route permissions stay in the HTTP guard and that each entry point checks its own caller
- [x] ADR 0028 justifies each module querying only its own tables by avoiding coupling, avoiding dependency cycles and keeping each module responsible for its own data, and no other reason
- [x] ADR 0027 records the `inventory` and `work-orders` inversion and the cycle it avoids
- [x] Each new ADR names its `AD-NNN`, and each `AD-NNN` already names its ADR
- [x] Gate check passes: `npx prettier --check README.md docs`

**Tests**: none
**Gate**: docs

**Commit**: `docs(adr): record the clean architecture decisions`

---

### Phase 2: Architecture checks in report mode

#### T8: dependency-cruiser rules and baseline

**What**: Add dependency-cruiser with the rules of design C12, record today's violations as the known baseline, run it from `npm run lint`, and prove each rule against fixtures.
**Where**: `.dependency-cruiser.cjs` (new)
**Depends on**: T7
**Reuses**: dependency-cruiser's `--baseline` and `--ignore-known`
**Requirement**: CA-04

**Tools**:

- MCP: `context7` (dependency-cruiser rule syntax)
- Skill: NONE

**Done when**:

- [x] Rules `no-circular`, `core-no-frameworks`, `core-stays-in-module`, `through-public-api`, `inward-only` and `shared-is-a-leaf` are in the config, counting type-only imports
- [x] `.dependency-cruiser-known-violations.json` holds today's violations; `npm run lint` runs `depcruise src --ignore-known` through a `lint:architecture` script and passes
- [x] `test/architecture/dependency-rules.spec.ts` cruises fixture trees and asserts that each rule reports its fixture; the unit config includes `test/architecture/**/*.spec.ts`; fixtures are excluded from ESLint and `tsc`
- [x] Gate check passes: `npm run lint && npm run build && npm run test:unit && npm run test:integration && npm run test:e2e`
- [x] Test count: unit total grows by the rule cases

**Tests**: unit
**Gate**: build

**Commit**: `build(lint): check module dependencies with dependency-cruiser`

---

#### T9: Table ownership check

**What**: A script that maps every table to its module, scans the adapters' SQL and fails on a table another module owns, an unknown table, a table name built at runtime, or a migration table missing from the map, with today's findings as its known baseline.
**Where**: `scripts/architecture/check-table-ownership.ts` (new)
**Depends on**: T8
**Reuses**: The table list from the migrations under `src/shared/infrastructure/database/migrations/`
**Requirement**: CA-04, CA-03

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `scripts/architecture/table-owners.ts` maps the 19 tables to their modules, `identity` included
- [x] `scripts/architecture/known-table-findings.json` lists the nine adapters' current findings, and the check passes with them
- [x] `test/architecture/table-ownership.spec.ts` proves each failure kind on a fixture and the pass on a clean fixture
- [x] `lint:architecture` runs the check after dependency-cruiser
- [x] Gate check passes: `npm run lint && npm run build && npm run test:unit && npm run test:integration && npm run test:e2e`
- [x] Test count: unit total grows by the check's cases

**Tests**: unit
**Gate**: build

**Commit**: `build(lint): check that each module queries only its own tables`

---

#### T10: Core purity ratchet

**What**: A list of migrated modules, read by both `eslint.config.mjs` and a core purity test, that turns on the full core rules for each listed module: the extended package bans, `Decorator` and `Symbol()` banned, specs included.
**Where**: `scripts/architecture/migrated-modules.json` (new)
**Depends on**: T9
**Reuses**: The `domain` and `application` blocks of `eslint.config.mjs`
**Requirement**: CA-01, CA-04

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `eslint.config.mjs` builds strict blocks for the listed modules from the JSON, keeping today's blocks for the rest
- [x] `test/architecture/core-purity.spec.ts` scans the listed modules' `domain` and `application` files, specs included, for banned imports, decorators and `Symbol(`, and a fixture case proves each detection
- [x] The list starts empty, and lint and the test pass
- [x] Gate check passes: `npm run lint && npm run build && npm run test:unit && npm run test:integration && npm run test:e2e`
- [x] Test count: unit total grows by the purity cases

**Tests**: unit
**Gate**: build

**Commit**: `build(lint): add the core purity ratchet`

---

#### T61: Module cycle check

**What**: A check that collapses the cruised dependency graph to modules (each folder under `src/modules`, and `src/shared`) and fails on any cycle between them, naming for each step of the cycle a file that imports and the file it imports. Added after T11 ran, because `no-circular` sees only the cycles that close file by file; it runs before T12.
**Where**: `scripts/architecture/check-module-cycles.ts` (new)
**Depends on**: T10
**Reuses**: The graph dependency-cruiser builds from `.dependency-cruiser.cjs`, type-only imports counted
**Requirement**: CA-04, CA-03

**Tools**:

- MCP: `context7` (dependency-cruiser output and options)
- Skill: NONE

**Done when**:

- [x] `lint:architecture` runs the check after the table check, and the check passes on the real tree with no known list (the module graph has no cycle today)
- [x] `test/architecture/module-cycles.spec.ts` proves a two-module cycle that closes between modules and not file by file, a three-module cycle, and the pass on an acyclic fixture; each failure names the files on every step of the cycle
- [x] Files outside `src/modules` and `src/shared`, such as `app.module.ts` and `src/config`, stay out of the module graph
- [x] Gate check passes: `npm run lint && npm run build && npm run test:unit && npm run test:integration && npm run test:e2e`
- [x] Test count: unit total grows by the check's cases

**Tests**: unit
**Gate**: build

**Commit**: `build(lint): fail on dependency cycles between modules`

---

### Phase 3: Identity module

#### T11: Move users, authentication and authorization into identity

**What**: Move the three modules under `src/modules/identity/{users,authentication,authorization}` with paths only, merge their Nest modules into `identity.module.ts`, and update every import, the coverage globs, the test entity list and both baselines.
**Where**: `src/modules/identity/` (new tree)
**Depends on**: T10
**Reuses**: Every file of the three modules, moved with `git mv`
**Requirement**: CA-03, CA-05

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] No import in `src`, `test`, `scripts` or `security` names `modules/users`, `modules/authentication` or `modules/authorization`
- [x] `app.module.ts` imports `IdentityModule` in place of the three modules
- [x] `vitest.config.ts` globs at lines 36, 59 and 98 point at the new paths with the same percentages
- [x] `test/support/db.ts` imports the moved ORM entities
- [x] The dependency baseline is regenerated. The only entries that leave are the imports among users, authentication and authorization, which become imports inside `identity` (426 to 361), and no entry is added. The known table findings need no change, because none of them sits in those three modules
- [x] The OpenAPI contract test passes
- [x] Gate check passes: `npm run lint && npm run build && npm run test:unit && npm run test:integration && npm run test:e2e`
- [x] Test count: all three totals equal the previous task's

**Tests**: e2e
**Gate**: build

**Commit**: `refactor(identity): group users, authentication and authorization in one module`

---

### Phase 4: Shared pieces

#### T12: Domain event publisher and dispatcher

**What**: The `DomainEventPublisher` port and `DomainEventSubscriber` type, the in-memory dispatcher with today's semantics, its provider in `SharedModule` under a token in `src/shared/shared.tokens.ts`, and the recording fake.
**Where**: `src/shared/infrastructure/events/in-memory-domain-event-dispatcher.ts` (new)
**Depends on**: T11
**Reuses**: The message and `EventBus` context `@nestjs/cqrs` 11.0.3 logs; `DomainEvent` from `src/shared/domain/domain-event.ts`
**Requirement**: CA-02, CA-03

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] The port lives in `src/shared/application/ports/domain-event-publisher.port.ts` with no framework import
- [x] Specs prove: a subscriber starts during `publish`; `publish` returns before an async subscriber settles; a synchronous throw and a rejected promise are each logged at error level as `"<SubscriberName>" has thrown an unhandled exception.`; only subscribers of the event's type run
- [x] `test/support/fakes/recording-domain-event-publisher.ts` records published events
- [x] Gate check passes: `npm run test:unit`
- [x] Test count: unit total grows by the dispatcher's cases

**Tests**: unit
**Gate**: quick

**Commit**: `feat(shared): add the domain event publisher and its in-memory dispatcher`

---

#### T13: Move the shared tokens out of the application layer

**What**: Move `CLOCK`, `ID_GENERATOR` and `TRANSACTION_RUNNER` from `shared/application/ports` to `src/shared/shared.tokens.ts`, update every import, and add `shared` to the migrated modules.
**Where**: `src/shared/shared.tokens.ts`
**Depends on**: T12
**Reuses**: `SharedModule` providers
**Requirement**: CA-01

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] No file under `src/shared/application` or `src/shared/domain` declares a `Symbol`
- [x] `shared` is in `scripts/architecture/migrated-modules.json` and lint passes with it
- [x] Gate check passes: `npm run lint && npm run build && npm run test:unit && npm run test:integration && npm run test:e2e`
- [x] Test count: all three totals unchanged

**Tests**: none
**Gate**: build

**Commit**: `refactor(shared): move the injection tokens to the composition root`

---

### Phase 5: Key resolvers and owner read API

#### T14: User key resolver

**What**: `UserKeyResolver` with the four methods of design C4, running on the ambient manager, exported from a new `src/modules/identity/index.ts`.
**Where**: `src/modules/identity/users/infrastructure/persistence/user-key-resolver.ts` (new)
**Depends on**: T13
**Reuses**: The SQL of `resolveUserInternalId` and `resolveUserExternalId` in the customers repository; `currentEntityManager()`
**Requirement**: CA-03

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `test/integration/user-key-resolver.spec.ts` proves both directions, both batch forms, `null` for an unknown key, and a user inserted earlier inside an open `TransactionRunner.run` resolving within it
- [x] The resolver is a provider of `IdentityModule`, exported by the Nest module and by `index.ts`
- [x] Gate check passes: `npm run test:unit && npm run test:integration && npm run test:e2e`
- [x] Test count: integration total grows by the resolver's cases

**Tests**: integration
**Gate**: full

**Commit**: `feat(identity): add the user key resolver`

---

#### T15: Customer key resolver

**What**: `CustomerKeyResolver` with the four methods, exported from a new `src/modules/customers/index.ts`.
**Where**: `src/modules/customers/infrastructure/persistence/customer-key-resolver.ts` (new)
**Depends on**: T14
**Reuses**: The SQL of `resolveCustomerInternalId` and `resolveCustomerExternalId` in the vehicles repository
**Requirement**: CA-03

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `test/integration/customer-key-resolver.spec.ts` proves both directions, batch, `null` for unknown, and in-transaction resolution
- [x] Exported by `CustomersModule` and `index.ts`
- [x] Gate check passes: `npm run test:unit && npm run test:integration && npm run test:e2e`
- [x] Test count: integration total grows by the resolver's cases

**Tests**: integration
**Gate**: full

**Commit**: `feat(customers): add the customer key resolver`

---

#### T16: Vehicle key resolver

**What**: `VehicleKeyResolver` with the four methods, exported from a new `src/modules/vehicles/index.ts`.
**Where**: `src/modules/vehicles/infrastructure/persistence/vehicle-key-resolver.ts` (new)
**Depends on**: T15
**Reuses**: The work order repository's lookup on `vehicles`
**Requirement**: CA-03

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `test/integration/vehicle-key-resolver.spec.ts` proves both directions, batch, `null` for unknown, and in-transaction resolution
- [x] Exported by `VehiclesModule` and `index.ts`
- [x] Gate check passes: `npm run test:unit && npm run test:integration && npm run test:e2e`
- [x] Test count: integration total grows by the resolver's cases

**Tests**: integration
**Gate**: full

**Commit**: `feat(vehicles): add the vehicle key resolver`

---

#### T17: Service key resolver

**What**: `ServiceKeyResolver` with the four methods, exported from a new `src/modules/services/index.ts`.
**Where**: `src/modules/services/infrastructure/persistence/service-key-resolver.ts` (new)
**Depends on**: T16
**Reuses**: The work order repository's lookup on `services`
**Requirement**: CA-03

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `test/integration/service-key-resolver.spec.ts` proves both directions, batch, `null` for unknown, and in-transaction resolution
- [x] Exported by `ServicesModule` and `index.ts`
- [x] Gate check passes: `npm run test:unit && npm run test:integration && npm run test:e2e`
- [x] Test count: integration total grows by the resolver's cases

**Tests**: integration
**Gate**: full

**Commit**: `feat(services): add the service key resolver`

---

#### T18: Inventory item key resolver

**What**: `InventoryItemKeyResolver` with the four methods, exported from a new `src/modules/inventory/index.ts`.
**Where**: `src/modules/inventory/infrastructure/persistence/inventory-item-key-resolver.ts` (new)
**Depends on**: T17
**Reuses**: The work order repository's lookup on `inventory_items`
**Requirement**: CA-03

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `test/integration/inventory-item-key-resolver.spec.ts` proves both directions, batch, `null` for unknown, and in-transaction resolution
- [x] Exported by `InventoryModule` and `index.ts`
- [x] Gate check passes: `npm run test:unit && npm run test:integration && npm run test:e2e`
- [x] Test count: integration total grows by the resolver's cases

**Tests**: integration
**Gate**: full

**Commit**: `feat(inventory): add the inventory item key resolver`

---

#### T19: Find users use case

**What**: `FindUsersUseCase` in identity, framework-free from the start, with `ids`, `nameContains` and `document` filters over users of any status, its query port extension and SQL, provided by factory and exported from `index.ts`.
**Where**: `src/modules/identity/users/application/queries/find-users/find-users.use-case.ts` (new)
**Depends on**: T18
**Reuses**: `PersonDocument` parsing as `ListUsersHandler` does it; `UserQueryPort` and its TypeORM adapter
**Requirement**: CA-03

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Unit spec: a malformed document returns `[]` without reaching the port; a valid one is normalized before the port
- [x] Integration spec: `ids` returns those users whatever their status; `nameContains` matches any letter case and any position; `document` matches exactly
- [x] The use case carries no decorator and no framework import
- [x] Gate check passes: `npm run test:unit && npm run test:integration && npm run test:e2e`
- [x] Test count: unit and integration totals grow by the new cases

**Tests**: integration
**Gate**: full

**Commit**: `feat(identity): add the find users use case`

---

### Phase 6: Pilot, opening a work order

#### T20: work-orders tokens and repository contract

**What**: Create `work-orders.tokens.ts` with every work-orders token and move `WorkOrderRepository` from `domain/repositories` to `application/ports`, updating every import.
**Where**: `src/modules/work-orders/work-orders.tokens.ts` (new)
**Depends on**: T19
**Reuses**: The existing tokens and contract, moved unchanged
**Requirement**: CA-01

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `src/modules/work-orders/domain/repositories/` no longer exists
- [x] No file under `src/modules/work-orders/domain` or `application` declares a `Symbol`
- [x] Gate check passes: `npm run lint && npm run build && npm run test:unit && npm run test:integration && npm run test:e2e`
- [x] Test count: all three totals unchanged

**Tests**: none
**Gate**: build

**Commit**: `refactor(work-orders): move the tokens and the repository contract out of the core`

---

#### T21: Customer and vehicle directories

**What**: The `CustomerDirectory` and `VehicleDirectory` ports, their gateways calling the customers and vehicles query handlers through those modules' `index.ts`, their fakes, and gateway specs.
**Where**: `src/modules/work-orders/infrastructure/gateways/` (new)
**Depends on**: T20, T15, T16
**Reuses**: `GetCustomerHandler`, `GetCustomerByUserIdHandler` and `GetVehicleHandler`, exported by their Nest modules
**Requirement**: CA-03, CA-05

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Ports in `work-orders/application/ports` expose `CustomerRef`, `VehicleRef` and `findByUserId` as in design C3
- [x] Gateway specs prove the mapping, `active` from the provider's status, and `null` both when the provider returns `null` and when it throws its not-found error
- [x] `test/support/fakes/fake-customer-directory.ts` and `fake-vehicle-directory.ts` hold seeded data
- [x] `WorkOrdersModule` imports `CustomersModule` and `VehiclesModule` and provides the gateways under tokens from `work-orders.tokens.ts`
- [x] Gate check passes: `npm run test:unit && npm run test:integration && npm run test:e2e`
- [x] Test count: unit total grows by the gateway cases

**Tests**: unit
**Gate**: full

**Commit**: `feat(work-orders): reach customers and vehicles through directories`

---

#### T22: Create work order use case

**What**: Rewrite the creation handler as `CreateWorkOrderUseCase` on the two directories and the event publisher, build it by factory, have `POST /work-orders` call it directly, and move its spec to fakes.
**Where**: `src/modules/work-orders/application/commands/create-work-order/create-work-order.use-case.ts`
**Depends on**: T21, T12
**Reuses**: The handler's rules and retry loop unchanged
**Requirement**: CA-01, CA-02, CA-03, CA-05

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] The use case has no decorator, no framework import and no bus
- [x] The spec uses the directory fakes, the in-memory repository and the recording publisher, and asserts outcomes, never calls
- [x] Five drawn numbers all taken end in `WorkOrderNumberTakenError`, asserted in the spec
- [x] `POST /work-orders` e2e cases and the OpenAPI contract pass unchanged
- [x] Any change the pilot forced on the pattern is written into `design.md`
- [x] Gate check passes: `npm run test:unit && npm run test:integration && npm run test:e2e`
- [x] Test count: unit total unchanged or larger; e2e unchanged

**Tests**: e2e
**Gate**: full

**Commit**: `refactor(work-orders): open work orders through a framework-free use case`

---

### Phase 7: Inventory reads work order data through the inversion

#### T23: Work order reads for inventory

**What**: The `WorkOrderReads` interface and token declared by inventory, the `TypeOrmWorkOrderReads` implementation in work-orders over its own tables only, and the global `WorkOrderReadsModule` imported by `app.module.ts`.
**Where**: `src/modules/work-orders/infrastructure/persistence/typeorm-work-order-reads.ts` (new)
**Depends on**: T22, T18
**Reuses**: The SQL of `SELECT_SHORTAGES` and `SELECT_OPEN_WORK_ORDERS_USING_ITEM`, cut at the module boundary
**Requirement**: CA-03

**Tools**:

- MCP: `context7` (Nest global modules)
- Skill: NONE

**Done when**:

- [x] `src/modules/inventory/infrastructure/work-order-reads.ts` declares the interface and token, exported by inventory's `index.ts`
- [x] `test/integration/work-order-reads.spec.ts` proves `internalIdOf`, `externalIdsOf`, `outstandingDemand` (only approved budgets of work orders in execution, planned minus withdrawn) and `openWorkOrderNumbersUsing` (neither delivered nor canceled, ordered by number)
- [x] The application boots in the e2e suite with `WorkOrderReadsModule` registered once in `app.module.ts`
- [x] Gate check passes: `npm run test:unit && npm run test:integration && npm run test:e2e`
- [x] Test count: integration total grows by the new cases

**Tests**: integration
**Gate**: full

**Commit**: `feat(work-orders): provide work order reads to inventory`

---

#### T24: Inventory queries on their own tables

**What**: Switch the inventory query adapter's shortage report, in-use check and movement history to `WorkOrderReads` and `UserKeyResolver`, leaving it with no foreign table.
**Where**: `src/modules/inventory/infrastructure/persistence/typeorm-inventory-query.adapter.ts`
**Depends on**: T23, T14
**Reuses**: Its own `inventory_items` and `stock_movements` queries
**Requirement**: CA-03

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] The adapter's SQL names only `inventory_items` and `stock_movements`, and its entries leave the known table findings
- [x] The movement history orders by `occurred_at`, then `id`, and an integration case with two movements at the same `occurred_at`, stored in a physical order that differs from their `id` order, proves it
- [x] `inventory-query.adapter.spec.ts`, `stock-shortages.query.spec.ts` and `inventory-read-queries.spec.ts` pass with the new collaborators
- [x] The shortage, in-use and movement e2e cases from T6 pass
- [x] Gate check passes: `npm run test:unit && npm run test:integration && npm run test:e2e`
- [x] Test count: integration total unchanged or larger

**Tests**: integration
**Gate**: full

**Commit**: `refactor(inventory): read work order data through the work order reads`

---

#### T25: Inventory repository on its own tables

**What**: Resolve actors through `UserKeyResolver` and work orders through `WorkOrderReads.internalIdOf`, filter the settle, write-off and pending queries by `stock_movements.work_order_id`, and delete the runtime-table helper.
**Where**: `src/modules/inventory/infrastructure/persistence/typeorm-inventory-item.repository.ts`
**Depends on**: T24
**Reuses**: The batch lock and ambient-transaction handling, unchanged
**Requirement**: CA-03

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] The repository's SQL names only inventory tables, and its entries leave the known table findings
- [x] `inventory-item.repository.spec.ts`, `inventory-item-batch-lock.spec.ts` and `cross-module-transaction.spec.ts` pass
- [x] Withdrawal, return, delivery and cancellation e2e cases pass, including the 422 that changes nothing
- [x] Gate check passes: `npm run test:unit && npm run test:integration && npm run test:e2e`
- [x] Test count: integration total unchanged or larger

**Tests**: integration
**Gate**: full

**Commit**: `refactor(inventory): stop querying other modules' tables in the repository`

---

#### T62: Repositories join the transaction they open

**What**: When the inventory or the work order repository opens its own transaction, it publishes the manager as the ambient one, so every key resolver and `WorkOrderReads` call inside it joins that transaction and holds no second connection. Added after batch 6 found that two concurrent stock saves outside a transaction exhaust a pool of two connections; the application's pool of ten has no connection timeout, so ten concurrent saves would wait forever. It runs before T39.
**Where**: `src/shared/infrastructure/database/typeorm-transaction-runner.ts`, `src/modules/inventory/infrastructure/persistence/typeorm-inventory-item.repository.ts`, `src/modules/work-orders/infrastructure/persistence/typeorm-work-order.repository.ts`
**Depends on**: T25
**Reuses**: The `AsyncLocalStorage` context of `TypeOrmTransactionRunner` (AD-008)
**Requirement**: CA-03

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Both repositories open their own transaction through one shared helper that publishes the manager as the ambient one, and no adapter opens a transaction any other way while it calls a resolver or another module inside it
- [x] `test/integration/repository-own-transaction.spec.ts` runs two concurrent inventory saves outside any transaction on a data source whose pool holds two connections and has a connection timeout, and both complete; the case fails without the helper (checked by hand in a scratch copy)
- [x] The comments in the changed files that still describe cross-module calls through the bus describe the ports
- [x] Gate check passes: `npm run test:unit && npm run test:integration && npm run test:e2e`
- [x] Test count: integration total grows by the new cases

**Tests**: integration
**Gate**: full

**Commit**: `fix(shared): make a repository's own transaction the ambient one`

---

### Phase 8: Cross-module calls through consumer ports

#### T26: Service and part catalogs

**What**: `ServiceCatalog` and `PartCatalog` ports, gateways and fakes; the add-service and plan-part handlers use them in place of the query bus.
**Where**: `src/modules/work-orders/infrastructure/gateways/` (two new gateways)
**Depends on**: T25, T17
**Reuses**: `GetServiceHandler` and `GetInventoryItemHandler`, exported by their modules
**Requirement**: CA-03, CA-05

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Gateway specs prove mapping, `active`, and `null` on the provider's `null` or thrown not-found
- [x] The two handlers inject the ports and no bus; their specs use the fakes and assert outcomes
- [x] Gate check passes: `npm run test:unit && npm run test:integration && npm run test:e2e`
- [x] Test count: unit total unchanged or larger

**Tests**: unit
**Gate**: full

**Commit**: `refactor(work-orders): reach services and parts through catalogs`

---

#### T27: Stock ledger

**What**: The `StockLedger` port, its gateway calling the four inventory stock handlers inside the caller's transaction, and its fake; withdraw, return, deliver and cancel use it.
**Where**: `src/modules/work-orders/infrastructure/gateways/stock-ledger.gateway.ts` (new)
**Depends on**: T26
**Reuses**: `ConsumeStockBatchHandler`, `RestoreStockBatchHandler`, `SettleStockMovementsHandler`, `WriteOffStockMovementsHandler`
**Requirement**: CA-03, CA-05

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] The four handlers stop injecting `CommandBus`; their specs assert the fake ledger's recorded lines
- [x] `cross-module-transaction.spec.ts` and the withdrawal and closing e2e specs pass, including the 422 that changes nothing
- [x] Gate check passes: `npm run test:unit && npm run test:integration && npm run test:e2e`
- [x] Test count: unit total unchanged or larger

**Tests**: unit
**Gate**: full

**Commit**: `refactor(work-orders): move stock through the stock ledger`

---

#### T28: Work order actors

**What**: The `WorkOrderActors` port, its gateway mapping effective access to capabilities and the mechanic role, and its fake; the three authorizers and the assign-mechanic handler use it, with the budget owner check on `CustomerDirectory`.
**Where**: `src/modules/work-orders/infrastructure/gateways/work-order-actors.gateway.ts` (new)
**Depends on**: T27, T14
**Reuses**: `GetUserEffectiveAccessHandler` and `GetUserByIdHandler`, exported by identity
**Requirement**: CA-03, CA-05

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] No file in `work-orders/application` imports the permission catalog or the role enum
- [x] Gateway spec proves each capability and the mechanic result, including an unknown user
- [x] Authorizer and assign-mechanic specs use the fakes and assert outcomes
- [x] Gate check passes: `npm run test:unit && npm run test:integration && npm run test:e2e`
- [x] Test count: unit total unchanged or larger

**Tests**: unit
**Gate**: full

**Commit**: `refactor(work-orders): ask identity for capabilities through a port`

---

#### T29: Own work orders through the customer directory

**What**: The two queries that list and read a customer's own work orders find the customer through `CustomerDirectory.findByUserId`.
**Where**: `src/modules/work-orders/application/queries/` (`get-my-work-orders` and `get-my-work-order`)
**Depends on**: T28
**Reuses**: `CustomerDirectory` from T21
**Requirement**: CA-03, CA-05

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Neither handler injects `QueryBus`; their specs use the directory fake
- [x] The tracking e2e cases from T4 pass
- [x] Gate check passes: `npm run test:unit && npm run test:integration && npm run test:e2e`
- [x] Test count: unit total unchanged or larger

**Tests**: unit
**Gate**: full

**Commit**: `refactor(work-orders): find the caller's customer through the directory`

---

#### T30: Customer accounts

**What**: The `CustomerAccounts` port, its gateway over identity's get-user, effective-access and register-user handlers, and its fake; customer registration uses it, still inside one transaction.
**Where**: `src/modules/customers/infrastructure/gateways/customer-accounts.gateway.ts` (new)
**Depends on**: T29
**Reuses**: `GetUserByIdHandler`, `GetUserEffectiveAccessHandler`, `RegisterUserHandler`
**Requirement**: CA-03, CA-05

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] The registration handler injects the port and no bus; its spec uses the fake and asserts outcomes
- [x] `POST /customers` e2e cases pass, both for a new account and for an existing user
- [x] Gate check passes: `npm run test:unit && npm run test:integration && npm run test:e2e`
- [x] Test count: unit total unchanged or larger

**Tests**: unit
**Gate**: full

**Commit**: `refactor(customers): open accounts through a port`

---

#### T31: Vehicle owners

**What**: The `VehicleOwners` port, its gateway over the customers query handlers, and its fake; vehicle registration, update and the caller's vehicles use it.
**Where**: `src/modules/vehicles/infrastructure/gateways/vehicle-owners.gateway.ts` (new)
**Depends on**: T30, T15
**Reuses**: `GetCustomerHandler`, `GetCustomerByUserIdHandler`
**Requirement**: CA-03, CA-05

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] The three handlers inject the port and no bus; a deactivated owner still answers 422, asserted in the spec and the e2e
- [x] No file in any module's `application` imports another module, apart from `customers/application/queries/list-customers/list-customers.handler.ts`, which imports `PersonDocument` until T33; the dependency baseline is regenerated without those entries
- [x] Gate check passes: `npm run test:unit && npm run test:integration && npm run test:e2e`
- [x] Test count: unit total unchanged or larger

**Tests**: unit
**Gate**: full

**Commit**: `refactor(vehicles): find owners through a port`

---

### Phase 9: Adapters on their own tables

#### T32: Customer repository on its own table

**What**: The customer repository resolves user keys through `UserKeyResolver`, including `existsByUserId`.
**Where**: `src/modules/customers/infrastructure/persistence/typeorm-customer.repository.ts`
**Depends on**: T31
**Reuses**: `UserKeyResolver` from T14
**Requirement**: CA-03

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] The repository's SQL names only `customers`, and its entries leave the known table findings
- [x] `customer.repository.spec.ts` passes; `POST /customers` creating a new user links the customer inside the same transaction (e2e)
- [x] Gate check passes: `npm run test:unit && npm run test:integration && npm run test:e2e`
- [x] Test count: integration total unchanged or larger

**Tests**: integration
**Gate**: full

**Commit**: `refactor(customers): resolve user keys through identity`

---

#### T33: Customer queries composed in memory

**What**: The customer query adapter reads only `customers` and composes user data from `FindUsersUseCase`; the list handler stops parsing the document.
**Where**: `src/modules/customers/infrastructure/persistence/typeorm-customer-query.adapter.ts`
**Depends on**: T32, T19
**Reuses**: The design C7 order of calls; ordering by `customers.created_at DESC`
**Requirement**: CA-03

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] The adapter's SQL names only `customers`, and its entries leave the known table findings
- [x] No file in `customers/application` imports `PersonDocument`
- [x] No file in any module's `application` imports another module; the dependency baseline is regenerated without that entry
- [x] `customer-query.adapter.spec.ts` and `customer-read-queries.spec.ts` pass, and the filter cases from T6 pass
- [x] Gate check passes: `npm run test:unit && npm run test:integration && npm run test:e2e`
- [x] Test count: integration total unchanged or larger

**Tests**: integration
**Gate**: full

**Commit**: `refactor(customers): compose user data from identity`

---

#### T34: Vehicle adapters on their own table

**What**: The vehicle repository and query adapter resolve customer keys through `CustomerKeyResolver`.
**Where**: `src/modules/vehicles/infrastructure/persistence/` (repository and query adapter)
**Depends on**: T33
**Reuses**: `CustomerKeyResolver` from T15
**Requirement**: CA-03

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Both adapters' SQL names only `vehicles`, and their entries leave the known table findings
- [x] `vehicle.repository.spec.ts`, `vehicle-query.adapter.spec.ts` and `vehicle-read-queries.spec.ts` pass
- [x] Gate check passes: `npm run test:unit && npm run test:integration && npm run test:e2e`
- [x] Test count: integration total unchanged or larger

**Tests**: integration
**Gate**: full

**Commit**: `refactor(vehicles): resolve customer keys through customers`

---

#### T35: Work order repository on its own tables

**What**: The work order repository resolves every foreign key through the five owners' resolvers, and its runtime-table helpers are deleted.
**Where**: `src/modules/work-orders/infrastructure/persistence/typeorm-work-order.repository.ts`
**Depends on**: T34, T16, T17, T18
**Reuses**: The version guard (AD-009) and the trail write (AD-007), unchanged
**Requirement**: CA-03

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] The repository's SQL names only work-orders tables, and its entries leave the known table findings
- [x] `work-order.repository.spec.ts`, `work-order-budgets.repository.spec.ts` and `cross-module-transaction.spec.ts` pass
- [x] `work-order-concurrency.e2e.spec.ts` still answers one of two concurrent changes with 409 `CONCURRENT_MODIFICATION`
- [x] Gate check passes: `npm run test:unit && npm run test:integration && npm run test:e2e`
- [x] Test count: integration total unchanged or larger

**Tests**: integration
**Gate**: full

**Commit**: `refactor(work-orders): resolve foreign keys through their owners`

---

#### T36: Work order queries on their own tables

**What**: The work order query adapter and the metrics adapter read only work-orders tables and translate keys through the resolvers, one batch call per owner per request.
**Where**: `src/modules/work-orders/infrastructure/persistence/` (query adapter and metrics adapter)
**Depends on**: T35
**Reuses**: The five resolvers; the SQL for work-orders' own columns
**Requirement**: CA-03

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Both adapters' SQL names only work-orders tables; the known table findings file is empty
- [x] `work-order-query.adapter.spec.ts`, `work-order-read-queries.spec.ts`, `work-order-budgets.query.spec.ts` and `work-order-metrics-query.adapter.spec.ts` pass
- [x] Gate check passes: `npm run test:unit && npm run test:integration && npm run test:e2e`
- [x] Test count: integration total unchanged or larger

**Tests**: integration
**Gate**: full

**Commit**: `refactor(work-orders): translate keys in the read side through their owners`

---

### Phase 10: services

#### T37: services use cases

**What**: The five services handlers become framework-free use cases built by factory; the tokens leave the core and the repository contract moves to `application/ports`; the get use case throws `SERVICE_NOT_FOUND`; the controller calls the use cases; `services` joins the migrated modules.
**Where**: `src/modules/services/` (application, composition root, controller)
**Depends on**: T36
**Reuses**: The handlers' rules unchanged
**Requirement**: CA-01, CA-02, CA-05

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] The tokens live in `src/modules/services/services.tokens.ts`, the repository contract in `services/application/ports`, and no file under `services/domain` or `services/application` declares a `Symbol`
- [x] Specs use fakes and assert outcomes; the get use case's spec covers `ServiceNotFoundError`
- [x] The controller's `getServiceOrThrow` is gone and the `SERVICE_NOT_FOUND` e2e case from T5 passes
- [x] `services` is in `migrated-modules.json`; lint, the purity test and the dependency check pass with no `services` entry left in the baseline
- [x] Gate check passes: `npm run lint && npm run build && npm run test:unit && npm run test:integration && npm run test:e2e`
- [x] Test count: unit total unchanged or larger; e2e unchanged

**Tests**: e2e
**Gate**: build

**Commit**: `refactor(services): make the service use cases framework-free`

---

#### T38: Rename the services handlers

**What**: Rename the services handlers to `<Name>UseCase` in `<name>.use-case.ts`, with their specs and every import.
**Where**: `src/modules/services/application/`
**Depends on**: T37
**Reuses**: `git mv`
**Requirement**: CA-08

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] No `.handler.ts` file is left in the module
- [x] Gate check passes: `npm run lint && npm run build && npm run test:unit && npm run test:integration && npm run test:e2e`
- [x] Test count: all three totals unchanged

**Tests**: unit
**Gate**: build

**Commit**: `refactor(services): name the use cases as use cases`

---

### Phase 11: inventory

#### T39: Inventory catalog use cases

**What**: Create, update, deactivate, get, list, shortage and movement history become framework-free use cases; get and history throw `INVENTORY_ITEM_NOT_FOUND`; the controller calls them; the tokens leave the core and the repository contract moves to `application/ports`.
**Where**: `src/modules/inventory/application/` (catalog use cases)
**Depends on**: T38
**Reuses**: The handlers' rules; the in-use refusal through the query port
**Requirement**: CA-01, CA-02, CA-05

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] The tokens live in `src/modules/inventory/inventory.tokens.ts`, the repository contract in `inventory/application/ports`, and no file under `inventory/domain` or `inventory/application` declares a `Symbol`
- [x] Specs use fakes and assert outcomes; get and history each cover `InventoryItemNotFoundError`; deactivation covers `InventoryItemInUseError`
- [x] The controller's `getItemOrThrow` is gone; the not-found, in-use and history e2e cases pass
- [x] Gate check passes: `npm run test:unit && npm run test:integration && npm run test:e2e`
- [x] Test count: unit total unchanged or larger; e2e unchanged

**Tests**: e2e
**Gate**: full

**Commit**: `refactor(inventory): make the catalog use cases framework-free`

---

#### T40: Inventory stock use cases

**What**: Replenish, adjust, consume, restore, settle and write-off become framework-free use cases; the `StockLedger` and `PartCatalog` gateways call the use cases; `inventory` joins the migrated modules.
**Where**: `src/modules/inventory/application/` (stock use cases)
**Depends on**: T39
**Reuses**: The batch lock and the movement rules unchanged
**Requirement**: CA-01, CA-03, CA-05

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Specs use fakes and assert outcomes
- [x] `cross-module-transaction.spec.ts` and the withdrawal and closing e2e specs pass
- [x] `inventory` is in `migrated-modules.json`; lint, the purity test and the dependency check pass with no `inventory` entry left in the baseline
- [x] Gate check passes: `npm run lint && npm run build && npm run test:unit && npm run test:integration && npm run test:e2e`
- [x] Test count: unit total unchanged or larger; e2e unchanged

**Tests**: e2e
**Gate**: build

**Commit**: `refactor(inventory): make the stock use cases framework-free`

---

#### T41: Rename the inventory handlers

**What**: Rename the inventory handlers to `<Name>UseCase`, with their specs and every import, the work-orders gateways included.
**Where**: `src/modules/inventory/application/`
**Depends on**: T40
**Reuses**: `git mv`
**Requirement**: CA-08

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] No `.handler.ts` file is left in the module
- [x] Gate check passes: `npm run lint && npm run build && npm run test:unit && npm run test:integration && npm run test:e2e`
- [x] Test count: all three totals unchanged

**Tests**: unit
**Gate**: build

**Commit**: `refactor(inventory): name the use cases as use cases`

---

### Phase 12: identity

#### T42: Authorization queries and services

**What**: Get role, get user access, get effective access, list permissions and list roles become framework-free use cases, `EffectiveAccessService` and `PermissionCatalogService` become plain classes, and get role throws `ROLE_NOT_FOUND`.
**Where**: `src/modules/identity/authorization/application/` (queries and services)
**Depends on**: T41
**Reuses**: The cache-backed effective access read, unchanged
**Requirement**: CA-01, CA-02, CA-05

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Specs use fakes and assert outcomes; get role covers `RoleNotFoundError`
- [x] The roles controller's `getRoleOrFail` is gone; the role and access e2e specs from T2 and T3 pass
- [x] The identity gateways in other modules call the use cases
- [x] Gate check passes: `npm run test:unit && npm run test:integration && npm run test:e2e`
- [x] Test count: unit total unchanged or larger; e2e unchanged

**Tests**: e2e
**Gate**: full

**Commit**: `refactor(identity): make the authorization queries framework-free`

---

#### T43: Authorization commands and the access cache subscriber

**What**: Assign, revoke, create, update, delete and set-permissions become framework-free use cases publishing through the `DomainEventPublisher`; the access cache subscriber is registered on the dispatcher by the identity composition root; the authorization tokens leave the core.
**Where**: `src/modules/identity/authorization/application/` (commands and subscriber), `src/shared/shared.module.ts` (the dispatcher binding)
**Depends on**: T42
**Reuses**: `AccessCacheInvalidationSubscriber`'s logic unchanged
**Requirement**: CA-01, CA-03, CA-05

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] The authorization tokens live in `src/modules/identity/identity.tokens.ts`, the role and permission repository contracts in `authorization/application/ports`, and no file under `authorization/domain` or `authorization/application` declares a `Symbol`
- [x] Specs use fakes and the recording publisher and assert outcomes; the escalation rule keeps its cases
- [x] `SharedModule` provides `InMemoryDomainEventDispatcher` and binds `DOMAIN_EVENT_PUBLISHER` to the same instance with `useExisting`, exporting both; the identity root injects the class and subscribes on module init
- [x] A role assigned or revoked through the API is visible in the next effective access read (e2e)
- [x] `role-escalation.e2e.spec.ts` passes
- [x] Gate check passes: `npm run test:unit && npm run test:integration && npm run test:e2e`
- [x] Test count: unit total unchanged or larger; e2e unchanged

**Tests**: e2e
**Gate**: full

**Commit**: `refactor(identity): make the authorization commands framework-free`

---

#### T44: Authentication use cases, settings and reuse log

**What**: Authenticate, logout all, refresh, revoke and list sessions become framework-free use cases reading `AuthSettings`; the refresh-token-reuse subscriber moves to infrastructure and is registered on the dispatcher; the authentication tokens leave the core.
**Where**: `src/modules/identity/authentication/application/` (use cases and `auth-settings.ts`), `src/modules/identity/authentication/infrastructure/persistence/` (the session and refresh token ORM entities)
**Depends on**: T43
**Reuses**: `authConfig` for building the settings in `identity.module.ts`
**Requirement**: CA-01, CA-05

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] The authentication tokens live in `src/modules/identity/identity.tokens.ts`, the session repository contract in `authentication/application/ports`, and no file under `authentication/domain` or `authentication/application` declares a `Symbol`
- [x] No file in `identity/authentication/application` imports `@nestjs/config` or Nest's `Logger`
- [x] `session.orm-entity.ts` and `refresh-token.orm-entity.ts` no longer import each other, sessions and refresh tokens persist as before (the authentication integration and e2e specs pass unchanged), and the regenerated dependency baseline has no `no-circular` entry
- [x] An e2e case boots a dedicated app with `REFRESH_TOKEN_TTL_SECONDS=600`, logs in, asserts `refreshTokenExpiresAt` 600 seconds after the login, and restores the environment
- [x] A spec of the moved subscriber asserts the warn line `Refresh token reuse detected for session <sessionId>; the session was revoked.` under `AuthenticationSecurity`
- [x] `authentication.e2e.spec.ts` passes
- [x] Gate check passes: `npm run test:unit && npm run test:integration && npm run test:e2e`
- [x] Test count: e2e total grows by 1; unit unchanged or larger

**Tests**: e2e
**Gate**: full

**Commit**: `refactor(identity): make the authentication use cases framework-free`

---

#### T45: Users use cases

**What**: Register, update, deactivate, change password, find by document, get by id, list and verify credentials become framework-free use cases; calls to the authentication and authorization areas become direct; get by id throws `USER_NOT_FOUND`; the users tokens leave the core; `identity` joins the migrated modules.
**Where**: `src/modules/identity/users/application/`
**Depends on**: T44
**Reuses**: Registration's shared transaction (AD-008), unchanged
**Requirement**: CA-01, CA-02, CA-05

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] The users tokens live in `src/modules/identity/identity.tokens.ts`, the user repository contract in `users/application/ports`, and no file under any `identity` `domain` or `application` folder declares a `Symbol`
- [x] Specs use fakes and assert outcomes; get by id covers `UserNotFoundError`
- [x] The users controller's `getUserOrThrow` is gone; the users, staff, password and pending-password e2e specs pass
- [x] `identity` is in `migrated-modules.json`; lint, the purity test and the dependency check pass with no `identity` entry left in the baseline
- [x] Gate check passes: `npm run lint && npm run build && npm run test:unit && npm run test:integration && npm run test:e2e`
- [x] Test count: unit total unchanged or larger; e2e unchanged

**Tests**: e2e
**Gate**: build

**Commit**: `refactor(identity): make the users use cases framework-free`

---

#### T46: Rename the identity handlers

**What**: Rename every identity handler to `<Name>UseCase`, with specs and every import, gateways in other modules included.
**Where**: `src/modules/identity/`
**Depends on**: T45
**Reuses**: `git mv`
**Requirement**: CA-08

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] No `.handler.ts` file is left in the module
- [x] Gate check passes: `npm run lint && npm run build && npm run test:unit && npm run test:integration && npm run test:e2e`
- [x] Test count: all three totals unchanged

**Tests**: unit
**Gate**: build

**Commit**: `refactor(identity): name the use cases as use cases`

---

### Phase 13: customers

#### T47: customers use cases

**What**: Register, update, deactivate, get, get by user and list become framework-free use cases; get and get by user throw `CUSTOMER_NOT_FOUND`, get still returning deactivated customers; the tokens leave the core and the repository contract moves to `application/ports`; `customers` joins the migrated modules.
**Where**: `src/modules/customers/`
**Depends on**: T46
**Reuses**: The handlers' rules; the gateways' not-found mapping from phase 8
**Requirement**: CA-01, CA-02, CA-05

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] The tokens live in `src/modules/customers/customers.tokens.ts`, the repository contract in `customers/application/ports`, and no file under `customers/domain` or `customers/application` declares a `Symbol`
- [x] Specs use fakes and assert outcomes; get and get by user each cover `CustomerNotFoundError`
- [x] The controller's `get*OrThrow` helpers are gone; the customer e2e cases, including `me` without a record, pass
- [x] `customers` is in `migrated-modules.json`; lint, the purity test and the dependency check pass with no `customers` entry left in the baseline
- [x] Gate check passes: `npm run lint && npm run build && npm run test:unit && npm run test:integration && npm run test:e2e`
- [x] Test count: unit total unchanged or larger; e2e unchanged

**Tests**: e2e
**Gate**: build

**Commit**: `refactor(customers): make the customer use cases framework-free`

---

#### T48: Rename the customers handlers

**What**: Rename the customers handlers to `<Name>UseCase`, with specs and every import.
**Where**: `src/modules/customers/application/`
**Depends on**: T47
**Reuses**: `git mv`
**Requirement**: CA-08

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] No `.handler.ts` file is left in the module
- [x] Gate check passes: `npm run lint && npm run build && npm run test:unit && npm run test:integration && npm run test:e2e`
- [x] Test count: all three totals unchanged

**Tests**: unit
**Gate**: build

**Commit**: `refactor(customers): name the use cases as use cases`

---

### Phase 14: vehicles

#### T49: vehicles use cases

**What**: Register, update, remove, get, the caller's vehicles and list by customer become framework-free use cases; get throws `VEHICLE_NOT_FOUND`; the tokens leave the core and the repository contract moves to `application/ports`; `vehicles` joins the migrated modules.
**Where**: `src/modules/vehicles/`
**Depends on**: T48
**Reuses**: The handlers' rules; `VehicleOwners` from T31
**Requirement**: CA-01, CA-02, CA-05

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] The tokens live in `src/modules/vehicles/vehicles.tokens.ts`, the repository contract in `vehicles/application/ports`, and no file under `vehicles/domain` or `vehicles/application` declares a `Symbol`
- [x] Specs use fakes and assert outcomes; get covers `VehicleNotFoundError`
- [x] The controller's `getVehicleOrThrow` is gone; the vehicle e2e cases pass
- [x] `vehicles` is in `migrated-modules.json`; lint, the purity test and the dependency check pass with no `vehicles` entry left in the baseline
- [x] Gate check passes: `npm run lint && npm run build && npm run test:unit && npm run test:integration && npm run test:e2e`
- [x] Test count: unit total unchanged or larger; e2e unchanged

**Tests**: e2e
**Gate**: build

**Commit**: `refactor(vehicles): make the vehicle use cases framework-free`

---

#### T50: Rename the vehicles handlers

**What**: Rename the vehicles handlers to `<Name>UseCase`, with specs and every import.
**Where**: `src/modules/vehicles/application/`
**Depends on**: T49
**Reuses**: `git mv`
**Requirement**: CA-08

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] No `.handler.ts` file is left in the module
- [x] Gate check passes: `npm run lint && npm run build && npm run test:unit && npm run test:integration && npm run test:e2e`
- [x] Test count: all three totals unchanged

**Tests**: unit
**Gate**: build

**Commit**: `refactor(vehicles): name the use cases as use cases`

---

### Phase 15: work-orders

#### T51: Items and diagnosis use cases

**What**: Add requested service, plan part, remove item, assign mechanic, start diagnosis and complete diagnosis become framework-free use cases called directly by the controller.
**Where**: `src/modules/work-orders/application/commands/` (six use cases)
**Depends on**: T50
**Reuses**: The catalogs and actors ports from phase 8
**Requirement**: CA-01, CA-05

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Specs use fakes and the recording publisher and assert outcomes
- [x] The work order and budget e2e specs pass
- [x] Gate check passes: `npm run test:unit && npm run test:integration && npm run test:e2e`
- [x] Test count: unit total unchanged or larger; e2e unchanged

**Tests**: e2e
**Gate**: full

**Commit**: `refactor(work-orders): make the item and diagnosis use cases framework-free`

---

#### T52: Budget use cases

**What**: Submit supplementary budget, approve and reject become framework-free use cases, and the budget decision authorizer becomes a plain class.
**Where**: `src/modules/work-orders/application/` (budget use cases and authorizer)
**Depends on**: T51
**Reuses**: `WorkOrderActors` and `CustomerDirectory`
**Requirement**: CA-01, CA-05

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Specs use fakes and assert outcomes, including the owner, permission holder and stranger paths of the authorizer
- [x] `work-order-budgets.e2e.spec.ts` passes
- [x] Gate check passes: `npm run test:unit && npm run test:integration && npm run test:e2e`
- [x] Test count: unit total unchanged or larger; e2e unchanged

**Tests**: e2e
**Gate**: full

**Commit**: `refactor(work-orders): make the budget use cases framework-free`

---

#### T53: Execution and closing use cases

**What**: Withdraw, return, complete, deliver, cancel and apply discount become framework-free use cases, and the completion and cancellation authorizers become plain classes.
**Where**: `src/modules/work-orders/application/` (execution and closing use cases and authorizers)
**Depends on**: T52
**Reuses**: `StockLedger` and `WorkOrderActors`
**Requirement**: CA-01, CA-02, CA-05

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Specs use fakes and assert outcomes
- [x] The withdrawal, closing and concurrency e2e specs pass, including one 409 `CONCURRENT_MODIFICATION` of two concurrent changes
- [x] Gate check passes: `npm run test:unit && npm run test:integration && npm run test:e2e`
- [x] Test count: unit total unchanged or larger; e2e unchanged

**Tests**: e2e
**Gate**: full

**Commit**: `refactor(work-orders): make the execution and closing use cases framework-free`

---

#### T54: Work order queries

**What**: Get, get own, list, list own, trail and average execution time become framework-free use cases; get and get own throw `WORK_ORDER_NOT_FOUND`; the controller's helpers go; `work-orders` joins the migrated modules.
**Where**: `src/modules/work-orders/application/queries/`
**Depends on**: T53
**Reuses**: The query ports, unchanged
**Requirement**: CA-01, CA-02, CA-05

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Specs assert outcomes; get and get own each cover `WorkOrderNotFoundError`
- [x] The controller's `getWorkOrderOrThrow` is gone; the not-found e2e cases from T4 pass
- [x] `work-orders` is in `migrated-modules.json`; lint, the purity test and the dependency check pass with no `work-orders` entry left in the baseline
- [x] Gate check passes: `npm run lint && npm run build && npm run test:unit && npm run test:integration && npm run test:e2e`
- [x] Test count: unit total unchanged or larger; e2e unchanged

**Tests**: e2e
**Gate**: build

**Commit**: `refactor(work-orders): make the query use cases framework-free`

---

#### T55: Rename the work-orders handlers

**What**: Rename the remaining work-orders handlers to `<Name>UseCase`, with specs and every import.
**Where**: `src/modules/work-orders/application/`
**Depends on**: T54
**Reuses**: `git mv`
**Requirement**: CA-08

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] No `.handler.ts` file is left anywhere under `src`
- [x] Gate check passes: `npm run lint && npm run build && npm run test:unit && npm run test:integration && npm run test:e2e`
- [x] Test count: all three totals unchanged

**Tests**: unit
**Gate**: build

**Commit**: `refactor(work-orders): name the use cases as use cases`

---

### Phase 16: Bus removal and enforcement

#### T56: Seed on use cases

**What**: The seed resolves the create-service, create-inventory-item, replenish-stock, register-customer and register-vehicle use cases from the application context and calls them, with an integration spec running it twice.
**Where**: `scripts/seed.ts`
**Depends on**: T55
**Reuses**: The seed's existence checks and the staff inserts (AD-006)
**Requirement**: CA-06

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] The seed imports no bus and exports the function the spec runs
- [x] `test/integration/seed.script.spec.ts` runs it twice against the test database and finds the demo services, items, stock, customers and vehicles once each
- [x] Gate check passes: `npm run test:unit && npm run test:integration && npm run test:e2e`
- [x] Test count: integration total grows by the seed's cases

**Tests**: integration
**Gate**: full

**Commit**: `refactor(scripts): seed through the use cases`

---

#### T57: Remove the bus and enforce the rules

**What**: Remove `CqrsModule`, the `@nestjs/cqrs` package and the bus stubs; cover every module with the core rules; empty both baselines; run the acceptance checks.
**Where**: `src/app.module.ts`
**Depends on**: T56
**Reuses**: The checks from phase 2
**Requirement**: CA-01, CA-03, CA-04, CA-05

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `grep -rnE "CommandBus|QueryBus|@nestjs/cqrs" src test scripts` finds nothing, and `package.json` has no `@nestjs/cqrs`
- [x] `test/support/fakes/bus.stubs.ts` is deleted
- [x] The strict ESLint blocks and the purity test cover `src/**`; `.dependency-cruiser-known-violations.json` and the known table findings are empty
- [x] A throwaway `@nestjs/common` import in an `application` file makes `npm run lint` fail naming the file (checked by hand, removed)
- [x] `npm run test:coverage` passes every threshold
- [x] Gate check passes: `npm run lint && npm run build && npm run test:unit && npm run test:integration && npm run test:e2e`
- [x] Test count: all three totals at least the Baseline section's, plus the tests this feature added

**Tests**: unit
**Gate**: build

**Commit**: `refactor(app): remove the command and query bus`

---

### Phase 17: Documentation

#### T58: README architecture

**What**: The README's architecture section shows the dependency circles with the folder that maps to each, the module dependency graph, and how `npm run lint` enforces both.
**Where**: `README.md`
**Depends on**: T57
**Reuses**: dependency-cruiser's graph output for the module graph
**Requirement**: CA-09

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] The circles, the folder mapping and the module graph are in the README
- [x] The README names no bus, no `*Handler` class and none of the three old identity module paths
- [x] Gate check passes: `npx prettier --check README.md docs`

**Tests**: none
**Gate**: docs

**Commit**: `docs(readme): describe the clean architecture`

---

#### T59: Low-level designs

**What**: Update every low-level design page for the identity module, the use cases, the ports, the gateways and the key resolvers.
**Where**: `docs/architecture/low-level-design/`
**Depends on**: T58
**Reuses**: The current pages' structure
**Requirement**: CA-09

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] The users, authentication and authorization pages are reorganized under identity, and the index links them
- [x] No page names a bus, a `*Handler` class or an old identity module path
- [x] Gate check passes: `npx prettier --check README.md docs`

**Tests**: none
**Gate**: docs

**Commit**: `docs(architecture): update the low level designs`

---

#### T60: C4 diagrams and overviews

**What**: Update the C4 component diagrams, the architecture overview and the high level design, and give ADR 0001 the status `Amended by 0026` (the user's decision of 2026-10-29).
**Where**: `docs/architecture/`, `docs/adr/README.md`, `docs/adr/0001-modular-monolith-with-cqrs.md`
**Depends on**: T59
**Reuses**: The current diagrams
**Requirement**: CA-09

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] The identity diagram no longer says every cross-module arrow is a bus dispatch
- [x] The status table of `docs/adr/README.md` defines `Amended by NNNN` as "In force, except the part NNNN replaces. The record stays as it was decided.", the index lists 0001 as `Amended by 0026`, and the Status line of ADR 0001 reads `Amended by 0026` with its body unchanged
- [x] `grep -rnE "CommandBus|QueryBus|@nestjs/cqrs|Handler\b|modules/(users|authentication|authorization)" README.md docs/architecture` finds nothing
- [x] Gate check passes: `npx prettier --check README.md docs`

**Tests**: none
**Gate**: docs

**Commit**: `docs(architecture): update the diagrams and overviews`

---

### Phase 18: Fixes from the first validation

The first Verifier round (`validation.md`, commit `e47f852`) failed on five gaps and confirmed two survivors outside the spec. The user chose the fixes on 2026-10-31. CA-03 AC7 was amended in `spec.md` to allow `runInNewTransaction`; AD-008 names ADR 0032 in `.specs/STATE.md`.

#### T63: Metrics days from a span the suite cannot fill

**What**: `randomDay()` draws from a span the suite's own runs cannot fill, and `pickClearDay` gives up after a bounded number of draws with an error that names the reason, so the never-truncated test database cannot turn the spec into timeouts.
**Where**: `test/integration/work-order-metrics-query.adapter.spec.ts`
**Depends on**: T60
**Reuses**: The spec's own helpers
**Requirement**: CA-02

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Days come from the years 2100 to 3099, and `pickClearDay` stops after 200 draws with an error that says no free window was found
- [x] The spec passes on `workshop_test` as it is today and on an empty scratch database
- [x] Gate check passes: `npm run test:unit && npm run test:integration && npm run test:e2e`
- [x] Test count: all three totals unchanged

**Tests**: integration
**Gate**: full

**Commit**: `test(work-orders): draw metrics days from a span the suite cannot fill`

---

#### T64: Seed spec on a database of its own

**What**: The seed spec creates, migrates and drops a database of its own, so a broken seed fails it whatever `workshop_test` already holds; the register-customer and register-vehicle use case specs assert the stored phone and year.
**Where**: `test/integration/seed.script.spec.ts`, `register-customer.use-case.spec.ts`, `register-vehicle.use-case.spec.ts`
**Depends on**: T63
**Reuses**: `runSeed()`; the migration run of the integration global setup
**Requirement**: CA-06

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] The spec creates a database whose name ends in `_test`, migrates it, runs `runSeed()` twice against it, asserts, then drops it and restores `DATABASE_NAME`, also when an assertion fails
- [ ] The register-customer use case spec asserts the stored phone and the register-vehicle use case spec the stored year
- [ ] Checked by hand in a scratch worktree whose database already holds the demo rows: a seed that books no opening stock (M12), a vehicle stored with the year before (W3b) and a phone not stored (W3c) each fail a suite
- [ ] Gate check passes: `npm run test:unit && npm run test:integration && npm run test:e2e`
- [ ] Test count: unit grows by the new cases; integration unchanged or larger

**Tests**: integration
**Gate**: full

**Commit**: `test(scripts): run the seed spec on a database of its own`

---

#### T65: Public API rule on a module root file

**What**: The `through-public-api` fixture gains a module root file other than `index.ts`, imported from another module, and the rule spec expects that import as a violation.
**Where**: `test/architecture/fixtures/dependency-rules/through-public-api/`, `test/architecture/dependency-rules.spec.ts`
**Depends on**: T64
**Reuses**: The existing fixture tree
**Requirement**: CA-04

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] The fixture has `beta/beta.tokens.ts`, a file in `alpha/infrastructure` imports it, and the spec expects that import as a `through-public-api` violation
- [ ] Checked by hand in a scratch copy: a rule that accepts any file at a module's root (M07) fails the unit suite
- [ ] Gate check passes: `npm run test:unit`
- [ ] Test count: unit total grows by the new case

**Tests**: unit
**Gate**: quick

**Commit**: `test(lint): pin the public API rule on a module root file`

---

#### T66: ADR 0032 and the amended status of ADR 0023

**What**: ADR 0032 records the rule T62 added, ADR 0023's status becomes `Amended by 0032`, and the ADR index lists both.
**Where**: `docs/adr/` (ADR 0032 new, ADR 0023, `README.md`)
**Depends on**: T65
**Reuses**: The format of ADRs 0026 to 0031; the `Amended by NNNN` status of T60
**Requirement**: CA-07

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] ADR 0032 states the context (two concurrent stock saves exhausted a pool of two connections, batch 6), the decision (a repository opens its own transaction through `runInNewTransaction`, which publishes its manager as the ambient one), the alternative T35 uses (resolving every key before the transaction) and the consequences, with a `Source` line naming AD-008
- [ ] Only the Status line of ADR 0023 changes, to `Amended by 0032` in the link form ADR 0001 uses
- [ ] The index lists ADR 0032 and shows 0023 as amended
- [ ] Gate check passes: `npx prettier --check README.md docs`

**Tests**: none
**Gate**: docs

**Commit**: `docs(adr): record that a repository's own transaction is the ambient one`

---

#### T67: Item removal and plan-part check order

**What**: An e2e case reads the work order back after an item removal, and a plan-part use case case pins that the quantity is checked before the catalog read.
**Where**: `test/e2e/work-orders.e2e.spec.ts`, `plan-part.use-case.spec.ts`
**Depends on**: T66
**Reuses**: The work order e2e fixtures; the `PartCatalog` fake
**Requirement**: CA-05

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] After `DELETE /work-orders/:number/items/:itemExternalId` answers 204, `GET /work-orders/:number` no longer lists the item
- [ ] The plan-part spec sends an invalid quantity for an item the catalog does not know and expects the quantity error
- [ ] Checked by hand in a scratch worktree: dropping `save` from `RemoveWorkOrderItemUseCase` (W1) and checking the quantity after the catalog read (W2) each fail a suite
- [ ] Gate check passes: `npm run test:unit && npm run test:integration && npm run test:e2e`
- [ ] Test count: unit and e2e totals each grow by 1

**Tests**: e2e
**Gate**: full

**Commit**: `test(work-orders): pin the item removal and the plan-part check order`

---

## Phase Execution Map

```
Phase 1 → Phase 2 → ... → Phase 17

Phase 1:  T1 → T2 → T3 → T4 → T5 → T6 → T7
Phase 2:  T8 → T9 → T10 → T61
Phase 3:  T11
Phase 4:  T12 → T13
Phase 5:  T14 → T15 → T16 → T17 → T18 → T19
Phase 6:  T20 → T21 → T22
Phase 7:  T23 → T24 → T25 → T62
Phase 8:  T26 → T27 → T28 → T29 → T30 → T31
Phase 9:  T32 → T33 → T34 → T35 → T36
Phase 10: T37 → T38
Phase 11: T39 → T40 → T41
Phase 12: T42 → T43 → T44 → T45 → T46
Phase 13: T47 → T48
Phase 14: T49 → T50
Phase 15: T51 → T52 → T53 → T54 → T55
Phase 16: T56 → T57
Phase 17: T58 → T59 → T60
Phase 18: T63 → T64 → T65 → T66 → T67
```

Execution is strictly sequential. Cross-phase dependencies (for example T21 on T15 and T16) point backward and need no arrow.

---

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| --- | --- | --- | --- |
| T1 | None | Phase 1 start | ✅ Match |
| T2 | T1 | T1 → T2 | ✅ Match |
| T3 | T2 | T2 → T3 | ✅ Match |
| T4 | T3 | T3 → T4 | ✅ Match |
| T5 | T4 | T4 → T5 | ✅ Match |
| T6 | T5 | T5 → T6 | ✅ Match |
| T7 | T6 | T6 → T7 | ✅ Match |
| T8 | T7 (phase 1) | Phase 2 start | ✅ Match |
| T9 | T8 | T8 → T9 | ✅ Match |
| T10 | T9 | T9 → T10 | ✅ Match |
| T61 | T10 | T10 → T61 | ✅ Match |
| T11 | T10 (phase 2) | Phase 3 start | ✅ Match |
| T12 | T11 (phase 3) | Phase 4 start | ✅ Match |
| T13 | T12 | T12 → T13 | ✅ Match |
| T14 | T13 (phase 4) | Phase 5 start | ✅ Match |
| T15 | T14 | T14 → T15 | ✅ Match |
| T16 | T15 | T15 → T16 | ✅ Match |
| T17 | T16 | T16 → T17 | ✅ Match |
| T18 | T17 | T17 → T18 | ✅ Match |
| T19 | T18 | T18 → T19 | ✅ Match |
| T20 | T19 (phase 5) | Phase 6 start | ✅ Match |
| T21 | T20; T15, T16 (phase 5) | T20 → T21 | ✅ Match |
| T22 | T21; T12 (phase 4) | T21 → T22 | ✅ Match |
| T23 | T22 (phase 6); T18 (phase 5) | Phase 7 start | ✅ Match |
| T24 | T23; T14 (phase 5) | T23 → T24 | ✅ Match |
| T25 | T24 | T24 → T25 | ✅ Match |
| T62 | T25 | T25 → T62 | ✅ Match |
| T26 | T25 (phase 7); T17 (phase 5) | Phase 8 start | ✅ Match |
| T27 | T26 | T26 → T27 | ✅ Match |
| T28 | T27; T14 (phase 5) | T27 → T28 | ✅ Match |
| T29 | T28 | T28 → T29 | ✅ Match |
| T30 | T29 | T29 → T30 | ✅ Match |
| T31 | T30; T15 (phase 5) | T30 → T31 | ✅ Match |
| T32 | T31 (phase 8) | Phase 9 start | ✅ Match |
| T33 | T32; T19 (phase 5) | T32 → T33 | ✅ Match |
| T34 | T33 | T33 → T34 | ✅ Match |
| T35 | T34; T16, T17, T18 (phase 5) | T34 → T35 | ✅ Match |
| T36 | T35 | T35 → T36 | ✅ Match |
| T37 | T36 (phase 9) | Phase 10 start | ✅ Match |
| T38 | T37 | T37 → T38 | ✅ Match |
| T39 | T38 (phase 10) | Phase 11 start | ✅ Match |
| T40 | T39 | T39 → T40 | ✅ Match |
| T41 | T40 | T40 → T41 | ✅ Match |
| T42 | T41 (phase 11) | Phase 12 start | ✅ Match |
| T43 | T42 | T42 → T43 | ✅ Match |
| T44 | T43 | T43 → T44 | ✅ Match |
| T45 | T44 | T44 → T45 | ✅ Match |
| T46 | T45 | T45 → T46 | ✅ Match |
| T47 | T46 (phase 12) | Phase 13 start | ✅ Match |
| T48 | T47 | T47 → T48 | ✅ Match |
| T49 | T48 (phase 13) | Phase 14 start | ✅ Match |
| T50 | T49 | T49 → T50 | ✅ Match |
| T51 | T50 (phase 14) | Phase 15 start | ✅ Match |
| T52 | T51 | T51 → T52 | ✅ Match |
| T53 | T52 | T52 → T53 | ✅ Match |
| T54 | T53 | T53 → T54 | ✅ Match |
| T55 | T54 | T54 → T55 | ✅ Match |
| T56 | T55 (phase 15) | Phase 16 start | ✅ Match |
| T57 | T56 | T56 → T57 | ✅ Match |
| T58 | T57 (phase 16) | Phase 17 start | ✅ Match |
| T59 | T58 | T58 → T59 | ✅ Match |
| T60 | T59 | T59 → T60 | ✅ Match |
| T63 | T60 (phase 17) | Phase 18 start | ✅ Match |
| T64 | T63 | T63 → T64 | ✅ Match |
| T65 | T64 | T64 → T65 | ✅ Match |
| T66 | T65 | T65 → T66 | ✅ Match |
| T67 | T66 | T66 → T67 | ✅ Match |

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| --- | --- | --- | --- | --- |
| T1: OpenAPI contract | Composition (Swagger setup), route contract | e2e | e2e | ✅ OK |
| T2: Role routes | Route (tests only) | e2e | e2e | ✅ OK |
| T3: Permission and access routes | Route (tests only) | e2e | e2e | ✅ OK |
| T4: Work order not-found | Route (tests only) | e2e | e2e | ✅ OK |
| T5: Other not-found | Route (tests only) | e2e | e2e | ✅ OK |
| T6: Cross-module reads | Route (tests only) | e2e | e2e | ✅ OK |
| T7: ADRs | Documentation | none | none | ✅ OK |
| T8: dependency-cruiser | Architecture checks | unit | unit | ✅ OK |
| T9: Table ownership | Architecture checks | unit | unit | ✅ OK |
| T10: Purity ratchet | Architecture checks | unit | unit | ✅ OK |
| T61: Module cycles | Architecture checks | unit | unit | ✅ OK |
| T11: Identity move | Every layer, paths only | e2e (highest) | e2e | ✅ OK |
| T12: Event dispatcher | Domain event dispatcher | unit | unit | ✅ OK |
| T13: Shared tokens | Tokens | none | none | ✅ OK |
| T14: User key resolver | Key resolver | integration | integration | ✅ OK |
| T15: Customer key resolver | Key resolver | integration | integration | ✅ OK |
| T16: Vehicle key resolver | Key resolver | integration | integration | ✅ OK |
| T17: Service key resolver | Key resolver | integration | integration | ✅ OK |
| T18: Inventory item key resolver | Key resolver | integration | integration | ✅ OK |
| T19: Find users | Use case, query adapter | integration (highest) | integration | ✅ OK |
| T20: work-orders tokens and contract | Tokens, contract move | none | none | ✅ OK |
| T21: Directories | Gateways, ports | unit | unit | ✅ OK |
| T22: Create work order | Use case, controller | e2e (highest) | e2e | ✅ OK |
| T23: Work order reads | Repository-level adapter | integration | integration | ✅ OK |
| T24: Inventory queries | Query adapter | integration | integration | ✅ OK |
| T25: Inventory repository | Repository | integration | integration | ✅ OK |
| T62: Own transaction | Repositories, transaction context | integration | integration | ✅ OK |
| T26: Catalogs | Gateways, use cases | unit | unit | ✅ OK |
| T27: Stock ledger | Gateway, use cases | unit | unit | ✅ OK |
| T28: Actors | Gateway, use cases | unit | unit | ✅ OK |
| T29: Own work orders | Use cases | unit | unit | ✅ OK |
| T30: Customer accounts | Gateway, use case | unit | unit | ✅ OK |
| T31: Vehicle owners | Gateway, use cases | unit | unit | ✅ OK |
| T32: Customer repository | Repository | integration | integration | ✅ OK |
| T33: Customer queries | Query adapter | integration | integration | ✅ OK |
| T34: Vehicle adapters | Repository, query adapter | integration | integration | ✅ OK |
| T35: Work order repository | Repository | integration | integration | ✅ OK |
| T36: Work order queries | Query adapters | integration | integration | ✅ OK |
| T37: services use cases | Use cases, controller | e2e (highest) | e2e | ✅ OK |
| T38: services rename | Use cases (names only) | unit | unit | ✅ OK |
| T39: Inventory catalog | Use cases, controller | e2e (highest) | e2e | ✅ OK |
| T40: Inventory stock | Use cases, controller | e2e (highest) | e2e | ✅ OK |
| T41: inventory rename | Use cases (names only) | unit | unit | ✅ OK |
| T42: Authorization queries | Use cases, controller | e2e (highest) | e2e | ✅ OK |
| T43: Authorization commands | Use cases, subscriber | e2e (highest) | e2e | ✅ OK |
| T44: Authentication | Use cases, subscriber | e2e (highest) | e2e | ✅ OK |
| T45: Users | Use cases, controller | e2e (highest) | e2e | ✅ OK |
| T46: identity rename | Use cases (names only) | unit | unit | ✅ OK |
| T47: customers use cases | Use cases, controller | e2e (highest) | e2e | ✅ OK |
| T48: customers rename | Use cases (names only) | unit | unit | ✅ OK |
| T49: vehicles use cases | Use cases, controller | e2e (highest) | e2e | ✅ OK |
| T50: vehicles rename | Use cases (names only) | unit | unit | ✅ OK |
| T51: Items and diagnosis | Use cases, controller | e2e (highest) | e2e | ✅ OK |
| T52: Budget | Use cases, controller | e2e (highest) | e2e | ✅ OK |
| T53: Execution and closing | Use cases, controller | e2e (highest) | e2e | ✅ OK |
| T54: Work order queries | Use cases, controller | e2e (highest) | e2e | ✅ OK |
| T55: work-orders rename | Use cases (names only) | unit | unit | ✅ OK |
| T56: Seed | Script over use cases | integration | integration | ✅ OK |
| T57: Bus removal | Composition, architecture checks | unit (checks) plus build | unit | ✅ OK |
| T58: README | Documentation | none | none | ✅ OK |
| T59: Low-level designs | Documentation | none | none | ✅ OK |
| T60: C4 and overviews | Documentation | none | none | ✅ OK |
| T63: Metrics days | Integration spec | integration | integration | ✅ OK |
| T64: Seed spec database | Integration spec, use case specs | integration (highest) | integration | ✅ OK |
| T65: Root file fixture | Architecture checks | unit | unit | ✅ OK |
| T66: ADR 0032 | Documentation | none | none | ✅ OK |
| T67: Removal and check order | Route, use case spec | e2e (highest) | e2e | ✅ OK |
