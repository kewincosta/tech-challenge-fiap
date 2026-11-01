# Clean architecture validation

## Round 3

**Date**: 2026-10-31
**Spec**: `.specs/features/clean-architecture/spec.md`
**Diff range**: `51a3a8a..f65d7f9` (104 commits). Since round 2 (`832bbb6`): the round 2 report `23a61db`, the plan and spec amendments `bd54c40`, phase 20 (T76 `4f87c4a`, T77 `b37d06a`, T78 `395d45e`) and the record `f65d7f9`.
**Verifier**: independent sub-agent (author is not the verifier), round 3 of at most 3
**Verdict**: FAIL

### Verdict

FAIL. Phase 20 closes the three gaps of round 2. Round 2's probe now ends with the returned units on the shelf and a write-off of the one unit that stayed outstanding, S22 dies in both new settlement cases, and the spec names the T68 migration, the two CA-10 exceptions and ten requirements. Every gate passes on `workshop_test`, the concurrency file passes 5 of 5 isolated runs, and all 17 mutants die, S22 among them.

One finding blocks the verdict. This is the last round, so it goes to the user:

1. A return's restore can draw its units from the consumption of a withdrawal that has not reached the work order. When that withdrawal is undone afterwards, the undo returns only what the restore left, and the return's units are lost while every step ends `DONE` and nothing is logged. Through the real use cases on HEAD, the work order shows 1 unit outstanding and the shelf holds 17 where 19 was due. In the same order on the adapters, inventory counts 3 units outstanding on the work order, and a cancellation that follows writes off 3 units where 1 was outstanding, the symptom of round 2's finding 1. Two orders reach it: a return and a withdrawal that race with no failure (B2), and a restore that failed followed by a withdrawal that stalls after consuming (B3). With a cancellation saved while the restore waits (B5), the new edge case at `spec.md:283` fails as written: the restore applies first, yet the shelf ends at 7 where 9 was due and the write-off records 3 units lost where 1 was outstanding. T76's order rule cannot prevent it, because a withdrawal's consumption is no outbox step, and when the withdrawal's undo is the newer step the rule applies the restore first. In one order with two inventory failures (B4), the claim before T76 ends with the shelf right, and T76's claim ends 2 units short. In 30 races over HTTP the interleave of B2 never occurred. The finding breaks CA-02 AC5 ("so that no operation stays half applied") and the edge case at `spec.md:283`. No test runs a return beside a withdrawal in flight.

---

### Round 2's gaps

| Round 2 gap | Check at HEAD | Status |
| --- | --- | --- |
| 1. A retried restore could never apply after a later write-off or settlement of its work order | Round 2's probe re-run on HEAD in four forms: a write-off or a settlement, each with the processor's own `applyDue()` and with a drain by operation ids. The restore fails once, the closing step is recorded and attempted at once, then the processor runs past the wait twice. The closing request claims nothing (`PENDING`, 0 attempts); the first run applies the restore (stock 9); the second applies the closing step. End state in all four: both steps `DONE`, stock 9 of 10, ledger `CONSUMPTION 3 WRITTEN_OFF` (or `SETTLED`) and `RETURN 2`, transition `WRITTEN_OFF` with quantity 1 (or `SETTLED`). Regression cases: `test/integration/stock-step-retries.spec.ts:392` to `:459` | Closed |
| 2. S22 survived | `test/integration/stock-operation-steps.spec.ts:516` to `:534` (a second settlement after the first) and `:537` to `:566` (two settlements interleaved, the second waiting at the row locks). S22 re-run: killed by both cases | Closed |
| 3. Spec text behind the approved scope | CA-03 AC7 names the T68 migration (`spec.md:131`); the Out of Scope rows name the operation id on stock movements, the two step tables and that column (`spec.md:27`, `:28`); the count reads 10 (`spec.md:310`); CA-10 AC10 (`spec.md:224`), the concurrency row of the sweep (`spec.md:71`) and the edge case at `spec.md:283` state the order of the steps. `git diff 51a3a8a..HEAD -- src/shared` adds only what AC7 lists | Closed |

---

### Task completion

All 387 Done-when boxes of `tasks.md` are checked and none is open. The six commits since round 2 pass `check_commit.py` and carry no trailer.

| Phase | Tasks and commits | Status |
| --- | --- | --- |
| 1 to 19 | As rounds 1 and 2 report them | Done |
| 20. Fixes from the second validation | T76 `4f87c4a`, T77 `b37d06a`, T78 `395d45e` | Done; finding 1 sits beside T76's rule |

---

### Spec-anchored acceptance criteria

PASS means the cited assertion targets the outcome the spec defines. CA-02 AC5, CA-10 AC5, AC6 and AC10, and every criterion phase 20 touched were derived again from the spec. For the others, round 2's evidence was re-read at HEAD, and a line that moved is given at its HEAD position. "Inspection" marks a structural criterion verified by reading the tree.

#### CA-01: the core runs without the framework

| Criterion | Spec-defined outcome | Evidence at HEAD (`file:line` and assertion) | Status |
| --- | --- | --- | --- |
| AC1: no banned import under `domain` or `application` | Zero | `test/architecture/core-purity.spec.ts:197` `expect(scanCore(ROOT, migratedModules)).toEqual([])`; lint "no dependency violations found (791 modules, 3622 dependencies cruised)"; a grep of every core folder for the banned packages and `node:` finds 0 | PASS |
| AC2: no decorator under `application` | Zero | `core-purity.spec.ts:150` and `:197`; a grep for decorators under every `application` folder finds 0 | PASS |
| AC3: no injection token in the core | Zero | `core-purity.spec.ts:159` and `:197`; a grep for `Symbol(` in the core finds 0 | PASS |
| AC4: repository contracts in the owner's `application/ports` | All of them | Inspection: `src/modules/work-orders/application/ports/pending-stock-steps.port.ts:33`, `src/modules/customers/application/ports/pending-account-steps.port.ts:26` and the ten repository contracts round 1 lists | PASS (inspection) |
| AC5: every use case built in its composition root | All of them | Inspection: `src/modules/inventory/inventory.module.ts:157`, `src/modules/identity/identity.module.ts:175`, `src/modules/work-orders/work-orders.module.ts:237` and `:446`, `src/modules/customers/customers.module.ts:62` and `:131` | PASS (inspection) |
| AC6: refresh token TTL of 600 | Exactly 600 000 ms | `test/e2e/authentication.e2e.spec.ts:391` `.toBe(600 * 1000)` | PASS |
| AC7: reuse warning line | Exact message and context | `security-events.subscriber.spec.ts:29` and `:32` (`context: 'AuthenticationSecurity'`), `identity.module.spec.ts:68`, `refresh-session.use-case.spec.ts:166` | PASS |

#### CA-02: every route answers exactly as before

| Criterion | Spec-defined outcome | Evidence at HEAD | Status |
| --- | --- | --- | --- |
| AC1: OpenAPI document equals the baseline | Canonical equality | `test/e2e/openapi-contract.e2e.spec.ts:44` `expect(canonical(buildOpenApiDocument(testApp.app))).toBe(canonical(baseline))`, green at HEAD; the baseline has one commit, `709eb27` | PASS |
| AC2: pre-existing e2e tests pass with no changed assertion except the approved race case | One changed assertion, in that case | `git diff 51a3a8a..HEAD` over the 16 e2e files of `51a3a8a` removes five lines: the one `expect` of the approved case, now `test/e2e/work-order-concurrency.e2e.spec.ts:332` `expect(outstanding.every((units) => units === 0)).toBe(true)` and `:333` `.quantityOnHand).toBe(20)`; one import; two comments; and the bare `await close();` of that file's `afterAll`, which T76 wraps in the drain of its work orders. No other `expect` changed. 246 of 246 pass | PASS |
| AC3: every route has an e2e test written before its flow moved | 73 of 73 | The OpenAPI document is unchanged, so no route was added; round 1's scan holds | PASS |
| AC4: a query use case raises its module's not-found | 11 use cases | The 11 specs round 1 cites are unchanged since `943018a` | PASS |
| AC5 (amended): a later step that fails is compensated or retried so that no operation stays half applied | Nothing half applied | Round 2's probe now passes (see Round 2's gaps). Covered paths: `test/integration/withdrawal-compensation.spec.ts:388` `rejects.toBe(saveFailure)`, `:390` `toBe(SHELF)`, `:392`; `test/integration/registration-compensation.spec.ts:247`, `:249` `userCount(registered)).toBe(0)`; `test/integration/stock-step-retries.spec.ts:330` to `:351` and `:392` to `:459`. Failing: probes B2, B3 and B5 leave a return applied on the work order and lost in inventory, with every step `DONE` | GAP (finding 1) |
| AC6: a throwing subscriber leaves the result and is logged by name | `publish` never throws; the class is named | `in-memory-domain-event-dispatcher.spec.ts:105`, `:109`, `:112`, `:124`, `:129` | PASS |

#### CA-03: modules meet only through ports and public APIs

| Criterion | Spec-defined outcome | Evidence at HEAD | Status |
| --- | --- | --- | --- |
| AC1: no module cycle | 0 | `test/architecture/module-cycles.spec.ts:89`; lint "No dependency cycle between modules found (7 modules, 16 dependencies between them)." | PASS |
| AC2: no core import into another module | 0 | `test/architecture/dependency-rules.spec.ts:158` `expect(stdout).toContain('no dependency violations found')`, `test/architecture/baselines.spec.ts:15` | PASS |
| AC3: outer layers reach another module only through its `index.ts` | 0 | `dependency-rules.spec.ts:95` and `:102` to `:110`; acceptance A3 and A3b at HEAD (CA-04) | PASS |
| AC4: a cross-module need goes through a consumer port | Port in the consumer, gateway in its infrastructure | `stock-ledger.gateway.spec.ts:57` to `:113` `toStrictEqual` per call; `customer-accounts.gateway.spec.ts:185` `toEqual([new DiscardOpenedAccountCommand(NEW_USER_ID)])`; `customer-directory.gateway.spec.ts:72` `toBeNull()` | PASS |
| AC5: identity is one module | One Nest module | `src/modules/identity/identity.module.ts:114` `@Module` | PASS |
| AC6: no bus reference, no `@nestjs/cqrs` dependency | 0 | `grep -rnE "CommandBus\|QueryBus\|@nestjs/cqrs" src test scripts` finds 0; `package.json` has none | PASS |
| AC7 (amended twice): `src/shared` gains only the listed pieces | Only those | `git diff --name-status 51a3a8a..HEAD -- src/shared` adds the publisher port, the dispatcher and its spec, the publisher spec, `shared.tokens.ts`, `runInNewTransaction` (`src/shared/infrastructure/database/typeorm-transaction-runner.ts:30`) and `src/shared/infrastructure/database/migrations/1787702400009-add-cross-module-steps.ts`; the four modified files lose the moved tokens and wire the dispatcher | PASS |
| AC8: an adapter writes only its own tables | 0 findings | `scripts/architecture/table-owners.ts:27` and `:28`; `test/architecture/table-ownership.spec.ts:73`; `baselines.spec.ts:19`; lint "No table ownership violations found (0 known findings ignored)." | PASS |
| AC9: no adapter reads another module's table | 0 findings | Same evidence. T76's subquery reads `work_order_stock_steps`, the module's own table (`src/modules/work-orders/infrastructure/persistence/typeorm-pending-stock-steps.ts:41`), and the claim still joins only `work_orders` (`:52`) | PASS |
| AC10: translation between UUID and internal id through the owner's resolver | The resolvers | `typeorm-work-order-query.adapter.ts:232` to `:248`; `test/integration/work-order-query.adapter.spec.ts:510`; `typeorm-inventory-item.repository.ts:157` | PASS |
| AC11: another module's data in batch through its API | One call per owner | `test/integration/customer-query.adapter.spec.ts:291` `toEqual(['toExternalIds', 'findUsers'])` | PASS |
| AC12: consumer declares, owner implements, root binds | `WorkOrderReads` | Unchanged since round 1; `test/integration/work-order-reads.spec.ts` green | PASS |
| AC13: a resolver sees rows written earlier in its transaction | Resolved inside | `user-key-resolver.spec.ts:125`, `customer-key-resolver.spec.ts:133`, `vehicle-key-resolver.spec.ts:141`, `service-key-resolver.spec.ts:121`, `inventory-item-key-resolver.spec.ts:119`, `work-order-reads.spec.ts:177`, `customer.repository.spec.ts:164` | PASS |

