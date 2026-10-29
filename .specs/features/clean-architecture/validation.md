# Clean architecture validation

**Date**: 2026-10-29
**Spec**: `.specs/features/clean-architecture/spec.md`
**Diff range**: `51a3a8a..943018a` (76 commits: 62 task commits, the fix `6cdf869` and 13 `.specs` records)
**Verifier**: independent sub-agent (author is not the verifier)
**Verdict**: FAIL

---

## Verdict

FAIL. The code meets 45 of the 47 acceptance criteria and all 22 edge cases, and 18 of the 19 mutants injected into the feature's own code die. Three findings block the verdict:

1. The Build gate fails on the project's test database. `npm run test:integration` exits 1 because two cases of `test/integration/work-order-metrics-query.adapter.spec.ts` time out. Its `pickClearDay` helper (line 142) redraws without a bound until it finds a 30-day window with no completed work order between 2000 and 2019, and the never-truncated `workshop_test` has no such window left. The same suite passes 342 of 342 on an empty scratch database at `943018a`, so the code is sound and the fixture strategy is not.
2. `test/integration/seed.script.spec.ts` discriminates only on an empty database. On a database that already holds the demo rows, which is the state of `workshop_test` after the first run, the seed skips every use case call. Three mutants (no opening stock, a vehicle year off by one, a customer registered without the phone) then pass every suite.
3. Mutant M07 survives: a `through-public-api` rule loosened to accept any file at a module's root, such as `customers.tokens.ts`, passes every test and `npm run lint`. The real rule refuses that import (acceptance check A3b); no fixture pins the case.

Two record gaps are minor (CA-07 AC1 and CA-03 AC7). Two mutants on logic this feature did not change also survive (W1 and W2); they fall under no acceptance criterion of this spec.

---

## Task completion

Every task of `tasks.md` is checked (295 Done-when boxes checked, 0 open). Each task has one commit, every commit message passes `check_commit.py`, and none carries a trailer.

| Phase | Tasks and commits | Status |
| --- | --- | --- |
| 1. Safety net and records | T1 `709eb27`, T2 `64b511f`, T3 `d814e2e`, T4 `416db23`, T5 `6253ca3`, T6 `14f9b16`, T7 `61984b9` | Done |
| Fix outside the list | `6cdf869` (trail order tie-breaker) | Done; M17 proves its test |
| 2. Checks in report mode | T8 `f59344b`, T9 `2da307d`, T10 `80c3044`, T61 `837dcea` | Done |
| 3. Identity module | T11 `87b9fb7` | Done |
| 4. Shared pieces | T12 `b6375ec`, T13 `ee289a7` | Done |
| 5. Key resolvers and owner read API | T14 `7b1c697`, T15 `0fbedc0`, T16 `a468f19`, T17 `d3b592f`, T18 `5957853`, T19 `4709cc9` | Done |
| 6. Pilot | T20 `2d02293`, T21 `0c9fa97`, T22 `7b85b02` | Done |
| 7. Inversion | T23 `1909490`, T24 `47138b5`, T25 `9eaa3ad`, T62 `9b32389` | Done; T62 adds a shared helper CA-03 AC7 does not list |
| 8. Consumer ports | T26 `39bab4a`, T27 `78f69e7`, T28 `f6d5617`, T29 `b8e5339`, T30 `53dbe36`, T31 `41033d9` | Done |
| 9. Adapters on own tables | T32 `671f070`, T33 `897003b`, T34 `8942059`, T35 `f05968d`, T36 `8c700d7` | Done |
| 10. services | T37 `44bc81b`, T38 `f866dbe` | Done |
| 11. inventory | T39 `29e63d7`, T40 `4e77a49`, T41 `9d44089` | Done |
| 12. identity | T42 `38c76af`, T43 `799bdf4`, T44 `ae9b89f`, T45 `0bcdacf`, T46 `094d9ca` | Done |
| 13. customers | T47 `581c011`, T48 `0802f21` | Done |
| 14. vehicles | T49 `43d04d2`, T50 `b2aba59` | Done |
| 15. work-orders | T51 `55b1b4e`, T52 `4122a7f`, T53 `2592644`, T54 `f4cda90`, T55 `c8bde6b` | Done |
| 16. Bus removal | T56 `7bd7c20`, T57 `7c5aaab` | Done; the T56 spec carries the gap of finding 2 |
| 17. Documentation | T58 `dc86dce`, T59 `1c02df5`, T60 `ccd3861` | Done |

---

## Spec-anchored acceptance criteria

PASS means the cited assertion targets the outcome the spec defines. "Inspection" marks a structural criterion that no test guards, verified by reading the tree.

### CA-01: the core runs without the framework

