# Clean Architecture Specification

## Problem Statement

Phase 2 of the Tech Challenge grades Clean Architecture. This repository measures it against the study the user provided on 2026-10-27 (summarized in `context.md`): source dependencies point inward, and business rules stay independent of frameworks, the database and the delivery mechanism. The domain layer already meets that bar. The application layer does not: 76 handlers carry `@nestjs/cqrs` decorators and `@Inject`, five application services carry `@Injectable`, two event subscribers carry `@EventsHandler`, four authentication handlers read `@nestjs/config`, and one subscriber logs through Nest's `Logger`. Use cases reach other modules by dispatching those modules' messages on a global bus, `users`, `authentication` and `authorization` depend on one another in a cycle, injection tokens live in the inner layers, seven controllers decide when a record counts as not found, nine adapters read tables owned by other modules, and 47 use case specs stub the bus. This feature fixes the structure before the Phase 2 API changes, so those changes land on the final shape.

## Goals

- [ ] Zero imports of framework or infrastructure packages under `src/**/domain/**` and `src/**/application/**`, specs included, as reported by the architecture check.
- [ ] Zero dependency cycles between modules, as reported by the architecture check.
- [ ] Zero queries, in any module's adapters, on a table another module owns, as reported by the table check.
- [ ] Every e2e test written before this feature passes after it with its assertions unchanged, and the OpenAPI document matches the baseline captured before the first change.
- [ ] Every coverage threshold in `vitest.config.ts` keeps its percentage and passes.
- [ ] The seed CLI runs the same use cases as the HTTP API, with no bus in between.

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
| --- | --- |
| Phase 2 API changes: opening a work order with services and parts, the new listing order, the budget approval webhook, status e-mails | Separate features that build on this one |
| Kubernetes manifests, Terraform and the CI/CD pipeline | Separate Phase 2 features |
| Moving route-level permission checks into the use cases | Decided: they stay in the HTTP guard (D5 in `context.md`) |
| Renaming the layer folders `domain`, `application`, `infrastructure` and `presentation` | The study accepts any number of layers as long as dependencies point inward |
| Presenter classes and output ports | The controller already translates the use case output into the response, which is what the study describes |
| Changing domain behavior, aggregates or value objects, except that a stock movement carries the operation id of the step that wrote it, and a consumption a step tagged counts once its work order confirmed it (CA-10) | The domain already meets the dependency rule; only the repository contracts leave it |
| Database schema changes beyond the migrations CA-10 needs (the two step tables, `stock_movements.operation_id` and `stock_movements.confirmed_at`), including one schema per module | Read isolation (D7) works on the current schema: the foreign keys stay, and each module queries only its own tables |
| Replacing the `vi.fn` stubs of query ports in query use case specs with fakes | They stub a port at the boundary, which the study allows; the bus stubs are what this feature removes |
| Formatting the ~148 files `npm run format:check` already flags | Pre-existing and unrelated to the architecture |
| A screen or an endpoint that lists failed steps | A failed step is logged at error level and stays in its table for an operator |

---

## Assumptions & Open Questions