#### CA-04: the build enforces the architecture

Each acceptance check ran at HEAD in the scratch worktree: one throwaway file, then `npm run lint`, then the file removed.

| Criterion | Spec-defined outcome | Evidence at HEAD | Status |
| --- | --- | --- | --- |
| AC1: banned import fails lint, naming file and rule | Non-zero | A1: `src/modules/services/application/throwaway.ts` importing `@nestjs/common`, exit 1, "'@nestjs/common' import is restricted from being used by a pattern" with `no-restricted-imports` on that file; `test/architecture/dependency-rules.spec.ts:137` | PASS |
| AC2: module cycle fails lint, naming the files | Non-zero, files named | A2: a type import of `customers` from `src/modules/identity/users/infrastructure/cycle-probe.ts`, exit 1, "Dependency cycle between modules: customers -> identity -> customers", then the importing file of each step; `test/architecture/module-cycles.spec.ts:36` and `:48` | PASS |
| AC3: import outside `index.ts` fails lint, naming the file | Non-zero | A3 (`deep-probe.ts` importing a `customers` domain error) and A3b (`tokens-probe.ts` importing `customers.tokens.ts`), exit 1, "error through-public-api: src/modules/vehicles/infrastructure/tokens-probe.ts" and the target; `dependency-rules.spec.ts:95` and `:102` | PASS |
| AC4: foreign table fails lint, naming adapter and table | Non-zero | A4: exit 1, "src/modules/vehicles/infrastructure/persistence/foreign-probe.ts: queries customers, a table owned by customers"; `test/architecture/table-ownership.spec.ts:51` | PASS |
| AC5: empty baselines | Both `[]` | `test/architecture/baselines.spec.ts:15` and `:19` | PASS |
| AC6: pre-push runs lint | Hook calls lint | `.husky/pre-push:6` `npm run lint` | PASS |

#### CA-05: use case tests exercise real collaborators

| Criterion | Spec-defined outcome | Evidence at HEAD | Status |
| --- | --- | --- | --- |
| AC1: no bus stub helpers | 0 | A grep over `src`, `test` and `scripts` finds 0 | PASS |
| AC2: cross-module use cases tested through fakes in `test/support/fakes` | All of them | Unchanged since round 2: withdraw, return, deliver and cancel run on `FakeStockLedger` and `FakePendingStockSteps`, registration on `FakeCustomerAccounts` and `FakePendingAccountSteps`. Phase 20 changed no use case spec and no fake | PASS |
| AC3: collaborations asserted on fake state | No `toHaveBeenCalled` on a cross-module port | e.g. `withdraw-parts.use-case.spec.ts:199` `expect(stockLedger.consumed).toEqual([...])`, `register-customer.use-case.spec.ts:302` `expect(accounts.discarded).toEqual([CHOSEN_USER_ID])` | PASS |
| AC4: thresholds keep their percentages | Same percentages | `vitest.config.ts` is unchanged since round 1 (three globs moved, no percentage changed); `npm run test:coverage` exits 0 with no threshold message | PASS |

#### CA-06: a second entry point reuses the use cases

| Criterion | Spec-defined outcome | Evidence at HEAD | Status |
| --- | --- | --- | --- |
| AC1: the seed calls the five use cases | The five use cases; the records exist | `scripts/seed.ts:170` to `:174`; `test/integration/seed.script.spec.ts:81` names a database of its own, `:109` to `:115` create, migrate and seed it twice, `:124` drops it; `register-vehicle.use-case.spec.ts:59` `toBe(2018)`, `register-customer.use-case.spec.ts:161` `toBe('11987654321')` | PASS |

#### CA-07: the decisions are recorded

| Criterion | Spec-defined outcome | Evidence at HEAD | Status |
| --- | --- | --- | --- |
| AC1: each decision as an AD and an ADR naming each other | Both places | AD-011 to AD-016 and ADRs 0026 to 0031 as in round 1; AD-008 and ADR 0032 (`.specs/STATE.md:70`, `docs/adr/0032-a-repository-own-transaction-is-the-ambient-one.md:4`); AD-017 and ADR 0033 (`.specs/STATE.md:154`, `docs/adr/0033-writes-across-modules-run-as-steps.md:5`). T78 states the order rule in ADR 0033's decision (`:28`) and consequences (`:46`), and the registration's operator case (`:54`) | PASS |
| AC2: ADR for the four kept patterns | ADR 0031 | Unchanged | PASS |
| AC3: ADR for permissions in the guard | ADR 0030 | Unchanged | PASS |
| AC4: ADR 0008 and AD-003 superseded | Both marked | `docs/adr/0008-cross-context-calls-through-the-buses.md:3`; `.specs/STATE.md:30` | PASS |
| AC5: ADR for own tables with three reasons | ADR 0028 | Unchanged | PASS |
| AC6: ADR for the inversion | ADR 0027 | Body unchanged; status `Amended by 0033` (`docs/adr/0027-ports-between-modules.md:3`) | PASS |

The statuses match the user's decisions: 0001 `Amended by 0026 and 0033`, 0008 `Superseded by 0027`, 0023 `Superseded by 0033`, 0027 `Amended by 0033`, 0032 `Accepted`. `git diff 51a3a8a..HEAD` changes only the status line of 0001, 0008 and 0023, and `git diff 61984b9..HEAD` only the status line of 0027. Phase 20 changed no ADR but 0033, which is this feature's own.

#### CA-08: use cases carry the use case name

| Criterion | Spec-defined outcome | Evidence at HEAD | Status |
| --- | --- | --- | --- |
| AC1: `<Name>UseCase` in `<name>.use-case.ts` | Only those names | The `commands` and `queries` folders hold 234 files: 79 `.use-case.ts`, 76 `.use-case.spec.ts`, 50 `.command.ts` and 29 `.query.ts`; no `*Handler` class in `src` | PASS |
| AC2: spec beside each use case | Named `<name>.use-case.spec.ts` | As round 2; phase 20 added no use case | PASS |

#### CA-09: the documentation matches the structure

| Criterion | Spec-defined outcome | Evidence at HEAD | Status |
| --- | --- | --- | --- |
| AC1: README circles and module graph | Both diagrams | `README.md:144` (circles labeled with their folders) and `README.md:201` (16 arrows, the count lint reports) | PASS |
| AC2: no bus name, `*Handler` class or old identity path | 0 | `grep -rnE "CommandBus\|QueryBus\|@nestjs/cqrs\|Handler\b\|modules/(users\|authentication\|authorization)" README.md docs/architecture` finds 0; phase 20 changed neither | PASS |

#### CA-10: writes across modules run as steps an outbox completes

| Criterion | Spec-defined outcome | Evidence at HEAD (`file:line` and assertion) | Status |
| --- | --- | --- | --- |
| AC1: no transaction writes two modules; `run` wraps own tables only | Ledger and account calls outside the caller's transaction; nesting refused | `withdraw-parts.use-case.spec.ts:216` `expect(transactionRunner.callsInside).toEqual(['steps.disarm', 'workOrders.save'])`, `:205` `insideTransaction: false`; `register-customer.use-case.spec.ts:221` `.insideTransaction)).toEqual([false])`, `:222`; `return-parts.use-case.spec.ts:195` `toEqual(['workOrders.save', 'steps.enqueue'])`, `:220`; deliver `:129`, `:150`; cancel `:160`, `:182`; `test/integration/transaction-runner-nesting.spec.ts:46` `rejects.toThrow(/transaction is already open/)`, `:49`, `:50`; `test/integration/stock-use-case-transactions.spec.ts:215` to `:224`. R5 killed | PASS |
| AC2: consume before saving; a shortage answers 422 and changes nothing | Order, 422 `INVENTORY_INSUFFICIENT_STOCK`, no change | `withdraw-parts.use-case.spec.ts:187` to `:194`; `test/e2e/work-order-withdrawals.e2e.spec.ts:596` `.expect(422)`, `:598` `toMatchObject({ code: 'INVENTORY_INSUFFICIENT_STOCK' })`, `:599` and `:600` stock 10 and 2, `:606` `toEqual(['INBOUND'])`, `:609` `toEqual([0, 0])`; `withdrawal-compensation.spec.ts:458` to `:465` | PASS |
| AC3: a failed save returns every consumed unit, history linked, save's error | Units back, returns linked to the work order | `withdrawal-compensation.spec.ts:388` `rejects.toBe(saveFailure)`, `:390` `toBe(SHELF)`, `:392` to `:396`; `stock-operation-steps.spec.ts:295` `toEqual([10, 6])`, `:305` `returned.undoesMovementId).toBe(consumption.id)`. R2 killed. Finding 1 reaches this criterion: in B2 the request's own returns are 2 of the 4 units it consumed, and the movement history nets the consumption to zero only because the return's restore was booked against it | PASS on the cited paths; see finding 1 |
| AC4: return, delivery and cancellation record their step with the save and apply it after the commit | Same transaction; applied after | `return-parts.use-case.spec.ts:223` `toMatchObject({ status: 'DONE', attempts: 1 })`, deliver `:153`, cancel `:185`; `test/integration/work-order-step-transaction.spec.ts:166` and `:167` (committed together, step `PENDING`), `:192` and `:193` (rolled back together, no step) | PASS |
| AC5: a failed step stays pending, retried with a growing delay; the answer reflects the saved work order | Pending, growing delay, request succeeds | `return-parts.use-case.spec.ts:250` `resolves.toBeUndefined()`, `:253`; deliver `:174` to `:177`; cancel `:214` to `:217`; `stock-step-applier.spec.ts:187` to `:212` (after attempts 1 to 6 the waits are 1, 5, 30, 120, 600 and 3600 s, and 3600 s after); `stock-step-retries.spec.ts:330` to `:351`. A step held behind an older one stays `PENDING` with no attempt counted while its request succeeds: `stock-step-retries.spec.ts:441` to `:445`. R6 killed | PASS |
| AC6: a step applied twice changes the stock or the accounts once | Once | Undo: `stock-operation-steps.spec.ts:326` and `:327`, two at once `:370` and `:371`; restore: `:341` and `:342`, two at once `:387` and `:388`; write-off: interleaved `:499` and `:500`, together `:513`; settlement: a second run `:530` to `:534` (one `SETTLED` transition each, statuses and ledger as after the first run), interleaved `:563` to `:566`; discard of a missing user: `discard-opened-account.spec.ts:170` to `:174`. S22 and R4 killed | PASS |
| AC7: registration opens in identity first; a failed save discards the account, role included | Account and role gone, save's error | `register-customer.use-case.spec.ts:246` (order), `:298` `rejects.toBe(saveFailure)`, `:302`; `registration-compensation.spec.ts:247` and `:249`; `discard-opened-account.spec.ts:161` `userCount(account.userId)).toBe(0)`, `:162` `roleAssignmentCount(internalId)).toBe(0)`. R8 killed | PASS |
| AC8: a stop between steps is compensated after the grace period | Not before; after, compensated | `withdrawal-compensation.spec.ts:340` and `:341` (before: units out, step `ARMED`), `:345` `toBe(SHELF)`, `:346` `{ status: 'DONE', attempts: 1 }`, `:358`; `registration-compensation.spec.ts:200`, `:201`, `:209` `toBe(0)`, `:219`. Finding 1 reaches this criterion: in B3 the processor's undo after the grace period returns 2 of the 4 units the stopped withdrawal consumed | PASS on the cited paths; see finding 1 |
| AC9: at the attempt limit, failed and logged with kind, operation id, work order or user, last error | Error level, the four values | `stock-step-applier.spec.ts:234` to `:249` (`status: 'FAILED'`, `log.failures`); `nest-stock-step-log.spec.ts:28` to `:32` (`Stock step WRITE_OFF ${OPERATION_ID} for work order ${WORK_ORDER_ID} failed for good: inventory is busy`, context `StockStepOutbox`); `account-step-applier.spec.ts:186` to `:201`; `nest-account-step-log.spec.ts:22` to `:26` (round 2 cited `:56` to `:60`, lines this 28-line file never had); `stock-step-outbox.spec.ts:230` to `:253` (was `:217` to `:240`). R7 killed | PASS |
| AC10 (new): the steps of a work order apply in the order they were recorded; a failed step holds the later ones | Recorded order; a failed step holds; other work orders go on | `test/integration/work-order-stock-steps.adapter.spec.ts:547` to `:567`: for an older step armed and pending, `:565` `expect(whileWaiting).toEqual([])`, `:566` the newer step `PENDING` with 0 attempts, `:567` claimed once the older one is done; `:571` to `:596`: behind a failed step `:594` `toEqual([])`, `:595` the operator's release frees the failed step first, `:596` then the later one; `:599` to `:616`: another work order's step is claimed meanwhile; `:619` to `:639`: one claim takes the oldest open step of each work order, `:635`, `:638`, `:639`; `:642` to `:663`: two claims at once share no step and take only the older step of each pair. `stock-step-retries.spec.ts:392` to `:459`: a restore that failed applies before the closing step of its work order. P1 to P6 killed. The criterion holds as written; finding 1 and B4 show that the recorded order is the wrong one when the newer step is the undo of a withdrawal that never reached the work order | PASS |