| Criterion | Spec-defined outcome | Evidence (`file:line` and assertion) | Result |
| --- | --- | --- | --- |
| AC1: no banned package or `node:*` import under `domain` or `application`, specs included | Zero such imports | `test/architecture/core-purity.spec.ts:197` `expect(scanCore(ROOT, migratedModules)).toEqual([])`, with `:185` proving every module folder is listed; `test/architecture/dependency-rules.spec.ts:147` `expect(stdout).toContain('no dependency violations found')`. A scan of every import specifier in the 18 core folders finds only `vitest` | PASS |
| AC2: no decorator under `application` | Zero decorators | `core-purity.spec.ts:150` (fixture case) and `:197` (real tree); a grep for decorators in `application` and `domain` finds 0 | PASS |
| AC3: no injection token under `domain` or `application` | Zero `Symbol()` | `core-purity.spec.ts:159` and `:197`; the tokens sit in the seven `*.tokens.ts` files next to the composition roots | PASS |
| AC4: every repository contract in its owner's `application/ports` | 10 of 10, no `domain/repositories` folder | Inspection: `src/modules/work-orders/application/ports/work-order.repository.ts:4` `export interface WorkOrderRepository` and the nine others in their module's `application/ports` | PASS (inspection) |
| AC5: every use case built in its module's composition root | 77 of 77 | Inspection: each `<Name>UseCase` has a factory provider calling `new <Name>UseCase(...)` in its module, e.g. `src/modules/work-orders/work-orders.module.ts:100`; the authorizers and identity's application services are built the same way | PASS (inspection) |
| AC6: `REFRESH_TOKEN_TTL_SECONDS=600` gives `refreshTokenExpiresAt` 600 s after login | Exactly 600 000 ms | `test/e2e/authentication.e2e.spec.ts:391` `expect(new Date(body.refreshTokenExpiresAt).getTime() - loggedInAt).toBe(600 * 1000)` | PASS |
| AC7: a reused refresh token logs the warn line under `AuthenticationSecurity` | The exact message and context | `src/modules/identity/authentication/infrastructure/logging/security-events.subscriber.spec.ts:29` `toHaveBeenCalledWith('Refresh token reuse detected for session ${SESSION_ID}; the session was revoked.')`, `:32` context; `src/modules/identity/identity.module.spec.ts:68` (the root subscribes it); `refresh-session.use-case.spec.ts:166` (the use case publishes the event) | PASS |

### CA-02: every route answers exactly as before

| Criterion | Spec-defined outcome | Evidence (`file:line` and assertion) | Result |
| --- | --- | --- | --- |
| AC1: OpenAPI document identical to the baseline | Canonical equality | `test/e2e/openapi-contract.e2e.spec.ts:44` `expect(canonical(buildOpenApiDocument(testApp.app))).toBe(canonical(baseline))`. Independently, the document generated from the `51a3a8a` code equals `test/contract/openapi.baseline.json` with sorted keys (73 operations, 59 schemas); the baseline has one commit, `709eb27` | PASS |
| AC2: every pre-existing e2e test passes with no assertion changed | 0 assertions changed | `git diff 51a3a8a..943018a -- test/e2e/` removes three lines from the 16 pre-existing files: one import (`authentication.e2e.spec.ts:7`) and two comments. 244 of 244 e2e pass; 203 of 203 pass at `51a3a8a` | PASS |
| AC3: each route has an e2e test written before its flow moved | 73 of 73 operations | A scan of the 73 OpenAPI operations against the e2e calls finds 9 uncovered at `51a3a8a` (roles, permissions, user access) and 0 at `61984b9`, the end of phase 1; `test/e2e/roles.e2e.spec.ts`, `test/e2e/user-access.e2e.spec.ts` | PASS |
| AC4: a query use case raises its module's not-found | 11 use cases throw | `rejects.toThrow(<Module>NotFoundError)` at `get-work-order.use-case.spec.ts:36`, `get-my-work-order.use-case.spec.ts:66`, `get-work-order-trail.use-case.spec.ts:60`, `get-service.use-case.spec.ts:49`, `get-inventory-item.use-case.spec.ts:54`, `get-item-movement-history.use-case.spec.ts:86`, `get-vehicle.use-case.spec.ts:41`, `get-customer.use-case.spec.ts:52`, `get-customer-by-user-id.use-case.spec.ts:44`, `get-user-by-id.use-case.spec.ts:63`, `get-role.use-case.spec.ts:29`. No controller throws a not-found any more | PASS |
| AC5: a failure in the second module rolls back the first | Neither write persists | `test/integration/cross-module-transaction.spec.ts:178` `expect(finalWorkOrder?.assignedMechanicUserId).toBeNull()`, `:179`; `test/e2e/work-order-withdrawals.e2e.spec.ts:609` `expect(reread.partItems.map((item) => item.withdrawnQuantity)).toEqual([0, 0])` after inventory refuses | PASS |
| AC6: a throwing subscriber leaves the result with the caller and is logged with its name | `publish` never throws; the line names the class | `src/shared/infrastructure/events/in-memory-domain-event-dispatcher.spec.ts:105` `expect(() => dispatcher.publish(...)).not.toThrow()`, `:109` `'"ThrowingSubscriber" has thrown an unhandled exception.'`, `:124` and `:129` for a rejected promise, `:112` context `EventBus`. Use cases call `publish` and then return, so the guarantee sits in the dispatcher; no test runs a use case with a throwing subscriber | PASS |

### CA-03: modules meet only through ports and public APIs