Every ambiguity is resolved or recorded here, so nothing is left silently unclear.

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| How "the API is unchanged" is measured | Capture the OpenAPI document and run the e2e suite on the commit before the first change; after each migrated flow the document must still match and no e2e assertion may change. One exception, approved on 2026-10-31: the case of a cancellation racing a withdrawal (CA-02 AC2, CA-10) | The OpenAPI document carries every route, payload shape and status code, and the e2e suite pins the behavior behind them. With the stock consumed before the work order saves, a withdrawal that loses that race leaves its consumption and the return beside it in the history, as a withdrawal returned before a cancellation already does | y |
| Routes no e2e test exercises today | Each one gets a characterization e2e test before its flow migrates | The study's refactoring sequence records the current behavior first | y |
| Event dispatch semantics | Keep today's timing: the publisher does not wait for subscribers, and a subscriber error is logged at error level under the `EventBus` context and never reaches the caller. The log line names the subscriber's class | That is how the `EventBus` of `@nestjs/cqrs` 11.0.3 behaves today, except for the name: its line reads `"InstanceWrapper" has thrown an unhandled exception.`, because it reads the name from Nest's provider wrapper (checked on 2026-10-29). Naming the subscriber is the one change, and it touches no route answer | y |
| Cross-module write consistency | Steps committed per module and completed through a durable outbox the orchestrating module owns: compensation for the withdrawal and the registration, retry for the return, the delivery and the cancellation | The user's decision of 2026-10-31 | y |
| Cross-module table access (D7): nine adapters read tables another module owns. The repositories of `customers`, `vehicles`, `inventory` and `work-orders` translate identifiers (a UUID into an internal key and back), mostly through standalone lookups such as `SELECT id FROM customers WHERE external_id = $1`. The five read adapters (the query adapters of `customers`, `vehicles`, `inventory` and `work-orders`, and the work order metrics adapter) join foreign tables to assemble listings, details and reports. AD-001 is the root: foreign keys use internal ids | Every module queries only its own tables. Identifier translation goes through a key resolver each owner offers, running inside the caller's transaction. Data owned by another module comes from that module's public API, in batch, and the consumer composes it in memory. The shared schema and its foreign keys stay, and a module writes only its own tables | The user's decision (2026-10-28): it avoids coupling between modules, avoids dependency cycles and keeps each module responsible for its own data | y |
| How `inventory` reaches work order data without a cycle: it needs the internal key of a work order, the outstanding demand per item for the shortage report, and the open work orders that plan an item before a deactivation | `inventory` declares these needs as interfaces of its own; `work-orders` implements them, and the root module binds the implementation | `work-orders` already calls `inventory` to move stock, so a call in the other direction would close a cycle; with the inversion, every dependency between the two points from `work-orders` to `inventory` | y |
| Costs of composing reads in memory | Accepted: a request that ran one query now runs several batch queries (the work order detail gains five), and a read composed from two modules no longer comes from one database snapshot | Batch calls keep the query count bounded, with no N+1, and no rule in this system depends on reading two modules in the same snapshot | y |
| Staff accounts created by the seed | Stay as direct inserts | AD-006: `SUPER_ADMIN` cannot be created through the API | y |
| Identity module layout | `src/modules/identity/` holds `users/`, `authentication/` and `authorization/`, each keeping its four layer folders, under one Nest module | Every file keeps its layer visible, and the move changes paths only | y |
| Use case naming | Class `<Name>UseCase` in `<name>.use-case.ts`; input classes keep their `<Name>Command` and `<Name>Query` names, and the `commands/` and `queries/` folders stay | The folders still show the split between writes and reads | y |
| Module public API | `src/modules/<module>/index.ts` exports the use cases and input/output types other modules may use | Makes each boundary explicit and checkable | y |
| Pilot flow | Opening a work order (`POST /work-orders`) migrates first | It exercises a repository, two generators, two cross-module ports, domain events and a controller, and Phase 2 changes it next | y |
| Migration order after the pilot | `services`, `inventory`, `identity`, `customers`, `vehicles`, then the rest of `work-orders` | Dependency order, leaves first | y |
| Branch and blast radius | Work on the current branch, `feat/tech-challenge-2`; local commits only | The user chose the current branch; pushing needs an explicit go-ahead | y |
| Import checker | `dependency-cruiser` as a dev dependency, run by `npm run lint`, starting from a baseline of known violations; ESLint keeps its per-layer package bans | It detects cycles, supports a baseline for a gradual migration and draws the module graph | y |

**Open questions:** none. Every item above is resolved and confirmed.

---

## Implicit-Requirement Dimensions Sweep

Scope is Large, so every dimension resolves to a requirement or an explicit `N/A because`.