Status: 56 of 57 criteria match the spec-defined outcome. Gap: CA-02 AC5 (finding 1). CA-10 AC3 and AC8 pass on their cited paths, and finding 1 reaches them.

#### Spec-precision gaps

1. The spec does not say which consumptions a restore may draw from while a withdrawal of the same work order has consumed and has neither saved nor been undone. CA-10 AC10 orders the outbox steps, and a withdrawal's consumption is none of them. The user's decision of 2026-10-31 covers a write-off or a settlement that closes such a consumption: the undo returns it whatever its status. Nothing covers a restore that draws from it. Finding 1 lives in that silence.
2. CA-10 AC10 has no exception for an undo. B4 shows a released undo that must apply before an older restore, and a fix that lets an undo go first needs AC10 amended.
3. CA-10 AC8 and AC10 do not say which one wins when an older step of the same work order has failed: the undo of a stopped withdrawal stays held after its grace period until an operator releases the failed step. ADR 0033 records the hold (`docs/adr/0033-writes-across-modules-run-as-steps.md:46`); the spec does not.

Round 2's three spec-precision gaps are resolved by `bd54c40`.

---

### Edge cases

| Edge case | Spec outcome | Evidence at HEAD | Status |
| --- | --- | --- | --- |
| Seventeen cases unchanged since round 1 (the ten not-found answers, the customer filters, the shortage list, the item in use, the movement history UUIDs, five taken numbers) | As round 1 states them | Round 1's lines hold at HEAD: `work-order-tracking.e2e.spec.ts:350` and `:364`, `services.e2e.spec.ts:226`, `inventory-items.e2e.spec.ts:223`, `:232`, `:539`, `:591`, `:592`, `:718`, `:719`, `vehicles.e2e.spec.ts:322`, `customers.e2e.spec.ts:212`, `:223`, `:314`, `:315`, `:321`, `:322`, `:338`, `users.e2e.spec.ts:183`, `roles.e2e.spec.ts:116`, `work-order-withdrawals.e2e.spec.ts:579`, `create-work-order.use-case.spec.ts:235` | PASS (17) |
| Two concurrent changes, one 409 `CONCURRENT_MODIFICATION` | One 200, one 409 with the code | `work-order-concurrency.e2e.spec.ts:218` `toEqual([200, 409])`, `:220` `code: 'CONCURRENT_MODIFICATION'` (was `:196` and `:198`) | PASS |
| Withdrawal above stock | 422, nothing changed | `work-order-withdrawals.e2e.spec.ts:596` to `:611` | PASS |
| Save fails with 409 after the consumption | Units back, every level as before | `work-order-concurrency.e2e.spec.ts:259` `toEqual([200, 409])`, `:262` withdrawn 3, `:263` `quantityOnHand).toBe(17)`, `:267` and `:268` two consumptions, one return (was `:237` to `:246`). In B2 the stock also ends where it stood before the withdrawal (17); the return that won the race loses its units, which finding 1 counts | PASS |
| The inventory step of a return, delivery or cancellation fails | Work order change kept; step applied on a later attempt | `stock-step-retries.spec.ts:330` to `:351`, and `:392` to `:459` when a closing step of the same work order lands first; round 2's probe passes | PASS |
| Customer save fails after the account opened | No user with that email or document | `registration-compensation.spec.ts:249` (`count(*) ... WHERE email = $1 OR document = $2` is 0), `:219` the same email and document register again | PASS |
| Last step after the processor claimed the armed step | 409, nothing saved, compensation applied | `withdraw-parts.use-case.spec.ts:365` to `:373`; `register-customer.use-case.spec.ts:324` to `:329`; `withdrawal-compensation.spec.ts:439` to `:449`; `registration-compensation.spec.ts:290` to `:294`. R1 killed | PASS |
| New: a restore failed, then a cancellation or a delivery of the same work order | The restore applies first; the returned units are back in stock; the closing step closes only what stays outstanding | `stock-step-retries.spec.ts:392` (`it.each` over both kinds): `:436` the restore `PENDING` after its failure, `:441` the closing step `PENDING` with 0 attempts, `:453` the processor past the wait, `:455` restore `DONE` in 2 attempts, `:456` closing `DONE` in 1, `:457` `toBe(SHELF - WITHDRAWN + RETURNED)`, `:458` the ledger of `:369` or `:381`, `:459` `[['WRITTEN_OFF', WITHDRAWN - RETURNED]]` (`:374`) or `[['SETTLED', null]]` (`:386`). Fails when a withdrawal of the same work order stalls after consuming while the restore waits (B5): the restore applies first and draws from that consumption, the undo after the grace period returns the 2 units left, and the write-off records `WRITTEN_OFF` 3 where 1 stays outstanding; the shelf ends at 7 where 9 was due, every step `DONE` | GAP (finding 1) |
| `POST /customers` links the user opened earlier in the registration | Linked to that user | `registration-compensation.spec.ts:234` `customerOf(registered.userId)).toBe(registered.customerId)`; `customers.e2e.spec.ts:314`; `customer.repository.spec.ts:164` | PASS |
| A subscriber throws | Caller keeps the result; error logged by name | `in-memory-domain-event-dispatcher.spec.ts:105`, `:109` | PASS |

25 of 26 edge cases pass. Gap: the edge case at `spec.md:283` (finding 1).

---

### Gate check

All commands ran in the real tree against `workshop_test`, as it is (never truncated), with Redis DB 15.

| Step | Exit | Outcome |
| --- | --- | --- |
| `npm run lint` | 0 | ESLint clean; "no dependency violations found (791 modules, 3622 dependencies cruised)"; "No table ownership violations found (0 known findings ignored)."; "No dependency cycle between modules found (7 modules, 16 dependencies between them)." |
| `npm run build` | 0 | Clean |
| `npm run test:unit` | 0 | 1249 passed (161 files) |
| `npm run test:integration` | 0 | 483 passed (56 files) |
| `npm run test:e2e` | 0 | 246 passed (19 files), the OpenAPI contract case included |
| `npm run test:coverage` | 0 | Every threshold passed |
| `npx prettier --check README.md docs` | 0 | "All matched files use Prettier code style!" |
| `test/e2e/work-order-concurrency.e2e.spec.ts`, 5 isolated runs | 0 each | 6 of 6 tests each run; no flake |
| Control: the three suites on an empty scratch database (`workshop_mut_test`) | 0 | 1249, 483 and 246 passed |

No flake appeared in any run of this round: the full gate, the five isolated runs, the control and the 17 mutant runs, where each kill names a test of the mutated behavior. No test is skipped, focused or marked todo.

Test counts: 955, 239 and 203 before the feature (`51a3a8a`); 1249, 472 and 246 at round 2; 1249, 483 and 246 at HEAD. T76 adds nine integration cases (six in the adapter spec, one in the outbox spec, two in the retries spec) and T77 two.

The step tables of `workshop_test`: `work_order_stock_steps` held the six inert `DONE` `WRITE_OFF` rows (ids 2659, 2672, 2685, 2698, 2711 and 2724) and nothing else before the gate, after the integration and e2e suites, and after the five isolated runs; `customer_account_steps` held 0 rows each time. The suites added no row and left the six rows alone; the user decided on 2026-10-31 that they stay.

---

### Discrimination sensor

Expanded tier, CA-10 as the critical path. Every mutant ran in a detached `git worktree` of `f65d7f9` under the scratchpad, with `node_modules` linked and `.env.test` set to `DATABASE_NAME=workshop_mut_test` and `REDIS_DB=13`. Before each run the scratch database was recreated (the global setup migrates it) and Redis DB 13 emptied. Each mutation is an exact text replacement that refused to apply unless its target occurred once. Suites ran unit, then integration, then e2e, and the first failing suite killed the mutant; P7 and P8 change test support that only the integration and e2e suites load, so they ran those two. Nothing touched `workshop` or `workshop_test`.

| # | File:line | Mutation | Outcome |
| --- | --- | --- | --- |
| P1 | `src/modules/work-orders/infrastructure/persistence/typeorm-pending-stock-steps.ts:43` | Order reversed (`older.id > candidate.id`): a step waits for the newer steps of its work order | KILLED (integration, 8: the six cases of "the steps of one work order" and both closing scenarios of `stock-step-retries.spec.ts:392`) |
| P2 | `typeorm-pending-stock-steps.ts:44` | A `FAILED` step no longer holds the later steps | KILLED (integration, 1: `work-order-stock-steps.adapter.spec.ts:571`) |
| P3 | `typeorm-pending-stock-steps.ts:44` | An `ARMED` step no longer holds the later steps | KILLED (integration, 2: the armed case of `:547`, and `:599`) |
| P4 | `typeorm-pending-stock-steps.ts:44` | A `PENDING` step no longer holds the later steps | KILLED (integration, 6: the pending case of `:547`, `:571`, `:619`, `:642` and both closing scenarios) |
| P5 | `typeorm-pending-stock-steps.ts:42` | The older-step check loses its work-order scope: an open step of any work order holds every newer one | KILLED (integration, 6: `:599`, `:619`, `:642` and the claim cases at `:446`, `:494` and `:529`) |
| P6 | `typeorm-pending-stock-steps.ts:40` to `:45` | Order rule removed: the claim orders by due time alone, as before T76 | KILLED (integration, 8) |
| S22 | `src/modules/inventory/infrastructure/persistence/typeorm-inventory-item.repository.ts:198` | Settlement closes consumptions of any status | KILLED (integration, 2: `stock-operation-steps.spec.ts:516` and `:537`) |
| P7 | `test/support/outbox.ts:89` | Drain helper makes a single pass | KILLED (integration, 3: both closing scenarios and the drain case of `stock-step-outbox.spec.ts`) |
| P8 | `test/support/outbox.ts:55` | Drain helper sees pending steps only, not armed ones | KILLED (integration, 1: the drain case of `stock-step-outbox.spec.ts`) |
| R1 | `src/modules/work-orders/application/commands/withdraw-parts/withdraw-parts.use-case.ts:81` | Disarm result ignored, so a claimed step answers no 409 | KILLED (unit, 1) |
| R2 | `withdraw-parts.use-case.ts:86` | No compensation when a later step fails | KILLED (unit, 4) |
| R3 | `typeorm-inventory-item.repository.ts:148` | Undo returns only consumptions still `PENDING` | KILLED (integration, 2: the written-off and the settled consumption) |
| R4 | `typeorm-inventory-item.repository.ts:241` | Write-off updates every candidate, pending or not | KILLED (integration, 2: interleaved and concurrent write-offs) |
| R5 | `src/shared/infrastructure/database/typeorm-transaction-runner.ts:42` | `run` no longer refuses to nest | KILLED (integration, 5: `transaction-runner-nesting`, `stock-use-case-transactions`) |
| R6 | `src/modules/work-orders/application/services/stock-step-applier.ts:102` | Delay read one slot later (5 s after the first failure) | KILLED (unit, 11) |
| R7 | `stock-step-applier.ts:96` | Attempt limit reached one attempt late | KILLED (unit, 1) |
| R8 | `src/modules/customers/application/commands/register-customer/register-customer.use-case.ts:127` | No compensation when a later step fails | KILLED (unit, 4) |