| Criterion | Spec-defined outcome | Evidence (`file:line` and assertion) | Result |
| --- | --- | --- | --- |
| AC1: no cycle between modules | 0 cycles | `test/architecture/module-cycles.spec.ts:89` `expect(outcomes.get('real tree')?.exitCode).toBe(0)`; lint prints "No dependency cycle between modules found (7 modules, 16 dependencies between them)" | PASS |
| AC2: no core import into another module | 0 imports | `dependency-rules.spec.ts:147` (real tree, `core-stays-in-module`), `test/architecture/baselines.spec.ts:15` `expect(listIn('.dependency-cruiser-known-violations.json')).toEqual([])`; an independent resolution of every relative import in the core folders finds 0 | PASS |
| AC3: outer layers import another module only through its `index.ts` | 0 imports | `dependency-rules.spec.ts:94` (fixture) and `:147` (real tree); an independent resolution finds 0; acceptance checks A3 and A3b fail lint naming the file | PASS (sensor gap: M07) |
| AC4: a cross-module need goes through a port of the consumer, implemented in its infrastructure | 8 ports, 8 gateways | Ports in `work-orders/application/ports` (6), `customers` (1) and `vehicles` (1); gateways in each consumer's `infrastructure/gateways`; e.g. `customer-directory.gateway.spec.ts:70` `expect(await directory.findById(CUSTOMER_ID)).toBeNull()` for the provider's not-found | PASS |
| AC5: identity under `src/modules/identity`, one Nest module | One module | `src/modules/identity/identity.module.ts:113` `@Module`; no `modules/users`, `modules/authentication` or `modules/authorization` path in `src`, `test`, `scripts` or `security` | PASS |
| AC6: no bus reference in `src`, `test`, `scripts`; no `@nestjs/cqrs` in `package.json` | 0 matches | `grep -rnE "CommandBus\|QueryBus\|@nestjs/cqrs" src test scripts` finds 0; `package.json` has no `@nestjs/cqrs` | PASS |
| AC7: `src/shared` gains only the publisher port, the dispatcher, their specs and `shared.tokens.ts` | Only those | The diff adds those files, and T62 also adds `runInNewTransaction` to `src/shared/infrastructure/database/typeorm-transaction-runner.ts:29`, which the criterion does not list and nobody amended | GAP (minor) |
| AC8: an adapter writes only its module's tables | 0 findings | The table check reads `INTO` and `UPDATE`: `test/architecture/table-ownership.spec.ts:73` (real tree), `baselines.spec.ts:19` `expect(listIn('scripts/architecture/known-table-findings.json')).toEqual([])` | PASS |
| AC9: no adapter reads another module's table | 0 findings | Same evidence; lint prints "No table ownership violations found (0 known findings ignored)"; acceptance check A4 | PASS |
| AC10: key translation goes through the owner's resolver | The nine adapters | e.g. `src/modules/work-orders/infrastructure/persistence/typeorm-work-order-query.adapter.ts:226` calls the five resolvers; `test/integration/work-order-query.adapter.spec.ts:510` asserts one `toExternalIds` call per owner; M16 killed | PASS |
| AC11: another module's data comes in batch through its public API | One batch call per owner | `test/integration/customer-query.adapter.spec.ts:291` `expect(calls).toEqual(['toExternalIds', 'findUsers'])`; `work-order-query.adapter.spec.ts:510`; M11 killed | PASS |
| AC12: the consumer declares, the owner implements, the root binds | `WorkOrderReads` | `src/modules/inventory/infrastructure/work-order-reads.ts`, `src/modules/work-orders/infrastructure/persistence/typeorm-work-order-reads.ts`, `src/modules/work-orders/work-order-reads.module.ts` imported by `src/app.module.ts`; `test/integration/work-order-reads.spec.ts`; M13 killed | PASS |
| AC13: a resolver inside a transaction sees rows written earlier in it | Resolved inside, gone after rollback | `test/integration/user-key-resolver.spec.ts:125`, `customer-key-resolver.spec.ts:133`, `vehicle-key-resolver.spec.ts:141`, `service-key-resolver.spec.ts:121`, `inventory-item-key-resolver.spec.ts:119`, `work-order-reads.spec.ts:177`; M03 killed | PASS |

### CA-04: the build enforces the architecture