| Dimension | Resolution |
| --- | --- |
| Input validation & bounds | Real: validation responses stay identical, including the CPF/CNPJ filter of `GET /customers`, whose parsing leaves the `customers` application layer. CA-02 and the Edge Cases. |
| Failure / partial-failure states | Real: a write spanning two modules runs as steps, each committed by its own module, and a durable outbox completes a later step by retry or undoes an earlier one by compensation; a key resolver sees rows written earlier in the caller's transaction; a failing subscriber never fails the request. CA-02, CA-03, CA-10. |
| Idempotency / retry / duplicate handling | Real: the five-attempt retry on a taken work order number survives the pilot, and every step across modules applies once per operation id and retries with a growing delay. CA-10 and the Edge Cases. |
| Auth boundaries & rate limits | Real for auth: route permissions stay in the HTTP guard and data-dependent rules stay in the use cases, both pinned by the unchanged e2e suite. CA-02, CA-07. Rate limits: N/A because the throttler and its configuration are untouched. |
| Concurrency / ordering | Real: the optimistic version guard (AD-009) and the inventory batch lock keep their behavior. A read composed from two modules no longer comes from one snapshot, accepted in the Assumptions table. A work order's steps apply in the order they were recorded, each claimed with `FOR UPDATE SKIP LOCKED` and a lease, and a consumption counts for a restore, a settlement or a write-off only once its work order confirmed it. CA-10 and the Edge Cases. |
| Data lifecycle / expiry | Real: token lifetimes keep coming from the environment after the use cases stop reading `@nestjs/config`. CA-01. |
| Observability | Real: the refresh-token-reuse warning keeps its context and message after its subscriber moves to infrastructure, and subscriber errors keep being logged. CA-01, CA-02. |
| External-dependency failure | N/A because no adapter to Postgres or Redis changes how it handles failure. |
| State-transition integrity | N/A because the domain's behavior is out of scope and its specs run with their assertions unchanged. |

---

## User Stories

### P1: The core runs without the framework (CA-01, MVP)

**User Story**: As a maintainer, I want the domain and application layers to import no framework or infrastructure package, so that business rules run and are tested without Nest, TypeORM or HTTP.

**Why P1**: It is the dependency rule, the study's first mandatory premise and the core of what Phase 2 grades.

**Acceptance Criteria**:
1. The system SHALL contain no import of `@nestjs/*`, `typeorm`, `ioredis`, `argon2`, `pg`, `express`, `class-validator`, `class-transformer`, `zod`, `rxjs` or a `node:*` module in any file under `src/**/domain/**` or `src/**/application/**`, spec files included.
2. The system SHALL carry no decorator on any class, method or constructor parameter declared under `src/**/application/**`.
3. The system SHALL declare no dependency injection token under `src/**/domain/**` or `src/**/application/**`.
4. The system SHALL declare every repository contract in the `application/ports` folder of the module that owns the repository.
5. The system SHALL build every use case in its module's composition root, handing each dependency to the use case's constructor.
6. WHEN `REFRESH_TOKEN_TTL_SECONDS` is 600 THEN the system SHALL answer a successful login with a `refreshTokenExpiresAt` 600 seconds after the login.
7. WHEN the system detects that a refresh token was reused THEN the system SHALL log at warn level, under the `AuthenticationSecurity` context, the message `Refresh token reuse detected for session <sessionId>; the session was revoked.`

**Independent Test**: Run the architecture check against `domain` and `application` and get zero violations, then run `npm run test:unit` and watch every core spec pass without a Nest application or testing module.

---

### P1: Every route answers exactly as before (CA-02, MVP)

**User Story**: As an API client, I want every route to keep its paths, payloads, status codes and error codes, so that the refactor is invisible outside the process.

**Why P1**: A refactor that changes behavior is a regression, and the Phase 2 features build on this contract.

**Acceptance Criteria**:
1. The system SHALL generate an OpenAPI document identical to the baseline captured before this feature's first code change.
2. WHEN `npm run test:e2e` runs THEN the system SHALL pass every e2e test that existed before this feature, with no assertion changed except the case of a cancellation racing a withdrawal in `test/e2e/work-order-concurrency.e2e.spec.ts`, whose assertion the user amended on 2026-10-31 for CA-10: no consumption keeps units outstanding, and the stock is back where it was.
3. The system SHALL exercise each HTTP route in at least one e2e test written before that route's flow migrates.
4. IF a query use case finds no record for the identifier it receives THEN the system SHALL raise the owning module's not-found error from inside the use case.
5. IF a write that spans two modules fails in a later step THEN the system SHALL compensate or retry it as CA-10 defines, so that no operation stays half applied (amended on 2026-10-31; it asked for a rollback of a shared transaction).
6. IF a domain event subscriber throws THEN the system SHALL return the use case's result to the caller and log the error at error level with the subscriber's name.

**Independent Test**: On the commit before the first change, save the OpenAPI document and run `npm run test:e2e`; repeat on the final commit, compare the two documents and check that both runs pass.