The sensor depth is expanded. 17 mutants ran: nine on phase 20 (the order condition, the three statuses that hold a step, the work-order scope, the rule as a whole, the settlement's pending-only update and the drain helper twice) and eight on phase 19's critical paths. All 17 die, S22 in both new settlement cases. Probe B4 also ran once with P6 applied, to compare the claim before T76 with HEAD (Probes).

The real tree's `git status --porcelain` was empty before the sensor and still empty after it; the only files this round changed afterwards are this report and the two files `lessons.py` writes. Once the probes and the acceptance checks were done, the worktree was removed and pruned, `workshop_mut_test` dropped, Redis DB 13 emptied (`DBSIZE` 0), and no `workshop_seed_*` database was left. No `git stash` was used.

---

### Probes

Throwaway specs in the scratch worktree, on the unmutated code and the scratch database, removed with the worktree. The adapter probes reuse the helpers of `test/integration/stock-step-retries.spec.ts` and call the real adapters in the order the use cases call them. The use-case probes build `ReturnPartsUseCase` and `WithdrawPartsUseCase` from the application's own providers and wrap a dependency only to fix the order of events.

#### Round 2's probe on HEAD

Stock 10, a consumption of 3, a return of 2 recorded as a `RESTORE` step whose first attempt meets an inventory that fails, then a `WRITE_OFF` or a `SETTLE` of the same work order recorded and attempted at once, then two processor runs past the wait.

| Closing step | Processor | After the two requests | After run 1 | After run 2 |
| --- | --- | --- | --- | --- |
| `WRITE_OFF` | `applyDue()` | restore `PENDING` (1 attempt, "inventory is busy"); write-off `PENDING` (0 attempts); stock 7 | restore `DONE` (2 attempts); write-off `PENDING`; stock 9 | write-off `DONE` (1 attempt); stock 9; `CONSUMPTION 3 WRITTEN_OFF`, `RETURN 2`; transition `WRITTEN_OFF` 1 |
| `SETTLE` | `applyDue()` | as above | as above | settle `DONE` (1 attempt); stock 9; `CONSUMPTION 3 SETTLED`, `RETURN 2`; transition `SETTLED` |
| `WRITE_OFF` | drain by operation ids | as above | as above | as the first row |
| `SETTLE` | drain by operation ids | as above | as above | as the second row |

#### A return beside a withdrawal in flight

The work order has a consumption of 3 that reached it. A return of 2 and a withdrawal of 4 then meet. The right outcome returns the withdrawal's 4 units and the return's 2: the shelf ends 1 unit below its opening stock (9 of 10, or 19 of 20 in the use-case probes), the work order shows 1 unit outstanding, and inventory agrees.

| Probe | Order of events | Layer | End state | Due |
| --- | --- | --- | --- | --- |
| B1 | The withdrawal arms its undo and consumes 4; the return records its restore, whose attempt claims nothing behind the armed undo; the withdrawal's save fails and it compensates; the drain applies the restore | Adapter | Stock 9 of 10; the restore drew from the consumption of 3 | 9 |
| B2 | The withdrawal loads the work order; the return saves and records its restore; the withdrawal arms and consumes 4; the restore applies after the consumption; the withdrawal's save answers 409 and it compensates | Adapter | Stock 7; consumption of 3 with 3 outstanding, consumption of 4 with 0 | 9 |
| B2 | The same, through the use cases | Use cases | Withdrawal rejects with `ConcurrentModificationError`, return succeeds; work order 1 unit outstanding; shelf 17 of 20; three steps `DONE` | 19 |
| B3 | The restore's first attempt fails; a withdrawal of 4 consumes and stalls before its last step; the processor runs past the restore's wait, then past the grace period | Adapter | Stock 5 after the first run (the restore drew from the consumption of 4), 7 after the undo returned the 2 left | 9 |
| B3 | The same, through the use cases | Use cases | Work order 1 unit outstanding; shelf 17 of 20; every step `DONE`, the restore in 2 attempts | 19 |
| B4 | The restore's first attempt fails; a withdrawal consumes 4, its save fails and its own undo fails, so it releases the step; the processor runs twice | Adapter | HEAD: 7, the restore applies first and the undo waits behind it. The claim before T76 (mutant P6): 9, the released undo applies first | 9 |
| B2, then a cancellation | B2, then a write-off of the work order | Adapter | Transition `WRITTEN_OFF` with quantity 3 | 1 |
| B5 | The restore's first attempt fails; a withdrawal of 4 consumes and stalls; a cancellation is saved and its attempt claims nothing; the processor runs past the waits | Adapter | Stock 5 after the restore applies, 7 after the undo; the write-off, held until then, records `WRITTEN_OFF` 3; every step `DONE` | 9; `WRITTEN_OFF` 1 |
| Race over HTTP | 30 rounds of `POST .../withdrawals` (4) and `POST .../returns` (2) sent together on a work order in execution, then a drain of its steps | E2e | 30 of 30: withdrawal 409, return 200, shelf and work order agree | Agree |

Cause. `RestoreStockBatchUseCase` draws from the item's `PENDING` consumptions on the work order, newest first (`src/modules/inventory/infrastructure/persistence/typeorm-inventory-item.repository.ts:111` to `:119`, drawn at `src/modules/inventory/application/commands/restore-stock-batch/restore-stock-batch.use-case.ts:76` to `:93`). A withdrawal consumes in inventory's own transaction before it saves the work order (CA-10 AC2), so until its last step its consumption is the newest pending one. The undo returns the net remaining units of the operation's consumptions (`typeorm-inventory-item.repository.ts:143` to `:151`, used at `src/modules/inventory/application/commands/undo-consumption/undo-consumption.use-case.ts:43` to `:59`), and that figure already subtracts what the restore drew. T76 orders outbox steps (`src/modules/work-orders/infrastructure/persistence/typeorm-pending-stock-steps.ts:40` to `:45`). The consumption itself is no step, and a restore recorded before the withdrawal armed is the older step, so the rule lets it apply first; in B4 it makes the restore apply before a released undo. The interleave of B2 needs the return to commit its step after the withdrawal loaded the work order and before it armed, and the restore to read after the consumption committed; 30 races in this setup never produced it. B3 and B5 need one inventory failure and a withdrawal that stops or stalls between its consumption and its last step, the case CA-10 AC8 exists for.

---

### Adversarial review

#### The claim and its order rule

- The claim is one statement. `FOR UPDATE OF candidate SKIP LOCKED` locks only the candidate rows, and the `NOT EXISTS` reads the committed status of the older steps, so two claims at once never take two steps of one work order (`work-order-stock-steps.adapter.spec.ts:642` to `:663`). P1 to P6 die.
- Saves of one work order serialize on its version guard (AD-009), and each enqueue follows its save in the same transaction (`return-parts.use-case.spec.ts:195`), so the id order of enqueued steps is their commit order. An armed step commits in a transaction of its own before its consumption, so it is always older than the steps recorded while its withdrawal is in flight.
- An armed undo holds the later steps of its work order while its withdrawal is in flight, and for up to the grace period (300 s) when the request stalls. The requests that recorded them succeed, as ADR 0033 says (`docs/adr/0033-writes-across-modules-run-as-steps.md:46`).
- An undo held behind an older failed step stays held after its grace period, until an operator sets the failed step back to pending (spec-precision gap 3).
- A request's own compensation never claims, so it is outside the order rule. In B1 that is how the undo lands before the restore, which waits behind the armed step.
- The order rule lets a restore read the consumption of a withdrawal in flight: finding 1.

#### Test support and the never-truncate convention

- `drainStockStepsOfWorkOrder` (`test/support/outbox.ts:71` to `:93`) always returns: each round applies a step, counts an attempt, or leaves the list unchanged, and a failed attempt moves the due time past the drain's clock. P7 and P8 die.
- `FakePendingStockSteps.claimDue` (`test/support/fakes/fake-pending-stock-steps.ts:86` to `:104`) still claims by due time alone, as the user decided; the order rule is proven on the real adapter only.
- Phase 20's cases remove their own rows: the adapter spec by operation id and by its 2001 window (`work-order-stock-steps.adapter.spec.ts:30` and `:39`), the outbox spec by operation id (`stock-step-outbox.spec.ts:38`), the retries spec by work order (`stock-step-retries.spec.ts:66` to `:72`). The concurrency file drains the work orders it made in `afterAll` (`work-order-concurrency.e2e.spec.ts:35` to `:55`). No `TRUNCATE` was added.

#### The docs

- ADR 0033 states the order rule and the operator's release in its decision (`:28`), the hold in its consequences (`:46`) and both cases left to an operator (`:52` and `:54`); the port comment says the same (`src/modules/work-orders/application/ports/pending-stock-steps.port.ts:53` to `:56`). Prettier is clean.
- No tracked document mentions microservices or a future migration of the system. ADR 0001 says "Distributed services and a layerless single module are the obvious alternatives, and neither was written down as considered" (`docs/adr/0001-modular-monolith-with-cqrs.md:29`). The user decided on 2026-10-31, relayed by the orchestrator, that the sentence stays as written: it predates the feature, speaks of no future migration, and the body of an ADR stays as decided.

---

### Code quality

| Check | Status |
| --- | --- |
| No features beyond what was asked | Pass. T76 to T78 touch only what their tasks name |
| No abstractions for single-use code | Pass. `drainStockStepsOfWorkOrder` has three callers |
| No unnecessary flexibility | Pass |
| Only touched files the tasks required | Pass |
| Did not "improve" unrelated code | Pass |
| Matches existing patterns and style | Pass |
| Tests map to criteria and are not shallow | Pass with a gap: no case runs a return beside a withdrawal in flight (finding 1) |
| Spec-anchored outcome check | 56 of 57; gap CA-02 AC5; 25 of 26 edge cases, gap at `spec.md:283` |
| Per-layer coverage expectation | Pass: the order rule on the database (held, released, other work orders, one per claim, two claims at once), the settlement twice on the real repository |
| Every test maps to a requirement | Pass |
| Documented guidelines followed | `.specs/STATE.md` Conventions, the Test Coverage Matrix, the `vitest.config.ts` thresholds. The never-truncate convention holds |

---

### Fix plans

#### Fix 1 (Major, needs the user's decision): a restore must not take the units of a withdrawal in flight

Root cause in the Probes section. The rule is the user's choice, and each shape below touches CA-10 AC10 or the restore's contract:

- Hold the restore, the settlement and the write-off of a work order while an undo step of that work order is armed or pending, so a withdrawal's compensation lands before any step that reads the pending consumptions. This covers B1 to B5, and the race of a cancellation with a withdrawal as well. It amends CA-10 AC10: an undo goes before the older steps of its work order, and a restore can wait up to the grace period behind a stalled withdrawal.
- Or have the restore draw only from consumptions the work order has accepted. Inventory cannot read the step table (CA-03 AC9), so `work-orders` would pass the operation ids the restore may draw from, which the aggregate does not track today.

Fix task: record the chosen rule in CA-10 (AC10 and an edge case on a return beside a withdrawal in flight) and in ADR 0033, implement it, and add integration cases for B2, B3, B4 and B5 through the real use cases. Done when each ends with the work order and inventory agreeing on 1 outstanding unit, the shelf at 19 of 20 in the use-case probes' numbers (9 of 10 in the adapter probes'), a cancellation writing off 1 unit, and every step `DONE`.

Decided by the user on 2026-10-31 and relayed by the orchestrator: the ADR 0001 sentence on distributed services stays as written, and the six inert `DONE` rows stay in `workshop_test`. Observation that needs no fix in this feature: the teardown also matches the `DONE` steps another process writes during a run, as in round 2.

---

### Requirement traceability update

Proposed for `spec.md`; the orchestrator applies it.

| Requirement | Previous status | New status |
| --- | --- | --- |
| CA-01 | In Tasks | Verified |
| CA-02 | In Tasks | Needs fix (AC5, Fix 1) |
| CA-03 | In Tasks | Verified |
| CA-04 | In Tasks | Verified |
| CA-05 | In Tasks | Verified |
| CA-06 | In Tasks | Verified |
| CA-07 | In Tasks | Verified |
| CA-08 | In Tasks | Verified |
| CA-09 | In Tasks | Verified |
| CA-10 | In Tasks | Needs fix (edge case at `spec.md:283`, Fix 1; a decision on AC10) |

---

### Summary