| Criterion | Spec-defined outcome | Evidence (`file:line` and assertion) | Result |
| --- | --- | --- | --- |
| AC1: a banned import in the core fails lint, naming file and rule | Non-zero exit | Acceptance A1 (the spec's Independent Test): `src/modules/services/application/throwaway.ts` importing `@nestjs/common` makes `npm run lint` exit 1 with "'@nestjs/common' import is restricted ... no-restricted-imports" on that file; `dependency-rules.spec.ts:137` to `:139` | PASS |
| AC2: a module cycle fails lint, naming the files | Non-zero exit, both steps named | Acceptance A2: a type import of `customers` from identity's infrastructure, which closes no file cycle, makes lint exit 1 with "Dependency cycle between modules: customers -> identity -> customers" and the importing file of each step; `module-cycles.spec.ts:60`; M09 killed | PASS |
| AC3: an import outside `index.ts` fails lint, naming the importing file | Non-zero exit | Acceptance A3 (deep import) and A3b (`customers.tokens.ts`): exit 1, "error through-public-api: src/modules/vehicles/infrastructure/deep-probe.ts"; `dependency-rules.spec.ts:94` | PASS (sensor gap: M07) |
| AC4: a foreign table fails lint, naming adapter and table | Non-zero exit | Acceptance A4: exit 1, "src/modules/vehicles/infrastructure/persistence/foreign-probe.ts: queries customers, a table owned by customers"; `table-ownership.spec.ts:51`; M08 killed | PASS |
| AC5: empty known-violations baseline | Both lists `[]` | `test/architecture/baselines.spec.ts:15` and `:19` | PASS |
| AC6: the pre-push hook runs these checks through `npm run lint` | Hook calls lint | `.husky/pre-push:6` `npm run lint` | PASS |

### CA-05: use case tests exercise real collaborators

| Criterion | Spec-defined outcome | Evidence (`file:line` and assertion) | Result |
| --- | --- | --- | --- |
| AC1: no `stubCommandBus`, `stubQueryBus` or `stubEventBus` | 0 matches | grep finds 0; `test/support/fakes/bus.stubs.ts` deleted in `7c5aaab` | PASS |
| AC2: each use case calling another module is tested through fakes in `test/support/fakes` | 17 of 17 classes | e.g. `create-work-order.use-case.spec.ts` (`FakeCustomerDirectory`, `FakeVehicleDirectory`), `cancel-work-order.use-case.spec.ts` (`FakeStockLedger`, `FakeWorkOrderActors`), `register-customer.use-case.spec.ts` (`FakeCustomerAccounts`); no `vi.fn` stands in for a cross-module port | PASS |
| AC3: collaborations asserted through the fake's state | No `toHaveBeenCalled` on a cross-module port | `cancel-work-order.use-case.spec.ts:136` `expect(stockLedger.writtenOff).toEqual([...])`, `register-customer.use-case.spec.ts:100` `expect(accounts.opened).toMatchObject([...])`; the 13 use case specs that use `toHaveBeenCalled` all target their own module's query port | PASS |
| AC4: every coverage threshold keeps its percentage and follows the moved code | Same percentages, moved globs | The `vitest.config.ts` diff renames three globs to `src/modules/identity/...` and changes no percentage; each glob matches files; `npm run test:coverage` exits 0 | PASS |

### CA-06: a second entry point reuses the use cases

| Criterion | Spec-defined outcome | Evidence (`file:line` and assertion) | Result |
| --- | --- | --- | --- |
| AC1: `npm run seed` creates services, items, opening stock, customers and vehicles through the five use cases from the composition root | The five use cases; the records exist | `scripts/seed.ts:170` to `:174` `context.get(CreateServiceUseCase)` and the four others; `test/integration/seed.script.spec.ts` asserts each record. Acceptance: `npm run seed` on an empty, migrated database exits 0, and the API returns 4 services, 5 items at their opening quantity with one INBOUND "Opening stock" movement, the customer with address and phone, and 2 vehicles | PASS on an empty database (sensor gap: the spec cannot fail on `workshop_test`) |

### CA-07: the decisions are recorded

| Criterion | Spec-defined outcome | Evidence (`file:line` and assertion) | Result |
| --- | --- | --- | --- |
| AC1: each decision of the feature as an `AD-NNN` and an ADR naming each other | Every decision in both places | AD-011 to AD-016 name ADR 0026 to 0031 (`.specs/STATE.md:98`, `:107`, `:116`, `:125`, `:134`, `:143`), and each ADR names its AD (`docs/adr/0026-use-cases-are-plain-classes.md:4` "Source: AD-011", same line in 0027 to 0031). T62 refined AD-008 (`.specs/STATE.md:70`), and no ADR records the refinement: `docs/adr/0023-repositories-honour-an-ambient-transaction.md:22` still states the decision without it | GAP (minor) |
| AC2: an ADR justifies the four kept patterns | ADR 0031 | `docs/adr/0031-patterns-kept-beyond-the-dependency-rule.md:17` to `:37` | PASS |
| AC3: an ADR keeps route permissions in the guard and has each entry point check its caller | ADR 0030 | `docs/adr/0030-route-permissions-stay-in-the-http-guard.md:21` to `:27` | PASS |
| AC4: ADR 0008 and AD-003 superseded | Both marked | `docs/adr/0008-cross-context-calls-through-the-buses.md:3` "Superseded by [0027]"; `.specs/STATE.md:30` "superseded by AD-012" | PASS |
| AC5: an ADR justifies own tables with the three reasons | ADR 0028 | `docs/adr/0028-each-module-queries-only-its-own-tables.md:49` to `:61` | PASS |
| AC6: an ADR records the inversion and the cycle it avoids | ADR 0027 | `docs/adr/0027-ports-between-modules.md:18` to `:40` | PASS |

### CA-08: use cases carry the use case name

| Criterion | Spec-defined outcome | Evidence (`file:line` and assertion) | Result |
| --- | --- | --- | --- |
| AC1: every class under `application/commands` and `application/queries` is `<Name>UseCase` in `<name>.use-case.ts` | Only those names | The folders hold `.use-case.ts` (77), `.use-case.spec.ts` (74), `.command.ts` (48) and `.query.ts` (29) files and nothing else; no `*Handler` class or file is left in `src` | PASS |
| AC2: each use case spec sits beside it as `<name>.use-case.spec.ts` | 74 of 74 specs | Every use case spec has that name. The three use cases without a spec (`list-inventory-items`, `list-work-orders`, `list-user-sessions`) had none at `51a3a8a` | PASS |

### CA-09: the documentation matches the structure

| Criterion | Spec-defined outcome | Evidence (`file:line` and assertion) | Result |
| --- | --- | --- | --- |
| AC1: `README.md` shows the circles with their folders and the module graph | Both diagrams | `README.md:139` (circles, each labeled with its folder) and `README.md:196` (16 arrows, the count the module cycle check reports) | PASS |
| AC2: no bus name, `*Handler` class or old identity path in `README.md` or `docs/architecture/` | 0 matches | `grep -rnE "CommandBus\|QueryBus\|@nestjs/cqrs\|Handler\b\|modules/(users\|authentication\|authorization)" README.md docs/architecture` finds 0 | PASS |

Status: 45 of 47 criteria match the spec-defined outcome. The 2 gaps (CA-03 AC7, CA-07 AC1) are minor. There is no spec-precision gap: every criterion defines an outcome a check can target.

---

## Edge cases

| Edge case | Spec outcome | Evidence | Result |
| --- | --- | --- | --- |
| `GET /work-orders/:number` unknown | 404 `WORK_ORDER_NOT_FOUND` | `test/e2e/work-order-tracking.e2e.spec.ts:348` `.expect(404)`, `:350` `toMatchObject({ code: 'WORK_ORDER_NOT_FOUND' })`; unit `get-work-order.use-case.spec.ts:36` | PASS |
| `GET /work-orders/me/:number` of another customer | 404 `WORK_ORDER_NOT_FOUND` | `work-order-tracking.e2e.spec.ts:362`, `:364`; unit `get-my-work-order.use-case.spec.ts:66` | PASS |
| `GET /services/:externalId` unknown | 404 `SERVICE_NOT_FOUND` | `test/e2e/services.e2e.spec.ts:226`; unit `get-service.use-case.spec.ts:49` | PASS |
| `GET /inventory-items/:externalId` unknown | 404 `INVENTORY_ITEM_NOT_FOUND` | `test/e2e/inventory-items.e2e.spec.ts:223`; unit `get-inventory-item.use-case.spec.ts:54` | PASS |
| `GET /inventory-items/:externalId/movements` unknown | 404 `INVENTORY_ITEM_NOT_FOUND` | `inventory-items.e2e.spec.ts:232`; unit `get-item-movement-history.use-case.spec.ts:86`; M01 killed | PASS |
| `GET /vehicles/:externalId` unknown | 404 `VEHICLE_NOT_FOUND` | `test/e2e/vehicles.e2e.spec.ts:322`; unit `get-vehicle.use-case.spec.ts:41` | PASS |
| `GET /customers/:externalId` unknown | 404 `CUSTOMER_NOT_FOUND` | `test/e2e/customers.e2e.spec.ts:212`; unit `get-customer.use-case.spec.ts:52` | PASS |
| `GET /customers/me` without a record | 404 `CUSTOMER_NOT_FOUND` | `customers.e2e.spec.ts:223`; unit `get-customer-by-user-id.use-case.spec.ts:44` | PASS |
| `GET /users/:externalId` unknown | 404 `USER_NOT_FOUND` | `test/e2e/users.e2e.spec.ts:183`; unit `get-user-by-id.use-case.spec.ts:63` | PASS |
| `GET /roles/:id` unknown | 404 `ROLE_NOT_FOUND` | `test/e2e/roles.e2e.spec.ts:116`; unit `get-role.use-case.spec.ts:29` | PASS |
| `GET /customers?document=` malformed | 200 with `[]` | `customers.e2e.spec.ts:321` and `:322` `toEqual([])` | PASS |
| `GET /customers?document=` well formed | Only the active customer with that document | `customers.e2e.spec.ts:314` and `:315` (masked too) `toEqual([expected])`; `test/integration/customer-query.adapter.spec.ts:194` (a deactivated customer is left out) | PASS |
| `GET /customers?name=` partial, any case | Active matches, newest first | `customers.e2e.spec.ts:338` `expect(body).toEqual([newer, older])`, the deactivated one absent | PASS |
| `GET /inventory-items/shortages` | Outstanding quantity and the work order numbers | `inventory-items.e2e.spec.ts:539` `toMatchObject({ quantityOnHand: 2, outstandingQuantity: 7 })`, `:591` and `:592` | PASS |
| `DELETE /inventory-items/:externalId` planned on an open work order | 409 `INVENTORY_ITEM_IN_USE` | `inventory-items.e2e.spec.ts:718`, `:719` | PASS |
| Movement history names the work order and the actor | Both UUIDs | `test/e2e/work-order-withdrawals.e2e.spec.ts:579` `{ kind: 'CONSUMPTION', workOrderId: workOrder.id, actorUserId: mechanic.userId }` | PASS |
| Five drawn numbers taken | 409 `WORK_ORDER_NUMBER_TAKEN` | `create-work-order.use-case.spec.ts:235` `rejects.toThrow(WorkOrderNumberTakenError)`, a class with `code = 'WORK_ORDER_NUMBER_TAKEN'` and `ErrorKind.Conflict` (`work-order-number-taken.error.ts:9`); M18 killed. No test sends the case through the route | PASS (unit layer, as tasks.md assigns it) |
| Two concurrent changes | One 409 `CONCURRENT_MODIFICATION` | `test/e2e/work-order-concurrency.e2e.spec.ts:194` `expect(statuses).toEqual([200, 409])`, `:196` | PASS |
| Withdrawal above stock | 422 `INVENTORY_INSUFFICIENT_STOCK`, nothing changed | `work-order-withdrawals.e2e.spec.ts:596`, `:598`, `:599` to `:611` | PASS |
| Shared transaction fails after both writes | Neither persists | `cross-module-transaction.spec.ts:178`, `:179` | PASS |
| `POST /customers` links the user created earlier in the transaction | Linked through identity's resolver | `test/integration/customer.repository.spec.ts:164` `expect(inside).toEqual({ exists: true, linkedTo: user.id.value })`; `user-key-resolver.spec.ts:125`; M03 killed | PASS |
| A subscriber throws | The caller keeps the result; the error is logged with the subscriber's name | `in-memory-domain-event-dispatcher.spec.ts:105`, `:109`; M05 and M06 killed | PASS |

---

## Gate check

The gate is the Build command of `tasks.md`, `npm run lint && npm run build && npm run test:unit && npm run test:integration && npm run test:e2e`, then `npm run test:coverage`, run from the real tree against `workshop_test`.

| Step | Exit | Result |
| --- | --- | --- |
| `npm run lint` | 0 | ESLint clean; "no dependency violations found (755 modules, 3412 dependencies cruised)"; "No table ownership violations found (0 known findings ignored)"; "No dependency cycle between modules found (7 modules, 16 dependencies between them)" |
| `npm run build` | 0 | Clean |
| `npm run test:unit` | 0 | 1114 passed (152 files) |
| `npm run test:integration` | 1 | 340 passed, 2 failed of 342 (44 files): `work-order-metrics-query.adapter.spec.ts:271` and `:348`, "Test timed out in 30000ms" |
| `npm run test:e2e`, run after the failure to report it | 0 | 244 passed (19 files) |
| `npm run test:coverage` | 0 | Every threshold passed |
| Re-run of the metrics spec on `workshop_test` | 1 | 8 passed, 1 timed out (`:271`) |
| Control: lint, unit, integration and e2e at `943018a` on an empty scratch database | 0 | 1114, 342 and 244 passed |

### Why the integration suite fails

`randomDay()` (`test/integration/work-order-metrics-query.adapter.spec.ts:118`) draws a day between 2000 and 2019, and `pickClearDay` (`:142`) loops with no bound until the window it probes holds no completed work order. `workshop_test` is never truncated and now holds 976 completed work orders in that span. A count over all 7305 candidate days found 1 day with a free 30-day window before the re-run and 0 after it, because the re-run used the last one. From now on both 30-day cases loop until their timeout on every run. The helper predates this feature, but the Success Criteria require `npm run test:integration` to pass on the final commit, and `.husky/pre-push` runs that suite whenever Postgres answers, so a push fails too.

### Test counts

Before the feature, at `51a3a8a` on an empty scratch database: unit 955, integration 239, e2e 203, the same totals as the Baseline section of `tasks.md`. After: 1114, 342 and 244 (+159, +103, +41). No test is skipped, focused or marked todo.

### Assertions changed on purpose

Each change keeps the behavior asserted at the right layer. Eight integration expectations moved from `toBeNull()` to the module's not-found error (`customer-read-queries`, `inventory-read-queries`, `service-read-queries`, `vehicle-read-queries`, `work-order-read-queries`), as design C10 moves the not-found into the use case; the route answers stay pinned by the e2e cases T4 and T5 added before the move. `list-customers.use-case.spec.ts` lost the normalization and malformed-document cases because parsing moved to identity, where `find-users.use-case.spec.ts`, `test/integration/customer-query.adapter.spec.ts` and `customers.e2e.spec.ts:321` assert them. The deactivate, settle and write-off specs assert state on fakes in place of call counts (CA-05). No pre-existing e2e assertion changed (CA-02 AC2).

### Acceptance commands from the Independent Test lines

| Command | Result |
| --- | --- |
| `grep -rnE "CommandBus\|QueryBus\|@nestjs/cqrs" src test scripts` | 0 matches; no `@nestjs/cqrs` in `package.json` |
| Stub helper grep over `src`, `test` and `scripts` | 0 matches |
| `application/commands` and `application/queries` listing | Only `.use-case.ts`, `.use-case.spec.ts`, `.command.ts`, `.query.ts` |
| CA-09 grep over `README.md` and `docs/architecture` | 0 matches |
| CA-04 throwaway files A1 to A4 and A3b, each followed by `npm run lint` in the scratch worktree | Exit 1 each time, naming the file and the rule |
| `npm run seed` on an empty migrated scratch database, records read through the API | Exit 0; every demo record returned |
| OpenAPI document generated from `51a3a8a`, compared with the baseline | Equal with sorted keys |
| Route scan of the 73 OpenAPI operations against the e2e calls | 0 uncovered at `61984b9` and at `943018a` |

---

## Discrimination sensor

The depth is the expanded tier (P1, structure-wide). Every mutant ran in a detached `git worktree` of `943018a` under the scratchpad, with `node_modules` symlinked and `.env.test` pointed at `DATABASE_NAME=workshop_mut_test` and `REDIS_DB=13`. The scratch database was recreated before each mutant and migrated by the global setup. Suites ran unit, then integration, then e2e, and the first failure killed the mutant. No mutant touched `workshop_test`.

| # | File:line | Mutation | Result |
| --- | --- | --- | --- |
| M01 | `src/modules/inventory/application/queries/get-item-movement-history/get-item-movement-history.use-case.ts:13` | Use case no longer raises `INVENTORY_ITEM_NOT_FOUND` | KILLED (unit) |
| M02 | `src/modules/vehicles/infrastructure/gateways/vehicle-owners.gateway.ts:30` | Gateway lets `CustomerNotFoundError` through instead of answering `null` | KILLED (unit) |
| M03 | `src/modules/identity/users/infrastructure/persistence/user-key-resolver.ts:50` | Resolver ignores the open transaction | KILLED (integration: resolver, customer repository, own transaction) |
| M04 | `src/shared/infrastructure/database/typeorm-transaction-runner.ts:33` | `runInNewTransaction` stops publishing its manager; the runner still publishes | KILLED (integration: `repository-own-transaction.spec.ts:109`) |
| M05 | `src/shared/infrastructure/events/in-memory-domain-event-dispatcher.ts:48` | Error line prints "InstanceWrapper" | KILLED (unit) |
| M06 | `src/shared/infrastructure/events/in-memory-domain-event-dispatcher.ts:36` | A synchronous subscriber throw reaches the publisher | KILLED (unit) |
| M07 | `.dependency-cruiser.cjs:71` | `through-public-api` accepts any file at a module's root, not only `index.ts` | SURVIVED (1114 unit pass, `npm run lint` exits 0) |
| M08 | `scripts/architecture/check-table-ownership.ts:35` | Table check ignores `JOIN` | KILLED (unit) |
| M09 | `scripts/architecture/check-module-cycles.ts:28` | Module graph leaves out `src/shared` | KILLED (unit) |
| M10 | `test/architecture/core-purity.spec.ts:25` | Purity scan stops flagging `node:*` | KILLED (unit) |
| M11 | `src/modules/work-orders/infrastructure/persistence/typeorm-work-order-query.adapter.ts:242` | Budget deciders left out of the user key batch | KILLED (integration) |
| M12 | `scripts/seed.ts:321` | Seed books no opening stock | KILLED on an empty database (integration: seed spec); SURVIVED on a database holding the demo rows (342 integration and 244 e2e pass) |
| M13 | `src/modules/work-orders/infrastructure/persistence/typeorm-work-order-reads.ts:34` | A canceled work order counts as open | KILLED (integration) |
| M14 | `src/modules/work-orders/infrastructure/gateways/stock-ledger.gateway.ts:37` | `settle` writes the movements off | KILLED (unit) |
| M15 | `src/modules/work-orders/infrastructure/gateways/work-order-actors.gateway.ts:30` | `cancelsInExecution` read from the manage permission | KILLED (unit) |
| M16 | `src/modules/customers/infrastructure/persistence/customer-key-resolver.ts:47` | `toExternalIds` keyed by external id | KILLED (integration, 48 cases) |
| M17 | `src/modules/work-orders/infrastructure/persistence/typeorm-work-order-query.adapter.ts:189` | Trail ordered without the `id` tie-breaker of `6cdf869` | KILLED (integration) |
| M18 | `src/modules/work-orders/application/commands/create-work-order/create-work-order.use-case.ts:18` | Four attempts in place of five | KILLED (unit) |
| M19 | `src/modules/customers/application/queries/get-customer/get-customer.use-case.ts:22` | Get customer refuses a deactivated customer | KILLED (unit) |
| W1 | `src/modules/work-orders/application/commands/remove-work-order-item/remove-work-order-item.use-case.ts:31` | Removal never saved (worker-reported) | SURVIVED (1114, 342 and 244 pass) |
| W2 | `src/modules/work-orders/application/commands/plan-part/plan-part.use-case.ts:33` | Quantity validated after the catalog read (worker-reported) | SURVIVED (1114, 342 and 244 pass) |
| W3a | `src/modules/customers/application/commands/register-customer/register-customer.use-case.ts:34` | Phone never parsed (worker-reported) | KILLED (unit: the malformed phone case) |
| W3c | `src/modules/customers/application/commands/register-customer/register-customer.use-case.ts:49` | Phone validated but not stored | KILLED on an empty database (seed spec only); SURVIVED on a database holding the demo rows |
| W3b | `src/modules/vehicles/application/commands/register-vehicle/register-vehicle.use-case.ts:39` | Vehicle stored with the year before the one given (worker-reported) | KILLED on an empty database (seed spec only); SURVIVED on a database holding the demo rows |

On an empty database, 24 mutants ran: 21 died and 3 survived (M07, W1, W2). On a database holding the demo rows, the state of `workshop_test`, M12, W3b and W3c survive as well. Of the 19 mutants in the feature's own code (M01 to M19), 18 died. The sensor fails on M07 and on the seed spec.

The real tree's `git status --porcelain` was empty before the sensor and empty after it. Both scratch worktrees (`943018a` for the mutants, `51a3a8a` for the baseline counts and the OpenAPI capture) were removed, `workshop_mut_test` was dropped and Redis DB 13 flushed. No `git stash` was used.

### Worker-reported survivors

W1 and W2 are confirmed. Neither falls under an acceptance criterion of this spec: removal and part planning keep their pre-feature logic, and neither calls another module in the way CA-05 covers. The batch 9 report said a customer's phone and a vehicle's year are asserted nowhere. Today only the seed spec asserts them, and only on an empty database, so on `workshop_test` the claim still holds.

---

## Code quality

| Check | Status |
| --- | --- |
| No features beyond what was asked | Pass. T61, T62 and `6cdf869` are recorded additions with their reasons |
| No abstractions for single-use code | Pass. One resolver class per owner, with the duplication design C4 accepted |
| No unnecessary flexibility | Pass |
| Only touched files the tasks required | Pass |
| Did not "improve" unrelated code | Pass |
| Matches existing patterns and style | Pass |
| Tests map to acceptance criteria and are not shallow | Pass with gaps: findings 2 and 3 |
| Spec-anchored outcome check | 45 of 47; gaps CA-03 AC7 and CA-07 AC1 |
| Per-layer coverage expectation | Pass for use cases (fakes), gateways, adapters and routes. The in-memory repositories return the stored instance, so a use case spec cannot see a missing `save` (root of W1) |
| Every test maps to a requirement | Pass |
| Documented guidelines followed | `.specs/STATE.md` Conventions, the Test Coverage Matrix and the `vitest.config.ts` thresholds. The never-truncate convention defeats the seed spec and the metrics fixture |

Two observations need no fix in this feature: `recording-domain-event-publisher.spec.ts` lives in `src/shared/infrastructure/events/` but tests a fake in `test/support/fakes`, and `FindUserByDocumentUseCase` has no caller, as at `51a3a8a`.

---

## Fix plans

### Fix 1 (Blocker): the metrics spec loops forever on a saturated test database

`test/integration/work-order-metrics-query.adapter.spec.ts:118` draws days from a 20-year span, and `:142` redraws with no bound, so the never-truncated `workshop_test`, which has no free 30-day window left in that span, makes two cases time out.

Fix task: draw the day from a span the suite's own history cannot fill, for example years 2100 to 3099, and bound the redraws (for example 200) with an error that names the reason, keeping the never-truncate convention. Done when the spec passes on `workshop_test` as it is today and on an empty database, and the Build gate exits 0.

### Fix 2 (Major): the seed spec cannot fail on the test database

`test/integration/seed.script.spec.ts:79` runs the seed against `workshop_test`, where `scripts/seed.ts:276`, `:304`, `:336` and `:364` find the demo rows of an earlier run and skip every use case call. M12, W3b and W3c pass every suite on such a database.

Fix task: have the spec create its own database (a name ending in `_test`, so the setup guard accepts it), migrate it, point `DATABASE_NAME` at it while `runSeed()` runs twice, assert, then drop it and restore the variable. Also assert the stored phone in the register-customer use case spec and the stored year in the register-vehicle use case spec, so neither depends on the seed. Done when M12, W3b and W3c fail the integration suite on a database that already holds the demo rows.

### Fix 3 (Major): no fixture pins a module root file other than `index.ts`

`test/architecture/fixtures/dependency-rules/through-public-api` imports only `beta/application/run.ts` and `beta/index.ts`, so M07's looser pattern passes.

Fix task: add `beta/beta.tokens.ts` and a file in `alpha/infrastructure` that imports it, and add the expected `through-public-api` line to `test/architecture/dependency-rules.spec.ts:94`. Done when M07 fails the unit suite.

### Fix 4 (Minor): T62's refinement of AD-008 has no ADR

AD-008 in `.specs/STATE.md:70` changed in T62. AD-010 asks for the ADR as well, and ADR 0023 still states the earlier decision.

Fix task: write ADR 0032 for the refinement (a repository's own transaction goes through `runInNewTransaction` and publishes its manager) and have AD-008 name it. Whether ADR 0023's status line changes is the user's call, since the user decided on 2026-10-29 that 0023 stays as written. Done when AD-008 and ADR 0032 name each other.

### Fix 5 (Minor): CA-03 AC7 does not allow `runInNewTransaction`

T62 added an exported function to `src/shared/infrastructure/database/typeorm-transaction-runner.ts:29`. The criterion lists what `src/shared` may gain and was not amended.

Fix task: amend CA-03 AC7 to name `runInNewTransaction`, or record the deviation in `.specs/STATE.md`. Done when the spec and the tree agree.

### Fix 6 (Minor, follow-up outside this spec): W1 and W2

For W1, the in-memory repositories in `test/support/fakes` return the stored instance, and no e2e reads a work order back after `DELETE /work-orders/{number}/items/{itemExternalId}`. For W2, nothing asserts that `PlanPartUseCase` validates the quantity before the catalog read (`plan-part.use-case.ts:33`).

Fix task: make the in-memory repositories store and return copies (or record saves), add an e2e read-back after the item removal, and add a plan-part case with a malformed quantity on an unknown item that expects the quantity error. Done when W1 and W2 die.

---

## Requirement traceability update

Proposed for `spec.md`. The Verifier writes only this report, so the orchestrator applies it.

| Requirement | Previous status | New status |
| --- | --- | --- |
| CA-01 | In Tasks | Verified |
| CA-02 | In Tasks | Verified |
| CA-03 | In Tasks | Needs fix (AC7, Fix 5) |
| CA-04 | In Tasks | Needs fix (test gap M07, Fix 3) |
| CA-05 | In Tasks | Verified |
| CA-06 | In Tasks | Needs fix (seed spec, Fix 2) |
| CA-07 | In Tasks | Needs fix (AC1, Fix 4) |
| CA-08 | In Tasks | Verified |
| CA-09 | In Tasks | Verified |

---

## Summary

| Area | Result |
| --- | --- |
| Overall | Not ready |
| Spec-anchored check | 45 of 47 criteria match, 2 minor gaps, no spec-precision gap; 22 of 22 edge cases covered |
| Sensor | 24 mutants on an empty database: 21 killed, 3 survived (M07, W1, W2); M12, W3b and W3c also survive on a database holding the demo rows |
| Gate | Lint, build, unit (1114), e2e (244) and coverage pass; integration 340 passed and 2 failed on `workshop_test`, 342 of 342 on an empty database |

The core imports no framework, carries no decorator or token, and every use case is wired in its composition root. Modules meet through consumer ports and `index.ts`, with no cycle and no foreign table. The OpenAPI document equals the one generated from `51a3a8a`, and every pre-existing e2e test passes unchanged. `npm run lint` refused each forbidden import, cycle and foreign table it was shown, and the seed ran the five use cases on an empty database.

Next: Fixes 1 to 5 as fix tasks, then re-verify. Fix 6 is a follow-up outside this spec.

---

## Lessons

`lessons.py` recorded six candidates from this report: L-017 (gate failure, Fix 1), L-018 (seed spec, Fix 2), L-019 (M07, Fix 3), L-020 (W1), L-021 (W2) and L-022 (CA-07 AC1, Fix 4). The CA-03 AC7 gap produced no lesson: keeping a criterion's text in step with a fix task is a rule about running the workflow, which the lessons layer leaves out.