---

### P1: Modules meet only through ports and public APIs, without cycles (CA-03, MVP)

**User Story**: As a maintainer, I want each module to reach another only through a port it declares and the other module's public API, with no cycle, so that a module can change without breaking the modules that use it.

**Why P1**: The study requires explicit module boundaries without cycles, and removing the bus exposes the dependencies it hid.

**Acceptance Criteria**:
1. The system SHALL have no dependency cycle between modules.
2. The system SHALL have no import from one module's `domain` or `application` folder into another module.
3. The system SHALL let a module's `infrastructure` or `presentation` import another module only through that module's `index.ts`.
4. WHEN a use case needs data or an action owned by another module THEN the system SHALL reach it through a port declared in the consuming module's `application/ports` and implemented in the consuming module's `infrastructure`.
5. The system SHALL hold `users`, `authentication` and `authorization` under `src/modules/identity`, wired by one Nest module.
6. The system SHALL contain no reference to `CommandBus`, `QueryBus` or `@nestjs/cqrs` in `src`, `test` or `scripts`, and no `@nestjs/cqrs` dependency in `package.json`.
7. The system SHALL add to `src/shared` only the domain event publisher port, its in-memory dispatcher, their specs, the file that receives the shared injection tokens moved out of `shared/application`, and `runInNewTransaction`, which opens a repository's own transaction and publishes it as the ambient one (amended on 2026-10-31 after T62), and the migrations `1787702400009-add-cross-module-steps.ts` and `1787702400010-add-consumption-confirmation.ts`, which CA-10 needs (amended on 2026-10-31 after the second and the third validation).
8. The system SHALL write only to tables owned by the module whose adapter issues the write.
9. The system SHALL run no query, in any module's adapter, that reads a table another module owns.
10. WHEN an adapter needs to translate between the UUID and the internal key of a row another module owns THEN the system SHALL obtain the translation from that module's key resolver.
11. WHEN a module needs data another module owns THEN the system SHALL fetch it in batch through that module's public API and compose it in memory.
12. IF the module that owns the data already depends on the module that needs it THEN the system SHALL have the consumer declare the interface, the owner implement it, and the root module bind the two.
13. WHEN a key resolver runs inside a transaction THEN the system SHALL resolve rows written earlier in that same transaction.

**Independent Test**: Run the architecture check and get zero cycle and boundary violations, grep `src`, `test` and `scripts` for `@nestjs/cqrs` and get no match, and run the table check and get no finding.

---

### P1: The build enforces the architecture (CA-04, MVP)

**User Story**: As a maintainer, I want `npm run lint` to fail on any import or table access the architecture forbids, so that the structure cannot erode after this feature.

**Why P1**: A rule nobody checks drifts, and the study's refactoring sequence checks forbidden imports after each flow.

**Acceptance Criteria**:
1. WHEN `npm run lint` runs on a tree where a file under `domain` or `application` imports a package CA-01 bans THEN the system SHALL exit non-zero, naming the file and the rule.
2. WHEN `npm run lint` runs on a tree with a dependency cycle between modules THEN the system SHALL exit non-zero, naming the files in the cycle.
3. WHEN `npm run lint` runs on a tree where a module imports another module outside that module's `index.ts` THEN the system SHALL exit non-zero, naming the importing file.
4. IF any adapter references a table another module owns THEN `npm run lint` SHALL exit non-zero, naming the adapter and the table.
5. The system SHALL finish this feature with an empty known-violations baseline.
6. WHEN a push starts THEN the pre-push hook SHALL run these checks through `npm run lint`.

**Independent Test**: Add a throwaway file under an `application` folder that imports `@nestjs/common`, run `npm run lint`, see it fail naming that file, and delete it.

---

### P1: Use case tests exercise real collaborators (CA-05, MVP)

**User Story**: As a maintainer, I want use case specs to run real entities against in-memory fakes at the ports, so that they check outcomes and survive refactors.

**Why P1**: The bus stubs disappear with the bus, and the study warns against mocking every interaction.