| Area | Outcome |
| --- | --- |
| Overall | Not ready |
| Round 2's gaps | 1, 2 and 3 closed |
| Spec-anchored check | 56 of 57 criteria match; 3 spec-precision gaps; 25 of 26 edge cases |
| Sensor | 17 mutants, 17 killed: 9 on phase 20 (S22 included) and 8 on phase 19 |
| Gate | Lint, build, unit (1249), integration (483), e2e (246, contract included), coverage and docs pass on `workshop_test`; the concurrency file passes 5 of 5 isolated runs |

Phase 20 does what round 2 asked: a restore that failed now applies before the write-off or the settlement of its work order, a failed step holds the later ones, the settlement is proven idempotent on the real repository, and the spec states the order and the approved scope. The defect left is a restore that draws from the consumption of a withdrawal still in flight, which loses the returned units when that withdrawal is undone.

Next: this is the third round, so the loop escalates to the user with Fix 1 and the decision on CA-10 AC10.

---

### Lessons

`lessons.py` recorded four candidates from this round: L-026 (finding 1: a step that draws on the movements of an operation in flight), L-027 (spec-precision gap 1: what other steps may read from an operation in flight), L-028 (spec-precision gap 2: whether a compensation may apply before older steps) and L-029 (spec-precision gap 3: how a hold combines with a criterion that promises a delay). No mutant survived and no gate failed, so neither produced a lesson. No confirmed lesson recurred, so none was penalized: the new edge case has its owning task (T76), as L-002 asks, and L-003 saw no repeat.

---

# Round 2 history (2026-10-31)

Round 2's report follows as it was written. It is history: the verdict of round 3 above governs.

## Round 2

**Date**: 2026-10-31
**Spec**: `.specs/features/clean-architecture/spec.md`
**Diff range**: `51a3a8a..832bbb6` (98 commits). Since round 1 (`943018a`): phase 18 (T63 `482ad0d` to T67 `552a112`), phase 19 (T68 `e2c8ac9` to T75 `ef77248`, with the test fix `45a0c12` and the ADR status fix `75e5d1d`), and the `.specs` records `e47f852`, `6e47405`, `e2eb3e5`, `ef537d2`, `fa06266`, `aa826e6` and `832bbb6`.
**Verifier**: independent sub-agent (author is not the verifier), round 2 of at most 3
**Verdict**: FAIL

### Verdict

FAIL. Every gate passes on `workshop_test`, and the five findings of round 1 are fixed: the metrics spec no longer times out, the seed spec runs on a database of its own, M07, M12, W1, W2, W3b and W3c all die, ADR 0032 records the refinement of AD-008, and CA-03 AC7 names `runInNewTransaction`. 53 of 56 acceptance criteria and 24 of 25 edge cases match the spec, and 26 of the 27 mutants injected into phase 19's code die. Two findings block the verdict and one is minor:

1. A return's restore step that fails on its first attempt can never apply once a cancellation or a delivery of the same work order lands first. A probe on the real adapters (sensor section) failed the restore once, applied the write-off, then ran the processor twice past the wait: every attempt failed with `No pending consumption covers a return of 2 ...`, the shelf stayed at 7 where 9 was due, and the write-off recorded 3 units lost where 1 was outstanding. The same happens with a settlement. The return stays half applied until the attempt limit hands it to an operator. This breaks the edge case at `spec.md:279` ("apply the inventory step on a later attempt") and the purpose of CA-02 AC5 ("so that no operation stays half applied"). No test runs this order.
2. Mutant S22 survives: a settlement that closes consumptions of any status (`typeorm-inventory-item.repository.ts:198` without `AND status = 'PENDING'`) passes 1249 unit, 472 integration and 246 e2e tests. No case applies a settlement twice through the real repository, so the settlement part of CA-10 AC6 has no evidence; the write-off has two such cases.
3. Minor, spec text: CA-03 AC7 lists what `src/shared` may gain, and T68 adds `src/shared/infrastructure/database/migrations/1787702400009-add-cross-module-steps.ts`, which the list does not name. The Out of Scope table still excludes database schema changes and changes to aggregates, both of which CA-10 needs.

---

### Task completion

All 372 Done-when boxes of `tasks.md` are checked and none is open. Every commit since round 1 passes `check_commit.py` and carries no trailer. Phases 1 to 17 are as round 1 reports them below.

| Phase | Tasks and commits | Status |
| --- | --- | --- |
| 18. Fixes from the first validation | T63 `482ad0d`, T64 `d2dae75`, T65 `724eb1b`, T66 `98f05b1`, T67 `552a112` | Done; each fix verified below |
| 19. Steps across modules, batch A | T68 `e2c8ac9`, T69 `c9e295b`, T70 `3e7bdff`, T71 `e9f01c1`, test fix `45a0c12` | Done |
| 19. Steps across modules, batch B | T72 `07f7832`, T73 `a3278ad`, T74 `0b5b83b`, T75 `ef77248`, ADR status fix `75e5d1d` | Done; findings 1 and 2 sit in this code |

---

### Spec-anchored acceptance criteria

PASS means the cited assertion targets the outcome the spec defines. For a criterion phases 18 and 19 left alone, the evidence of round 1 was re-read at HEAD; a moved line is given at its HEAD position. "Inspection" marks a structural criterion verified by reading the tree.

#### CA-01: the core runs without the framework

| Criterion | Spec-defined outcome | Evidence at HEAD (`file:line` and assertion) | Result |
| --- | --- | --- | --- |
| AC1: no banned import under `domain` or `application` | Zero | `test/architecture/core-purity.spec.ts:197` `expect(scanCore(ROOT, migratedModules)).toEqual([])`; lint at HEAD "no dependency violations found (791 modules, 3622 dependencies cruised)". The phase 19 core files (`pending-stock-steps.port.ts`, `stock-step-applier.ts`, `account-step-applier.ts`, both `outbox-settings.ts`, the undo and discard use cases) import only the core | PASS |
| AC2: no decorator under `application` | Zero | `core-purity.spec.ts:150` and `:197`; a grep for `@Injectable` and `@Inject` under every `application` folder finds 0 | PASS |
| AC3: no injection token in the core | Zero | `core-purity.spec.ts:159` and `:197`; the new tokens sit in `work-orders.tokens.ts` and `customers.tokens.ts` | PASS |
| AC4: repository contracts in the owner's `application/ports` | All of them | Inspection: the two new outbox contracts are `src/modules/work-orders/application/ports/pending-stock-steps.port.ts:33` and `src/modules/customers/application/ports/pending-account-steps.port.ts:26` | PASS (inspection) |
| AC5: every use case built in its composition root | All of them | Inspection: `src/modules/inventory/inventory.module.ts:157` `new UndoConsumptionUseCase(...)`, `src/modules/identity/identity.module.ts:175` `new DiscardOpenedAccountUseCase(users, sessions)`, `src/modules/work-orders/work-orders.module.ts:237` and `:446`, `src/modules/customers/customers.module.ts:62` and `:131` | PASS (inspection) |
| AC6: refresh token TTL of 600 | Exactly 600 000 ms | `test/e2e/authentication.e2e.spec.ts:391` `.toBe(600 * 1000)` | PASS |
| AC7: reuse warning line | Exact message and context | `security-events.subscriber.spec.ts:29` and `:32` (`context: 'AuthenticationSecurity'`), `identity.module.spec.ts:68`, `refresh-session.use-case.spec.ts:166` | PASS |

#### CA-02: every route answers exactly as before

| Criterion | Spec-defined outcome | Evidence at HEAD | Result |
| --- | --- | --- | --- |
| AC1: OpenAPI document equals the baseline | Canonical equality | `test/e2e/openapi-contract.e2e.spec.ts:44` `expect(canonical(buildOpenApiDocument(testApp.app))).toBe(canonical(baseline))`, green at HEAD; `test/contract/openapi.baseline.json` has one commit, `709eb27` | PASS |
| AC2: pre-existing e2e tests pass with no changed assertion except the approved race case | One changed assertion, in that case | `git diff 51a3a8a..HEAD` over the 16 e2e files that existed at `51a3a8a` removes one `expect` line, in "never ends with a pending consumption on a cancelled work order, when a cancellation races a withdrawal". It became `test/e2e/work-order-concurrency.e2e.spec.ts:310` `expect(outstanding.every((units) => units === 0)).toBe(true)` and `:311` `.quantityOnHand).toBe(20)`, the text the user approved ("no consumption keeps units outstanding, and the stock is back where it was"). Every other changed line is an added case or import, or one of two reworded comments (`customers.e2e.spec.ts:230`, `work-order-tracking.e2e.spec.ts:71`). 246 of 246 pass | PASS |
| AC3: every route has an e2e test written before its flow moved | 73 of 73 | No route was added (the OpenAPI document is unchanged); the five flows phase 19 moved have e2e cases from before the feature (`work-order-withdrawals`, `work-order-closing`, `customers`) | PASS |
| AC4: a query use case raises its module's not-found | 11 use cases | The 11 specs round 1 cites are unchanged since `943018a`, same lines | PASS |
| AC5 (amended): a later step that fails is compensated or retried so that no operation stays half applied | Nothing half applied | Covered paths: `test/integration/withdrawal-compensation.spec.ts:388` `rejects.toBe(saveFailure)`, `:390` `quantityOf(...)).toBe(SHELF)`, `:392`; `test/integration/registration-compensation.spec.ts:247`, `:249` `userCount(registered)).toBe(0)`; `test/integration/stock-step-retries.spec.ts:329` to `:350`. Uncovered and failing: the probe of finding 1 leaves a return half applied | GAP (finding 1) |
| AC6: a throwing subscriber leaves the result and is logged by name | `publish` never throws; the class is named | `in-memory-domain-event-dispatcher.spec.ts:105`, `:109`, `:112`, `:124`, `:129` | PASS |

#### CA-03: modules meet only through ports and public APIs

| Criterion | Spec-defined outcome | Evidence at HEAD | Result |
| --- | --- | --- | --- |
| AC1: no module cycle | 0 | `test/architecture/module-cycles.spec.ts:89`; lint "No dependency cycle between modules found (7 modules, 16 dependencies between them)" | PASS |
| AC2: no core import into another module | 0 | `test/architecture/dependency-rules.spec.ts:158` `expect(stdout).toContain('no dependency violations found')` (was `:147`), `test/architecture/baselines.spec.ts:15` | PASS |
| AC3: outer layers reach another module only through its `index.ts` | 0 | `dependency-rules.spec.ts:95` to `:99`, and the T65 case `:102` to `:110` `toEqual(['through-public-api: src/modules/alpha/infrastructure/tokens-gateway.ts -> src/modules/beta/beta.tokens.ts'])`; acceptance A3 and A3b fail lint at HEAD; M07 killed | PASS |
| AC4: a cross-module need goes through a consumer port | Port in the consumer, gateway in its infrastructure | Phase 19 widens two existing ports: `StockLedger.undoConsumption` (`stock-ledger.gateway.spec.ts:57` to `:113` `toStrictEqual` per call) and `CustomerAccounts.discard` (`customer-accounts.gateway.spec.ts:185` `toEqual([new DiscardOpenedAccountCommand(NEW_USER_ID)])`); round 1's case sits at `customer-directory.gateway.spec.ts:72` `toBeNull()` | PASS |
| AC5: identity is one module | One Nest module | `src/modules/identity/identity.module.ts:114` `@Module` | PASS |
| AC6: no bus reference, no `@nestjs/cqrs` dependency | 0 | `grep -rnE "CommandBus\|QueryBus\|@nestjs/cqrs" src test scripts` finds 0; `package.json` has none | PASS |
| AC7 (amended): `src/shared` gains only the publisher port, the dispatcher, their specs, `shared.tokens.ts` and `runInNewTransaction` | Only those | `git diff 51a3a8a..HEAD -- src/shared` adds those, `runInNewTransaction` at `src/shared/infrastructure/database/typeorm-transaction-runner.ts:30`, and also `src/shared/infrastructure/database/migrations/1787702400009-add-cross-module-steps.ts`, which the list does not name | GAP (minor, spec text; finding 3) |
| AC8: an adapter writes only its own tables | 0 findings | `scripts/architecture/table-owners.ts:27` and `:28` map the two step tables; `test/architecture/table-ownership.spec.ts:73`; `baselines.spec.ts:19`; lint "No table ownership violations found (0 known findings ignored)" | PASS |
| AC9: no adapter reads another module's table | 0 findings | Same evidence; acceptance A4 fails lint at HEAD. The claim joins `work_orders`, a table of its own module (`typeorm-pending-stock-steps.ts:42`); `customer_account_steps.user_id` is a plain uuid | PASS |
| AC10: key translation through the owner's resolver | The resolvers | `typeorm-work-order-query.adapter.ts:232` to `:248` (was `:226`); `work-order-query.adapter.spec.ts:510`; the new undo read translates work order keys through `WorkOrderReads.externalIdsOf` (`typeorm-inventory-item.repository.ts:157`) | PASS |
| AC11: another module's data in batch through its API | One call per owner | `customer-query.adapter.spec.ts:291` `toEqual(['toExternalIds', 'findUsers'])` | PASS |
| AC12: consumer declares, owner implements, root binds | `WorkOrderReads` | Unchanged since round 1; `test/integration/work-order-reads.spec.ts` green | PASS |
| AC13: a resolver sees rows written earlier in its transaction | Resolved inside | `user-key-resolver.spec.ts:125`, `customer-key-resolver.spec.ts:133`, `vehicle-key-resolver.spec.ts:141`, `service-key-resolver.spec.ts:121`, `inventory-item-key-resolver.spec.ts:119`, `work-order-reads.spec.ts:177`, `customer.repository.spec.ts:164` | PASS |