**Acceptance Criteria**:
1. The system SHALL contain no `stubCommandBus`, `stubQueryBus` or `stubEventBus` helper in the test tree.
2. The system SHALL test each use case that calls another module through in-memory fakes of its cross-module ports, kept in `test/support/fakes`.
3. The system SHALL assert a cross-module collaboration in a use case spec through the state of the fake, with no `toHaveBeenCalled` assertion on a cross-module port.
4. The system SHALL keep the percentage of every coverage threshold in `vitest.config.ts` and apply each threshold to the same code after that code moves.

**Independent Test**: Run `npm run test:coverage` and see every threshold pass, then grep the test tree for the three stub helpers and get no match.

---

### P1: A second entry point reuses the use cases (CA-06, MVP)

**User Story**: As an operator, I want the seed CLI to run the same use cases as the HTTP API, so that a new entry point needs no copy of the business rules.

**Why P1**: It is the study's third acceptance criterion.

**Acceptance Criteria**:
1. WHEN `npm run seed` runs THEN the system SHALL create services, inventory items, opening stock, customers and vehicles by calling the create-service, create-inventory-item, replenish-stock, register-customer and register-vehicle use cases resolved from the composition root.

**Independent Test**: Run `npm run seed` on an empty database and read the created records through the API.

---

### P1: The decisions and extra choices are recorded (CA-07, MVP)

**User Story**: As an evaluator, I want each architectural decision of this feature recorded with its reasoning, so that the Clean Architecture claim can be checked against the code.

**Why P1**: AD-010 requires every decision in two cross-referenced places, and the study asks for a justification of each extra pattern kept.

**Acceptance Criteria**:
1. The system SHALL record each decision of this feature as an `AD-NNN` entry in `.specs/STATE.md` and an ADR in `docs/adr/`, each naming the other.
2. The system SHALL justify, in an ADR, each choice the study says needs its own justification and this feature keeps: the command/query split, one class per use case, Nest dependency injection confined to the composition roots, and domain events.
3. The system SHALL record, in an ADR, that route-level permission checks stay in the HTTP guard and that each entry point authenticates and authorizes its own caller.
4. The system SHALL mark ADR 0008 and AD-003 as superseded by this feature's decision on cross-module calls.
5. The system SHALL record, in an ADR, that each module queries only its own tables, justified by avoiding coupling between modules, avoiding dependency cycles and keeping each module responsible for its own data.
6. The system SHALL record, in an ADR, the dependency inversion between `inventory` and `work-orders` and the cycle it avoids.

**Independent Test**: Open each new ADR and its `AD-NNN` entry and follow the cross-reference both ways.

---

### P1: Writes across modules run as steps an outbox completes (CA-10, MVP)

**User Story**: As a maintainer, I want each module to commit only its own tables, and the operations that touch two modules to complete through compensation or retry, so that no module's transaction reaches into another module's data.

**Why P1**: On 2026-10-31 the user moved the five flows that wrote two modules in one transaction (withdraw, return, deliver and cancel between `work-orders` and `inventory`; customer registration between `customers` and `identity`) to compensation inside this feature, with a durable outbox, so that a crash between two steps leaves no operation half applied.

**Acceptance Criteria**:
1. The system SHALL open no transaction that writes the tables of two modules; `TransactionRunner.run` wraps writes to the calling module's own tables only.
2. WHEN a parts withdrawal is accepted THEN the system SHALL consume the stock before it saves the work order; IF the stock falls short THEN the system SHALL answer 422 `INVENTORY_INSUFFICIENT_STOCK` and change neither the work order nor any stock level.
3. IF the work order save fails after a withdrawal consumed stock THEN the system SHALL return every consumed unit, record each return in the item's movement history linked to the work order, and answer the save's error.
4. WHEN a parts return, a delivery or a cancellation is saved THEN the system SHALL record, in the same transaction, a pending step that restores, settles or writes off the work order's stock, and apply that step after the commit.
5. IF a pending step fails THEN the system SHALL keep it pending and retry it with a growing delay, and the answer to the request SHALL reflect the saved work order.
6. WHEN a pending step is applied more than once THEN the system SHALL change the stock or the accounts once.
7. WHEN `POST /customers` opens a new account THEN the system SHALL open it in `identity` before it saves the customer; IF the customer save fails THEN the system SHALL discard that account, its role included, and answer the save's error.
8. IF the process stops after the first step of a withdrawal or of a registration and before its last step THEN the system SHALL compensate the first step once the grace period of its pending step has passed.
9. WHEN a pending step reaches the attempt limit THEN the system SHALL mark it failed and log at error level the step kind, its operation id, the work order or the user, and the last error.
10. WHEN a work order has more than one step that is not done THEN the system SHALL apply its confirmations, restores, settlements and write-offs in the order they were recorded, and a failed one SHALL hold the later ones; an undo SHALL apply once it is due, neither waiting for nor holding the other steps (added on 2026-10-31 after the second validation, amended after the third).
11. WHEN the work order save of a withdrawal commits THEN the system SHALL confirm the withdrawal's consumption through a step recorded in that transaction, and a restore, a settlement and a write-off SHALL act only on confirmed consumptions (added on 2026-10-31 after the third validation).

**Independent Test**: Run two concurrent withdrawals on one work order and find one 409, the other withdrawal applied once, and the stock lower by that withdrawal only; in an integration test, stop a withdrawal after its consumption, move the clock past the grace period, run the processor, and find the units returned.

---

### P2: Use cases carry the use case name (CA-08)

**User Story**: As a reader of the code, I want every application operation named `<Name>UseCase`, so that the use case layer is visible in the file tree.

**Why P2**: The name changes no dependency; it makes the architecture legible to an evaluator.

**Acceptance Criteria**:
1. The system SHALL name every class that executes an operation under `application/commands` or `application/queries` `<Name>UseCase`, declared in `<name>.use-case.ts`.
2. The system SHALL keep each use case's spec beside it as `<name>.use-case.spec.ts`.

**Independent Test**: List every `application/commands` and `application/queries` folder and find only `.use-case.ts`, `.use-case.spec.ts`, `.command.ts` and `.query.ts` files.

---

### P2: The documentation matches the new structure (CA-09)

**User Story**: As an evaluator, I want the README and the architecture documents to describe the code as it is after this feature, so that reading them gives the same picture as reading the code.

**Why P2**: Stale documents mislead, but they do not change behavior.

**Acceptance Criteria**:
1. The system SHALL show, in `README.md`, the dependency circles with the folder that maps to each, and the module dependency graph.
2. The system SHALL contain no mention of `CommandBus`, `QueryBus`, `@nestjs/cqrs`, a class whose name ends in `Handler`, or the paths `modules/users`, `modules/authentication` and `modules/authorization` in `README.md` or under `docs/architecture/`.

**Independent Test**: Grep `README.md` and `docs/architecture/` for the listed names and get no match.

---

## Edge Cases