#### CA-04: the build enforces the architecture

Re-run at HEAD in the scratch worktree: each throwaway file, then `npm run lint`.

| Criterion | Spec-defined outcome | Evidence at HEAD | Result |
| --- | --- | --- | --- |
| AC1: banned import fails lint, naming file and rule | Non-zero | A1: `src/modules/services/application/throwaway.ts` importing `@nestjs/common`, exit 1, "'@nestjs/common' import is restricted ... no-restricted-imports" on that file; `dependency-rules.spec.ts:137` | PASS |
| AC2: module cycle fails lint, naming the files | Non-zero, files named | A2: a type import of `customers` from `identity/users/infrastructure/cycle-probe.ts`, exit 1, "Dependency cycle between modules: customers -> identity -> customers" and the importing file of each step | PASS |
| AC3: import outside `index.ts` fails lint, naming the file | Non-zero | A3 (`deep-probe.ts`) and A3b (`tokens-probe.ts` importing `customers.tokens.ts`), exit 1, "error through-public-api: src/modules/vehicles/infrastructure/tokens-probe.ts → src/modules/customers/customers.tokens.ts"; M07 now killed by `dependency-rules.spec.ts:102` | PASS |
| AC4: foreign table fails lint, naming adapter and table | Non-zero | A4: exit 1, "src/modules/vehicles/infrastructure/persistence/foreign-probe.ts: queries customers, a table owned by customers"; `table-ownership.spec.ts:51` | PASS |
| AC5: empty baselines | Both `[]` | `baselines.spec.ts:15` and `:19` | PASS |
| AC6: pre-push runs lint | Hook calls lint | `.husky/pre-push:6` `npm run lint` | PASS |

#### CA-05: use case tests exercise real collaborators

| Criterion | Spec-defined outcome | Evidence at HEAD | Result |
| --- | --- | --- | --- |
| AC1: no bus stub helpers | 0 | grep over `src`, `test` and `scripts` finds 0 | PASS |
| AC2: cross-module use cases tested through fakes in `test/support/fakes` | All of them | Withdraw, return, deliver and cancel run on `FakeStockLedger` and `FakePendingStockSteps`; registration on `FakeCustomerAccounts` and `FakePendingAccountSteps` | PASS |
| AC3: collaborations asserted on fake state | No `toHaveBeenCalled` on a cross-module port | The five phase 19 use case specs and both applier specs hold no `toHaveBeenCalled`, `vi.fn` or `vi.spyOn`; e.g. `withdraw-parts.use-case.spec.ts:199` `expect(stockLedger.consumed).toEqual([...])`, `register-customer.use-case.spec.ts:302` `expect(accounts.discarded).toEqual([CHOSEN_USER_ID])` | PASS |
| AC4: thresholds keep their percentages | Same percentages | `vitest.config.ts` is unchanged since round 1 (three globs moved, no percentage changed); `npm run test:coverage` exits 0 | PASS |

#### CA-06: a second entry point reuses the use cases

| Criterion | Spec-defined outcome | Evidence at HEAD | Result |
| --- | --- | --- | --- |
| AC1: the seed calls the five use cases | The five use cases; the records exist | `scripts/seed.ts:170` to `:174`; `test/integration/seed.script.spec.ts:81` names a database of its own, `:109` to `:115` create, migrate and seed it twice, `:124` drops it. On a scratch database that already held the demo rows, M12 dies in this spec, and W3b and W3c die in `register-vehicle.use-case.spec.ts:59` `toBe(2018)` and `register-customer.use-case.spec.ts:161` `toBe('11987654321')` | PASS |

#### CA-07: the decisions are recorded

| Criterion | Spec-defined outcome | Evidence at HEAD | Result |
| --- | --- | --- | --- |
| AC1: each decision as an AD and an ADR naming each other | Both places | AD-011 to AD-016 and ADRs 0026 to 0031 as in round 1; AD-008 names ADR 0032 (`.specs/STATE.md:70`) and `docs/adr/0032-a-repository-own-transaction-is-the-ambient-one.md:4` names AD-008; AD-017 names ADR 0033 (`.specs/STATE.md:154`) and `docs/adr/0033-writes-across-modules-run-as-steps.md:5` names AD-017 | PASS |
| AC2: ADR for the four kept patterns | ADR 0031 | Unchanged | PASS |
| AC3: ADR for permissions in the guard | ADR 0030 | Unchanged | PASS |
| AC4: ADR 0008 and AD-003 superseded | Both marked | `docs/adr/0008-cross-context-calls-through-the-buses.md:3`; `.specs/STATE.md:30` | PASS |
| AC5: ADR for own tables with three reasons | ADR 0028 | Unchanged | PASS |
| AC6: ADR for the inversion | ADR 0027 | Body unchanged; status `Amended by 0033` (`docs/adr/0027-ports-between-modules.md:3`), as the user decided | PASS |

The statuses match the user's decisions: 0001 `Amended by 0026 and 0033`, 0008 `Superseded by 0027`, 0023 `Superseded by 0033`, 0027 `Amended by 0033`, 0032 `Accepted`. `git diff 51a3a8a..HEAD` changes only the status line of 0001, 0008 and 0023, and `git diff 61984b9..HEAD` only the status line of 0027.

#### CA-08: use cases carry the use case name

| Criterion | Spec-defined outcome | Evidence at HEAD | Result |
| --- | --- | --- | --- |
| AC1: `<Name>UseCase` in `<name>.use-case.ts` | Only those names | The `commands` and `queries` folders hold 79 `.use-case.ts`, 76 `.use-case.spec.ts`, 50 `.command.ts` and 29 `.query.ts` files and nothing else; no `*Handler` class | PASS |
| AC2: spec beside each use case | Named `<name>.use-case.spec.ts` | The two new use cases have theirs (`undo-consumption.use-case.spec.ts`, `discard-opened-account.use-case.spec.ts`); the three without a spec had none at `51a3a8a` | PASS |

#### CA-09: the documentation matches the structure

| Criterion | Spec-defined outcome | Evidence at HEAD | Result |
| --- | --- | --- | --- |
| AC1: README circles and module graph | Both diagrams | `README.md:144` (circles labeled with their folders) and `README.md:201` (16 arrows, the count lint reports) | PASS |
| AC2: no bus name, `*Handler` class or old identity path | 0 | `grep -rnE "CommandBus\|QueryBus\|@nestjs/cqrs\|Handler\b\|modules/(users\|authentication\|authorization)" README.md docs/architecture` finds 0 | PASS |

#### CA-10: writes across modules run as steps an outbox completes

| Criterion | Spec-defined outcome | Evidence at HEAD (`file:line` and assertion) | Result |
| --- | --- | --- | --- |
| AC1: no transaction writes two modules; `run` wraps own tables only | Ledger and account calls outside the caller's transaction; nesting refused | `withdraw-parts.use-case.spec.ts:216` `expect(transactionRunner.callsInside).toEqual(['steps.disarm', 'workOrders.save'])`, `:205` `insideTransaction: false`; `register-customer.use-case.spec.ts:221` `.insideTransaction)).toEqual([false])`, `:222` `toEqual(['steps.disarm', 'customers.save'])`; `return-parts.use-case.spec.ts:195` `toEqual(['workOrders.save', 'steps.enqueue'])` and `:220`; deliver `:129` and `:150`; cancel `:160` and `:182`; `test/integration/transaction-runner-nesting.spec.ts:46` `rejects.toThrow(/transaction is already open/)`, `:49` `expect(inner).not.toHaveBeenCalled()`, `:50` `toHaveBeenCalledTimes(1)`; `test/integration/stock-use-case-transactions.spec.ts:215` to `:224` (a consumption inside another transaction is refused and consumes nothing). S01 to S04 killed | PASS |
| AC2: consume before saving; a shortage answers 422 and changes nothing | Order, 422 `INVENTORY_INSUFFICIENT_STOCK`, no change | `withdraw-parts.use-case.spec.ts:187` to `:194` (`steps.arm`, `ledger.consume`, `steps.disarm`, `workOrders.save`); `test/e2e/work-order-withdrawals.e2e.spec.ts:596` `.expect(422)`, `:598` `toMatchObject({ code: 'INVENTORY_INSUFFICIENT_STOCK' })`, `:599` and `:600` stock 10 and 2, `:606` `toEqual(['INBOUND'])`, `:609` `toEqual([0, 0])`; `withdrawal-compensation.spec.ts:458` to `:465` | PASS |
| AC3: a failed save returns every unit, history linked, save's error | Units back, returns linked to the work order | `withdrawal-compensation.spec.ts:388` `rejects.toBe(saveFailure)`, `:390` `toBe(SHELF)`, `:392` to `:396` `['RETURN', 2, fixture.workOrderId]`; `stock-operation-steps.spec.ts:295` `toEqual([10, 6])` for two items, `:305` `returned.undoesMovementId).toBe(consumption.id)` | PASS |
| AC4: return, delivery and cancellation record their step with the save and apply it after the commit | Same transaction; applied after | The unit cases of AC1 plus `return-parts.use-case.spec.ts:223` `toMatchObject({ status: 'DONE', attempts: 1 })`, deliver `:153`, cancel `:185`; `test/integration/work-order-step-transaction.spec.ts:166` and `:167` (committed together, step `PENDING`), `:192` and `:193` (rolled back together, no step). S03 and S26 killed | PASS |
| AC5: a failed step stays pending, retried with a growing delay; the answer reflects the saved work order | Pending, growing delay, request succeeds | `return-parts.use-case.spec.ts:250` `resolves.toBeUndefined()`, `:253` step `PENDING` with the error and the wait; deliver `:174` to `:177`; cancel `:214` to `:217`; `stock-step-applier.spec.ts:187` to `:212` (1, 5, 30, 120, 600, then 3600 s); `stock-step-retries.spec.ts:329` to `:350`. The values come from design C16; the spec asks for "growing", which they are. S15 and S24 killed | PASS |
| AC6: a step applied twice changes the stock or the accounts once | Once | Undo: `stock-operation-steps.spec.ts:326` and `:327`, two at once `:370` and `:371`; restore: `:341` and `:342`, two at once `:387` and `:388`; write-off: interleaved `:473` to `:503`, together `:505` to `:513`; discard of a missing user: `discard-opened-account.spec.ts:170` to `:174`. Settlement: no case applies it twice through the real repository, and S22 survives | GAP (finding 2) |
| AC7: registration opens in identity first; a failed save discards the account, role included | Account and role gone, save's error | `register-customer.use-case.spec.ts:246` (order), `:298` `rejects.toBe(saveFailure)`, `:302`; `registration-compensation.spec.ts:247` and `:249`; `discard-opened-account.spec.ts:161` `userCount(account.userId)).toBe(0)` and `:162` `roleAssignmentCount(internalId)).toBe(0)`. S02, S08 and S27 killed | PASS |
| AC8: a stop between steps is compensated after the grace period | Not before; after, compensated | `withdrawal-compensation.spec.ts:340` and `:341` (before: units out, step `ARMED`), `:345` `toBe(SHELF)`, `:346` `{ status: 'DONE', attempts: 1 }`, `:358`; `registration-compensation.spec.ts:200` and `:201`, `:209` `toBe(0)`, `:219`. S18 and S19 killed | PASS |
| AC9: at the attempt limit, failed and logged with kind, operation id, work order or user, last error | Error level, the four values | `stock-step-applier.spec.ts:234` to `:249` (`status: 'FAILED'`, `log.failures`); `nest-stock-step-log.spec.ts:28` to `:32` (`Stock step WRITE_OFF ${OPERATION_ID} for work order ${WORK_ORDER_ID} failed for good: inventory is busy`, context `StockStepOutbox`); `account-step-applier.spec.ts:186` to `:201`; `nest-account-step-log.spec.ts:56` to `:60`; `stock-step-outbox.spec.ts:217` to `:240`. S16 and S17 killed | PASS |