- IF `GET /work-orders/:number` names no existing work order THEN the system SHALL answer 404 with code `WORK_ORDER_NOT_FOUND`.
- IF `GET /work-orders/me/:number` names a work order of another customer THEN the system SHALL answer 404 with code `WORK_ORDER_NOT_FOUND`.
- IF `GET /services/:externalId` names no existing service THEN the system SHALL answer 404 with code `SERVICE_NOT_FOUND`.
- IF `GET /inventory-items/:externalId` names no existing item THEN the system SHALL answer 404 with code `INVENTORY_ITEM_NOT_FOUND`.
- IF `GET /inventory-items/:externalId/movements` names no existing item THEN the system SHALL answer 404 with code `INVENTORY_ITEM_NOT_FOUND`.
- IF `GET /vehicles/:externalId` names no existing vehicle THEN the system SHALL answer 404 with code `VEHICLE_NOT_FOUND`.
- IF `GET /customers/:externalId` names no existing customer THEN the system SHALL answer 404 with code `CUSTOMER_NOT_FOUND`.
- IF a user with no customer record calls `GET /customers/me` THEN the system SHALL answer 404 with code `CUSTOMER_NOT_FOUND`.
- IF `GET /users/:externalId` names no existing user THEN the system SHALL answer 404 with code `USER_NOT_FOUND`.
- IF `GET /roles/:id` names no existing role THEN the system SHALL answer 404 with code `ROLE_NOT_FOUND`.
- IF `GET /customers?document=` carries a malformed CPF or CNPJ THEN the system SHALL answer 200 with an empty list.
- WHEN `GET /customers?document=` carries a well-formed CPF or CNPJ THEN the system SHALL return only the active customer with that document.
- WHEN `GET /customers?name=` carries part of a name, in any letter case, THEN the system SHALL return the active customers whose name contains it, newest first.
- WHEN `GET /inventory-items/shortages` runs THEN the system SHALL list each item whose outstanding quantity (planned minus withdrawn, on approved budgets of work orders in execution) exceeds its quantity on hand, with that quantity and the numbers of those work orders.
- IF `DELETE /inventory-items/:externalId` targets an item planned on a work order that is neither delivered nor canceled THEN the system SHALL answer 409 with code `INVENTORY_ITEM_IN_USE`.
- WHEN `GET /inventory-items/:externalId/movements` lists a movement tied to a work order THEN the system SHALL return that work order's UUID and the UUID of the user who made the movement.
- WHEN all five work order numbers drawn for `POST /work-orders` are already taken THEN the system SHALL answer 409 with code `WORK_ORDER_NUMBER_TAKEN`.
- WHEN two requests change the same work order at the same time THEN the system SHALL answer one of them 409 with code `CONCURRENT_MODIFICATION`.
- IF a parts withdrawal asks for more units than the stock holds THEN the system SHALL answer 422 with code `INVENTORY_INSUFFICIENT_STOCK` and change neither the work order nor any stock level.
- IF the work order save fails with 409 `CONCURRENT_MODIFICATION` after a withdrawal consumed stock THEN the system SHALL return the consumed units, leaving every stock level as it was before the withdrawal.
- IF the inventory step of a return, a delivery or a cancellation fails THEN the system SHALL keep the work order's change and apply the inventory step on a later attempt.
- IF the customer save fails after `identity` opened the account THEN the system SHALL leave no user with that email or document, so that the same registration can be sent again.
- IF a withdrawal or a registration reaches its last step after the processor claimed its armed step THEN the system SHALL answer 409 with code `CONCURRENT_MODIFICATION`, save neither the work order change nor the customer, and still undo the consumption or discard the account.
- IF the restore step of a return fails and a cancellation or a delivery of the same work order is saved before the restore applies THEN the system SHALL apply the restore first, so the returned units are back in stock and the write-off or the settlement closes only what stays outstanding.
- IF a return of a work order applies while a withdrawal of the same work order is in flight, after a race or after the return's restore failed, THEN the system SHALL draw the return's units from consumptions the work order confirmed, and the undo of that withdrawal SHALL return all of its units.
- WHEN `POST /customers` registers a new customer THEN the system SHALL link the customer to the user `identity` opened earlier in the same registration, whose internal key the identity key resolver returns.
- IF a domain event subscriber throws THEN the caller SHALL receive the use case's result, and the system SHALL log the error with the subscriber's name.

---

## Requirement Traceability

Each requirement gets a unique ID for tracking across design, tasks, and validation.

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| CA-01 | P1: The core runs without the framework | Tasks | In Tasks |
| CA-02 | P1: Every route answers exactly as before | Tasks | In Tasks |
| CA-03 | P1: Modules meet only through ports and public APIs, without cycles | Tasks | In Tasks |
| CA-04 | P1: The build enforces the architecture | Tasks | In Tasks |
| CA-05 | P1: Use case tests exercise real collaborators | Tasks | In Tasks |
| CA-06 | P1: A second entry point reuses the use cases | Tasks | In Tasks |
| CA-07 | P1: The decisions and extra choices are recorded | Tasks | In Tasks |
| CA-08 | P2: Use cases carry the use case name | Tasks | In Tasks |
| CA-09 | P2: The documentation matches the new structure | Tasks | In Tasks |
| CA-10 | P1: Writes across modules run as steps an outbox completes | Tasks | In Tasks |

**ID format:** `CA-NN`

**Status values:** Pending, In Design, In Tasks, Implementing, Verified

**Coverage:** 10 total, 10 mapped to tasks, 0 unmapped

---

## Success Criteria

- [ ] `npm run lint`, `npm run build`, `npm run test:unit`, `npm run test:integration`, `npm run test:e2e` and `npm run test:coverage` pass on the final commit.
- [ ] The architecture check reports zero violations with an empty baseline.
- [ ] The table check finds no query on a table another module owns.
- [ ] The OpenAPI document of the final commit matches the baseline.
- [ ] `npm run seed` completes on an empty database.