Status: 53 of 56 criteria match the spec-defined outcome. Gaps: CA-02 AC5 and CA-10 AC6 (findings 1 and 2), CA-03 AC7 (finding 3, minor).

#### Spec-precision gaps

1. The spec does not say in what order the steps of one work order apply when one of them fails and a later one lands first. Its sweep row on concurrency and ordering (`spec.md:71`) names only the version guard and the batch lock. Finding 1 lives in that silence.
2. The Out of Scope table excludes "Database schema changes" (`spec.md:28`) and "Changing domain behavior, aggregates or value objects" (`spec.md:27`). CA-10, approved later, needs two step tables, the `stock_movements.operation_id` column and an operation id on the inventory movements (`stock-movement.ts`), and the user approved the T68 migration.
3. `spec.md:308` reads "Coverage: 9 total, 9 mapped to tasks"; the table above it lists ten requirements.

---

### Edge cases

| Edge case | Spec outcome | Evidence at HEAD | Result |
| --- | --- | --- | --- |
| Seventeen cases unchanged since round 1 (the ten not-found answers, the customer filters, the shortage list, the item in use, the movement history UUIDs, five taken numbers) | As round 1 states them | Round 1's lines hold at HEAD, e.g. `work-order-tracking.e2e.spec.ts:350`, `services.e2e.spec.ts:226`, `inventory-items.e2e.spec.ts:223`, `:539`, `:718`, `vehicles.e2e.spec.ts:322`, `customers.e2e.spec.ts:212`, `:223`, `:321`, `:338`, `users.e2e.spec.ts:183`, `roles.e2e.spec.ts:116`, `work-order-withdrawals.e2e.spec.ts:579`, `create-work-order.use-case.spec.ts:235` | PASS (17) |
| Two concurrent changes, one 409 `CONCURRENT_MODIFICATION` | One 200, one 409 with the code | `work-order-concurrency.e2e.spec.ts:196` `toEqual([200, 409])`, `:198` `code: 'CONCURRENT_MODIFICATION'` | PASS |
| Withdrawal above stock | 422, nothing changed | `work-order-withdrawals.e2e.spec.ts:596` to `:611` | PASS |
| Save fails with 409 after the consumption | Units back, every level as before | `work-order-concurrency.e2e.spec.ts:237` `toEqual([200, 409])`, `:240` withdrawn 3, `:241` `quantityOnHand).toBe(17)` (20 less the winner's 3), `:245` and `:246` two consumptions, one return | PASS |
| The inventory step of a return, delivery or cancellation fails | Work order change kept; step applied on a later attempt | Holds when nothing else lands first: `stock-step-retries.spec.ts:329` to `:350`. Fails for a return when a cancellation or a delivery of the same work order lands first (finding 1, probe) | GAP |
| Customer save fails after the account opened | No user with that email or document | `registration-compensation.spec.ts:249` (`count(*) ... WHERE email = $1 OR document = $2` is 0), `:219` the same email and document register again | PASS |
| Last step after the processor claimed the armed step | 409, nothing saved, compensation applied | `withdraw-parts.use-case.spec.ts:365` to `:373`; `register-customer.use-case.spec.ts:324` to `:329`; `withdrawal-compensation.spec.ts:439` to `:449`; `registration-compensation.spec.ts:290` to `:294` | PASS |
| `POST /customers` links the user opened earlier in the registration | Linked to that user | `registration-compensation.spec.ts:234` `customerOf(registered.userId)).toBe(registered.customerId)`; `customers.e2e.spec.ts:314` (the listed customer carries the user's id); `customer.repository.spec.ts:164` | PASS |
| A subscriber throws | Caller keeps the result; error logged by name | `in-memory-domain-event-dispatcher.spec.ts:105`, `:109` | PASS |

24 of 25 edge cases pass.

---

### Gate check

All commands ran in the real tree against `workshop_test`, as it is (never truncated), with Redis DB 15.

| Step | Exit | Result |
| --- | --- | --- |
| `npm run lint` | 0 | ESLint clean; "no dependency violations found (791 modules, 3622 dependencies cruised)"; "No table ownership violations found (0 known findings ignored)."; "No dependency cycle between modules found (7 modules, 16 dependencies between them)." |
| `npm run build` | 0 | Clean |
| `npm run test:unit` | 0 | 1249 passed (161 files) |
| `npm run test:integration` | 0 | 472 passed (56 files), the metrics spec included |
| `npm run test:e2e` | 0 | 246 passed (19 files), the OpenAPI contract case included |
| `npm run test:coverage` | 0 | Every threshold passed |
| `npx prettier --check README.md docs` | 0 | Docs gate clean |
| `test/e2e/work-order-concurrency.e2e.spec.ts`, 5 isolated runs | 0 each | 6 of 6 tests each run; no flake |
| Control: the three suites on an empty scratch database (`workshop_mut_test`) | 0 | 1249, 472 and 246 passed |

No flake appeared in any run of this round: the full gate, the five isolated runs, the scratch control and the 33 mutant runs (each kill names a test of the mutated behavior). No test is skipped, focused or marked todo.

Test counts: 955, 239 and 203 before the feature (`51a3a8a`); 1114, 342 and 244 at round 1; 1118, 342 and 245 after phase 18; 1249, 472 and 246 at HEAD (+135 unit, +130 integration and +2 e2e since round 1).

The step tables of `workshop_test` held 0 rows before the gate, 0 after it, and 0 after the five isolated runs.

---

### Discrimination sensor

Expanded tier, CA-10 as the critical path. Every mutant ran in a detached `git worktree` of `832bbb6` under the scratchpad, with `node_modules` linked and `.env.test` set to `DATABASE_NAME=workshop_mut_test` and `REDIS_DB=13`. Before each run the scratch database was recreated (the global setup migrates it) and Redis DB 13 emptied; M12, W3b and W3c ran on a scratch database already holding the seed's demo rows, the state round 1 found in `workshop_test`. Each mutation is an exact text replacement that refused to apply when its target was missing. Suites ran unit, then integration, then e2e; the first failing suite killed the mutant. Nothing touched `workshop` or `workshop_test`.

| # | File:line | Mutation | Result |
| --- | --- | --- | --- |
| S01 | `src/modules/work-orders/application/commands/withdraw-parts/withdraw-parts.use-case.ts:71` | Consumption moved inside the work-orders transaction | KILLED (unit, 5 tests) |
| S02 | `src/modules/customers/application/commands/register-customer/register-customer.use-case.ts:105` | Account opened inside a customers transaction | KILLED (unit, 4) |
| S03 | `src/modules/work-orders/application/commands/return-parts/return-parts.use-case.ts:64` | Restore step applied inside the transaction, before the commit | KILLED (unit) |
| S04 | `src/shared/infrastructure/database/typeorm-transaction-runner.ts:42` | `run` no longer refuses to nest | KILLED (integration, 5: `transaction-runner-nesting`, `stock-use-case-transactions`) |
| S05 | `withdraw-parts.use-case.ts:81` | Disarm result ignored, so a claimed step answers no 409 | KILLED (unit) |
| S06 | `src/modules/work-orders/infrastructure/persistence/typeorm-pending-stock-steps.ts:80` | Disarm also takes a step a claim made pending | KILLED (integration: adapter, withdrawal 409) |
| S07 | `withdraw-parts.use-case.ts:102` | A failed undo replaces the first error | KILLED (unit, 2) |
| S08 | `register-customer.use-case.ts:128` | No compensation when a later step fails | KILLED (unit, 4) |
| S09 | `src/modules/inventory/infrastructure/persistence/typeorm-inventory-item.repository.ts:148` | Undo returns only consumptions still `PENDING` | KILLED (integration: settled and written-off cases) |
| S10 | `src/modules/inventory/application/commands/restore-stock-batch/restore-stock-batch.use-case.ts:37` | Restore applies again under an operation id that already tags a return | KILLED (unit, 2) |
| S11 | `typeorm-inventory-item.repository.ts:241` | Write-off updates every candidate, pending or not | KILLED (integration: interleaved and concurrent write-offs) |
| S12 | `src/modules/identity/users/application/commands/discard-opened-account/discard-opened-account.use-case.ts:21` | Discard skips the session check | KILLED (unit) |
| S13 | `typeorm-pending-stock-steps.ts:38` | Claim without `SKIP LOCKED` waits for a held step | KILLED (integration: the 3 s bound in the adapter spec) |
| S14 | `typeorm-pending-stock-steps.ts:41` | Claim keeps the due time, so it takes no lease | KILLED (integration, 5) |
| S15 | `src/modules/work-orders/application/services/stock-step-applier.ts:102` | Delay read one slot later (5 s after the first failure) | KILLED (unit, 11) |
| S16 | `stock-step-applier.ts:96` | Attempt limit reached one attempt late | KILLED (unit) |
| S17 | `src/modules/work-orders/infrastructure/outbox/nest-stock-step-log.ts:11` | AC9 line without the operation id | KILLED (unit) |
| S18 | `withdraw-parts.use-case.ts:66` | Undo step armed due now, no grace period | KILLED (unit) |
| S19 | `register-customer.use-case.ts:100` | Discard step armed due now, no grace period | KILLED (unit) |
| S20 | `stock-step-applier.ts:58` | Claim lease that ends at once | KILLED (unit) |
| S21 | `src/modules/inventory/application/commands/undo-consumption/undo-consumption.use-case.ts:43` | Undo trusts its first, unlocked read | KILLED (unit) |
| S22 | `typeorm-inventory-item.repository.ts:198` | Settlement closes consumptions of any status | SURVIVED (1249 unit, 472 integration, 246 e2e pass) |
| S23 | `withdraw-parts.use-case.ts:115` | A failed undo is not handed to the processor | KILLED (unit) |
| S24 | `stock-step-applier.ts:52` | The attempt after the commit lets its failure reach the request | KILLED (unit, 5) |
| S25 | `src/modules/work-orders/infrastructure/outbox/stock-step-processor.ts:33` | Processor skips its run at bootstrap | KILLED (unit, 5) |
| S26 | `typeorm-pending-stock-steps.ts:66` | Enqueue writes outside the caller's transaction | KILLED (integration: adapter, `work-order-step-transaction`) |
| S27 | `register-customer.use-case.ts:157` | A failed discard replaces the first error | KILLED (unit, 2) |
| M07 | `.dependency-cruiser.cjs:71` | `through-public-api` accepts any file at a module's root | KILLED (unit, 2: `dependency-rules.spec.ts:94` and `:102`) |
| M12 | `scripts/seed.ts:321` | Seed books no opening stock (database holding the demo rows) | KILLED (integration, 2: seed spec) |
| W1 | `src/modules/work-orders/application/commands/remove-work-order-item/remove-work-order-item.use-case.ts:31` | Removal never saved | KILLED (e2e: `work-orders.e2e.spec.ts:258`) |
| W2 | `src/modules/work-orders/application/commands/plan-part/plan-part.use-case.ts:33` | Quantity checked after the catalog read | KILLED (unit: `plan-part.use-case.spec.ts:177` and `:178`) |
| W3b | `src/modules/vehicles/application/commands/register-vehicle/register-vehicle.use-case.ts:39` | Year stored as the one before (database holding the demo rows) | KILLED (unit: `register-vehicle.use-case.spec.ts:59`) |
| W3c | `register-customer.use-case.ts:78` and `:115` | Phone validated but not stored (database holding the demo rows) | KILLED (unit: `register-customer.use-case.spec.ts:161`) |

The sensor depth is expanded. 33 mutants ran: 27 on phase 19's code (26 killed, S22 survived) and the six round 1 survivors (all six killed). The sensor fails on S22.

#### Probe: a retried restore after the work order closed

This is a scenario on the unmutated code, run in the same scratch worktree and database (a throwaway spec built from the helpers of `stock-step-retries.spec.ts`, removed with the worktree). On the real adapters: stock 10, a consumption of 3, a return of 2 enqueued as a `RESTORE` step whose first attempt meets an inventory that fails (`applyAfterCommit` on a ledger failing once), then a `WRITE_OFF` (or a `SETTLE`) of the same work order applied at once, then the processor run past the wait twice.

| Closing step | Restore step after two retries | Stock | Ledger and transitions |
| --- | --- | --- | --- |
| `WRITE_OFF` | `PENDING`, 3 attempts, last error `No pending consumption covers a return of 2 on item ... for work order ...` | 7, where 9 was due | `CONSUMPTION 3 WRITTEN_OFF`; transition `WRITTEN_OFF` quantity 3, where 1 was outstanding |
| `SETTLE` | `PENDING`, 3 attempts, same error | 7, where 9 was due | `CONSUMPTION 3 SETTLED`; transition `SETTLED` |

Cause: `RestoreStockBatchUseCase` draws from `PENDING` consumptions only (`typeorm-inventory-item.repository.ts:117`, error at `restore-stock-batch.use-case.ts:70`), and the claim orders steps by due time alone (`typeorm-pending-stock-steps.ts:36`). Once a restore has failed, the next step of the same work order can land first, and every later attempt of the restore fails until the attempt limit marks it failed. The flows reach this order: a cancellation is allowed in execution, right after a return, and a delivery after a completion. During an inventory outage both steps fail, and on recovery the one with the shorter wait, often the closing step, applies first. Before phase 19 the shared transaction committed the restore with the return, so the order could not invert.

The real tree's `git status --porcelain` was empty before the sensor and empty after it. The worktree was removed and pruned, `workshop_mut_test` dropped, Redis DB 13 emptied (`DBSIZE` 0), and no `workshop_seed_*` database was left. No `git stash` was used.

---

### Adversarial review

#### Races between a request and the processor

- Disarm against a claim: the claim is one `UPDATE` over a `FOR UPDATE SKIP LOCKED` selection (`typeorm-pending-stock-steps.ts:31` to `:46`). A disarm that runs while a claim holds the row waits, then finds the step `PENDING` and answers false (adapter spec `work-order-stock-steps.adapter.spec.ts:261` to `:276`, and its account twin); a claim that meets a disarmed row in flight skips it (`:494` to `:527`); two claims never share a step (`:529` to `:545`). S05, S06, S13 and S14 die.
- The request compensates without claiming. Two undos of one operation return the units once (`stock-operation-steps.spec.ts:357` to `:372`), because the undo reads again under the item lock (S21 dies). A discard of a user already gone does nothing.
- The case ADR 0033 leaves to an operator (`docs/adr/0033-writes-across-modules-run-as-steps.md:48`) concerns the withdrawal. The registration has the same case: a request that stalls past the grace period between arming and opening, whose own discard then fails, leaves an account with no step to retry it, since `release` touches only an armed step. ADR 0033 does not name it. Observation.
- Steps of one work order applied out of order: finding 1.
- Each module queries only its own tables: lint passes with both step tables mapped; the stock claim joins `work_orders`, its own table; the account steps store the user as a plain uuid with no join; `TypeOrmSessionRepository.existsByUserId` joins `sessions` and `users`, both owned by `identity`.

#### The teardown and the never-truncate convention

- `test/support/global-setup.ts:42` and `:46` delete `WHERE status = 'DONE' AND created_at >= $1`, with `$1` taken after the migrations ran (`:23`). The adapters write `created_at` from the injected clock (`typeorm-pending-stock-steps.ts:167`, `typeorm-pending-account-steps.ts:57`), which is the system clock in every application a test starts. The two adapter specs that use a fake clock write 2001 timestamps, which the teardown never matches, and remove their own rows by operation id. So the teardown cannot delete an `ARMED`, `PENDING` or `FAILED` step, or a step created before the run started.
- The teardown reads the database name of `.env.test` in the main vitest process (`global-setup.ts:19`), after the `_test` guard; the seed spec changes `DATABASE_NAME` only inside the test fork, so it cannot point the teardown elsewhere.
- One edge: a `DONE` step that another process writes into `workshop_test` while a run is going, such as a second suite started in parallel, also matches the rule. Observation.
- The convention holds. The only `TRUNCATE` is `money_roundtrip_check` (`test/integration/money.roundtrip.spec.ts:21`), which predates the feature. Every other delete targets the spec's own rows (by operation id, user id or work order) or a window of due dates only fake clocks use (`work-order-stock-steps.adapter.spec.ts:30`, before 2002; `stock-step-outbox.spec.ts:29`, March 2002; and their account twins).

#### The docs

- ADR 0033 against the T75 bullets: the context (`:10` to `:14`: four stock flows in one shared transaction, the registration nested and committed first), the decision (`:18` to `:30`, with the request's own compensation and the 409 on a claimed step at `:24`), the alternatives (`:34` shared transaction, `:36` compensation without an outbox), the consequences (`:46` the race of a cancellation or a delivery with a withdrawal and the amended e2e assertion, `:48` the case left to an operator) and the `Source` line naming AD-017 (`:5`). ADR 0023 changes only its status line; the index lists 0033 and the new status of 0023 (`docs/adr/README.md:54`, `:64`).
- README counts: 20 domain tables and ten migrations (`README.md:390` and `:391`), which match the ten migration files and the 20 domain tables of `scripts/architecture/table-owners.ts`. The environment table lists the three settings with 5000, 300 and 10 (`README.md:377` to `:379`), the defaults of `src/config/env.validation.ts:22` to `:24`, `src/config/outbox.config.ts:4` to `:6` and `.env.example:30` to `:32`.
- The T75 grep (`grep -rniE "same transaction|shared transaction" README.md docs/architecture`) finds five lines, all about writes within one module: the trail (`README.md:129`, `docs/architecture/low-level-design/work-orders.md:158`, `docs/architecture/c4-components-workshop-operations.mmd:27`) and the role assigned at registration (`docs/architecture/c4-components-identity-and-access.mmd:78`, `docs/architecture/low-level-design/identity/README.md:19`).
- No tracked document mentions microservices or a future migration of the system. ADR 0001 says "Distributed services and a layerless single module are the obvious alternatives, and neither was written down as considered" (`docs/adr/0001-modular-monolith-with-cqrs.md:29`); the sentence is present at `51a3a8a` and sits in a body that stays as decided, so it is reported for the user's decision and not counted against this feature. `docs/roteiro-video.md` is ignored by git.

---

### Code quality

| Check | Status |
| --- | --- |
| No features beyond what was asked | Pass. `AccountInUseError`, the session pre-check and the outbox settings are named by T70 and T71 |
| No abstractions for single-use code | Pass. One outbox per module, with the duplication design C16 accepts |
| No unnecessary flexibility | Pass |
| Only touched files the tasks required | Pass. `work-order-number.factory.ts` and `45a0c12` are recorded test fixes |
| Did not "improve" unrelated code | Pass |
| Matches existing patterns and style | Pass. `findPendingConsumptionsOfOperation` reads consumptions of every status while its name says pending; its comment explains it |
| Tests map to criteria and are not shallow | Pass with gaps: findings 1 and 2 |
| Spec-anchored outcome check | 53 of 56; gaps CA-02 AC5, CA-03 AC7, CA-10 AC6 |
| Per-layer coverage expectation | Pass for the applier on fakes (every kind, the delays, the limit) and for the adapter and processor on the database (claims, repeats, recovery past the grace period). No case covers two steps of one work order applied out of order, or a repeated settlement |
| Every test maps to a requirement | Pass |
| Documented guidelines followed | `.specs/STATE.md` Conventions, the Test Coverage Matrix, the `vitest.config.ts` thresholds. The never-truncate convention holds |

---

### Fix plans

#### Fix 1 (Major): a retried restore must still apply after a later step of its work order

Root cause in the probe section. The design is the user's choice; two shapes fit the code:

- Apply the stock steps of one work order in the order they were recorded: a claim skips a step while an earlier step of the same work order is still pending, so a write-off or a settlement waits for the restore before it.
- Or have the settle and write-off steps first apply the older pending restores of their work order, and fail (to be retried) while one of them still fails.

Fix task: implement the chosen order in `work-orders` (claim or applier), add a sentence on ordering to `spec.md` (the Concurrency and ordering row, and an edge case), and add an integration case that fails a restore's first attempt, then applies a cancellation, and separately a delivery, of the same work order, then runs the processor past the wait. Done when both cases end with the returned units on the shelf (9 of 10 in the probe's numbers), the write-off transition counts only the units still outstanding (1), and every step is `DONE`.

#### Fix 2 (Major): a settlement applied twice records its transitions once

Fix task: add an integration case that settles one work order twice through `SettleStockMovementsUseCase` on the real repository, one run after the other and two runs at once (the shape of `stock-operation-steps.spec.ts:473` and `:505`), and expects one `SETTLED` transition per consumption. Done when S22 (`typeorm-inventory-item.repository.ts:198` without `AND status = 'PENDING'`) fails a suite.

#### Fix 3 (Minor): the spec text and the approved CA-10 scope

Fix task: amend CA-03 AC7 to allow the CA-10 migration under `src/shared/infrastructure/database/migrations/` (or record the deviation in `.specs/STATE.md`), annotate the two Out of Scope rows for CA-10's tables and the operation id on stock movements, and correct `spec.md:308` to ten requirements. Done when the spec and the tree agree.

Observations that need no fix in this feature: the registration's stalled case that ADR 0033 does not name; the teardown's match on another process's `DONE` steps during a run; the ADR 0001 sentence on distributed services.

---

### Requirement traceability update

Proposed for `spec.md`; the orchestrator applies it.

| Requirement | Previous status | New status |
| --- | --- | --- |
| CA-01 | In Tasks | Verified |
| CA-02 | In Tasks | Needs fix (AC5, Fix 1) |
| CA-03 | In Tasks | Needs fix (AC7 text, Fix 3) |
| CA-04 | In Tasks | Verified |
| CA-05 | In Tasks | Verified |
| CA-06 | In Tasks | Verified |
| CA-07 | In Tasks | Verified |
| CA-08 | In Tasks | Verified |
| CA-09 | In Tasks | Verified |
| CA-10 | In Tasks | Needs fix (edge case at `spec.md:279`, Fix 1; AC6 evidence, Fix 2) |

---

### Summary

| Area | Result |
| --- | --- |
| Overall | Not ready |
| Spec-anchored check | 53 of 56 criteria match; 3 spec-precision gaps; 24 of 25 edge cases |
| Sensor | 33 mutants: 32 killed, S22 survived; the six round 1 survivors all die; one probe fails on the unmutated code |
| Gate | Lint, build, unit (1249), integration (472), e2e (246, contract included), coverage and docs pass on `workshop_test`; the concurrency file passes 5 of 5 isolated runs |

Phase 18 closed every finding of round 1. Phase 19 keeps each module's transaction on its own tables, refuses a nested transaction, compensates the withdrawal and the registration at once or through the outbox, and retries the other three flows with the delays and the limit the design sets. The remaining defect is the order of a work order's steps after a failure, plus one missing repeat test.

Next: Fixes 1 and 2 as fix tasks and Fix 3 as a spec amendment, then round 3, the last before escalation.

---

### Lessons

`lessons.py` recorded three candidates from this round: L-023 (finding 1, the order of retried steps), L-024 (S22, a repeat through the real adapter) and L-025 (spec-precision gap 1, the spec states the order). The CA-03 AC7 gap and spec-precision gaps 2 and 3 produced no lesson: keeping the spec text in step with an approved change of scope is a rule about running the workflow, which the lessons layer leaves out, as round 1 decided for its own CA-03 AC7 gap. No confirmed lesson recurred, so none was penalized; L-017 to L-022 from round 1 saw no repeat.

---

# Round 1 history (2026-10-29)

Round 1's report follows as it was written. It is history: the verdict above governs.

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
