# Architecture Documentation Validation

**Date**: 2026-09-02
**Spec**: `.specs/features/architecture-documentation/spec.md`
**Diff range**: round 1 `4834607~1..c9b1c50` (37 commits); round 2 `4834607~1..ec8c6e4` (38 commits,
`4834607` is the spec commit, `ec8c6e4` the fix commit)
**Verifier**: independent sub-agent (author ≠ verifier), a different agent in each round
**Rounds**: 2 of a maximum 3

**Round 2 verdict: PASS.** All three round 1 gaps are closed. Each was re-checked against the
migration SQL rather than against the author's claim, and none of the three fixes introduced a new
error. The same check was then widened from the four tables that were wrong to all eighteen: every
documented column table now matches the union of its `CREATE TABLE` body and every later
`ALTER TABLE ... ADD COLUMN`, in name, type and order. 168/168 internal links resolve, `docs/` is
Prettier-clean, and the gate is unchanged at 1062 passing tests. ARCH-03 moves to Verified, and with
it every criterion in the spec.

**Round 1 verdict: FAIL**, kept below for the record. Three confirmed factual errors in the low
level design column tables, all against ARCH-03 criterion 3. Everything else in the feature passed,
including every structural criterion, every route table, the guard chain, the error mapping, all 168
internal links and the full build gate at 1062 tests. The three defects were localised to four
column tables out of the eighteen the set carries, and each was a one-block edit.

---

## Task Completion

All 32 tasks are marked `[x]` in `tasks.md`, each with closure notes, and each has a commit in the
range. Verified by matching `git log --oneline 4834607~1..HEAD` against the `**Commit**:` line of
every task: 32 task commits plus 3 planning commits, no task without a commit and no commit
without a task.

| Task group | Status | Notes |
| --- | --- | --- |
| T1-T9 (25 ADRs, index, plan section 7) | ✅ Done | Content verified below; numbering, sections, statuses and provenance all confirmed |
| T10-T14 (overview, HLD, C4 levels 1-2, event storming section 15) | ✅ Done | Every sampled claim matched the code |
| T15-T29 (9 LLD pages, 5 component diagrams, index) | ✅ Done | Round 1: `work-orders.md` and `inventory.md` carried column-table errors. Round 2: closed by `ec8c6e4`, all 18 tables now exact |
| T30-T31 (consistency pass, README) | ✅ Done | 168/168 links resolve, README Prettier-clean |
| T32 (Swagger review) | ✅ Done | 72/72 routes carry a summary, 58/58 gated routes document a 403, no behaviour changed |
| F1-F3 (fix tasks from round 1) | ✅ Done | One commit, `ec8c6e4`, three block edits in two files, no source file touched |

---

## Spec-Anchored Acceptance Criteria

Every criterion in this spec was written as a structural fact, so each was confirmed mechanically
(`ls`, `grep`, file tests, counting, and a parser cross-checking documents against the code) rather
than by reading. The counts in the third column were re-derived from the source, not taken from the
documents.

### ARCH-01: The decisions become findable

| Criterion | Spec-defined outcome | Evidence | Result |
| --- | --- | --- | --- |
| 1. `docs/adr/` holds 25 records `0001`-`0025`, no gap, no duplicate | exactly 25, contiguous | `ls docs/adr/[0-9]*.md` → 25 files; sorted 4-char prefixes `diff` clean against `printf '%04d' 1..25` | ✅ PASS |
| 2. Named `NNNN-<kebab-case-title>.md`, matching section 10's subject for `0001`-`0022` | filename pattern + subject match | 25/25 match `^[0-9]{4}-[a-z0-9]+(-[a-z0-9]+)*\.md$`; 22/22 subjects match `implementation-plan.md:1259-1282`, 19 verbatim and 3 (`0002`, `0009`, `0013`) trivial wording variants naming the same subject | ✅ PASS |
| 3. Context, Decision, Alternatives, Consequences, each its own section | 4 sections per record | 25/25 records return `ctx=1 dec=1 alt=1 con=1` on `grep -c '^## <Section>$'` | ✅ PASS |
| 4. Exactly one status from `Accepted`, `Superseded by NNNN`, `Deprecated` | one status line, fixed vocabulary | 25/25 return `status=1`; 24 `Accepted`, 1 `Superseded by [0018](...)` | ✅ PASS |
| 5. A reversal is a new number; the reversed record marked, not edited or deleted | `0025` marked, `0018` written new | `0025-*.md:3` `**Status**: Superseded by [0018]`; `0018-*.md:4` `**Supersedes**: [0025]`; `0025`'s Consequences state it is not in force and keep the original Decision verbatim | ✅ PASS |
| 6. `0002` justifies PostgreSQL on the four named grounds | relational integrity; cross-aggregate transaction; partial unique indexes; `bigint` cents | `0002-postgresql-as-the-relational-database.md:26,32,38,46` - each ground is its own bolded paragraph; the index predicate it quotes matches `1787702400006-create-work-orders-schema.ts:35` verbatim | ✅ PASS |
| 7. `0023` records AD-008, the `currentEntityManager()` rule | rule stated, AD-008 named | `0023-*.md` `**Source**: AD-008 in .specs/STATE.md`; rule confirmed against `typeorm-transaction-runner.ts` and the six handlers found by `grep -rl TRANSACTION_RUNNER src/modules/*/application/commands/` | ✅ PASS |
| 8. `0024` records AD-009, the version guard and its 409 | guard + 409 | `0024-*.md:21,23`; code at `typeorm-work-order.repository.ts:176-182` (`version: () => 'version + 1'`, `.where('id = :id AND version = :version')`, `ConcurrentModificationError`), mapped at `global-exception.filter.ts:12` `[ErrorKind.Conflict]: HttpStatus.CONFLICT` | ✅ PASS |
| 9. `0025` records the superseded budget deviation rule, status `Superseded by 0018` | status + original Why + original rejected alternative | `0025-*.md:3,28,32`; the reversal it names is confirmed at `work-order.ts:497` (`assertStateAllows([InExecution])`) and `:506` (`status = AwaitingApproval`) | ✅ PASS |
| 10. A record matching an `AD-NNN` names it; the log entry stays unchanged | 10 `Source` lines, log untouched | 10 records carry `**Source**` naming AD-001..AD-009 (AD-004 twice), 15 carry none, matching design.md's provenance table exactly; `git diff 4834607~1..HEAD -- .specs/STATE.md` is +9/-0, the 9 lines being the new AD-010 that design.md proposed for approval | ✅ PASS |
| 11. `docs/adr/README.md` lists every record by number, title and status, with no decision text | 25 rows, index only | `README.md:35-59`; a parser confirms 25 rows, every link resolving, and every row's title string-identical to the linked file's `H1` | ✅ PASS |
| 12. Plan section 7 holds only an index; the stale subscriber block is gone | index rows, no decision prose | `implementation-plan.md:1119-1160`; `grep -c "subscriber failure loses an entry"` → 0; all 15 `../adr/` links resolve. The section keeps two navigational notes flagging the two reversals, which is index apparatus rather than decision prose | ✅ PASS |

### ARCH-02: The system explains itself in two pages and two diagrams

| Criterion | Spec-defined outcome | Evidence | Result |
| --- | --- | --- | --- |
| 1. Overview: what it is, 4 actors, 5 contexts, 3 runtime pieces, constraints | all five present | `architecture-overview.md:8,22,39,56,66`; the 4 actors and 5 contexts match `event-storming.md:56-64` and `:134-142`, with `System` excluded and the reason given at `:24-26` | ✅ PASS |
| 2. Overview carries no module internals, schema or endpoint list | zero occurrences | `GET /`, `POST /`, `bigserial`, `CREATE TABLE`, `src/modules/`, `varchar(` all return 0; `:94` points at the HLD and the LLD index | ✅ PASS |
| 3. HLD: modules, communication, CQRS wiring, guard chain in run order, cross-module transactions, conventions | all six present, guard order correct | `high-level-design.md:76-84` lists `ThrottlerGuard`, `JwtAuthGuard`, `PendingPasswordGuard`, `PermissionsGuard`, matching the `APP_GUARD` declaration order at `app.module.ts:89-92` exactly | ✅ PASS |
| 4. HLD carries no per-class or per-column detail, no domain narrative | zero occurrences | `varchar`, `CREATE TABLE`, `ON DELETE` all 0; `:92` and `:157` point down and out | ✅ PASS |
| 5. `c4-system-context.mmd` is `C4Context`, 4 actors, 1 system, no external system | 4 `Person`, 1 `System`, 0 `System_Ext` | first directive `C4Context`; 4 `Person()`, 1 `System()`, 0 `System_Ext()` | ✅ PASS |
| 6. `c4-containers.mmd` is `C4Container` carrying the app, PostgreSQL and Redis | 3 containers | first directive `C4Container`; `Container(app)`, `ContainerDb(postgres)`, `ContainerDb(redis)`; ports 13000/5432/6379 match `docker-compose.yml` | ✅ PASS |
| 7. Event storming section 15 points at the overview | pointer, not a restatement | `event-storming.md:973-1005`; a 4-row "where it is now" table plus the two stale claims corrected in place with links to `0021` and H18 | ✅ PASS |
| 8. Every statement in these two matches the code, each citing a file or directory | sampled | Six independent samples, all confirmed: guard order (`app.module.ts:89-92`), the `ErrorKind`→status table (all 6 rows match `global-exception.filter.ts:8-13`), the "six handlers open a transaction" count (`grep -rl TRANSACTION_RUNNER` returns exactly 6), subscribers in `application/subscribers`, the layering rules quoted from `eslint.config.mjs`, and the TTL pointer at the authorization page | ✅ PASS |

### ARCH-03: Every module has a design page and every context a component diagram

| Criterion | Spec-defined outcome | Evidence | Result |
| --- | --- | --- | --- |
| 1. Nine pages under `low-level-design/`, the eight modules plus `shared` | exactly nine | 9 pages present, named for the 8 module directories plus `shared` | ✅ PASS |
| 2. Every page maps to a real directory and every directory has exactly one page | bidirectional 1:1 | `ls src/modules` + `shared` `diff`ed against the page basenames: identical, no orphan page, no undocumented unit | ✅ PASS |
| 3. Each page covers aggregates and invariants, value objects, commands and handlers, queries and ports, repository and mapper, ORM entities and columns, endpoints, errors and HTTP mapping | every column of every entity | **Route tables: 9/9 exact.** A parser compared every documented route against its controller: 72 documented, 72 in the controllers, no route missing and none invented, permissions included. **Column tables: 14/18 exact, 4 defective.** See Gaps 1-3 | ❌ GAP |
| 4. A page describes nothing another module owns and states no decision, pointing at the ADR | cross-references, not restatements | Sampled `users.md`, `authorization.md`, `work-orders.md`, `inventory.md`, `shared.md`: each links the owning ADR (`0010`, `0012`, `0019`, `0021`, `0023`, `0024`) instead of restating the reasoning | ✅ PASS |
| 5. The index lists the nine pages, states what the level owns, carries no module detail | nine rows plus scope rules | `low-level-design/README.md:6-16` (9 rows), `:18-36` (owns / does not own / cites), `:44` records the read commit `875f073` | ✅ PASS |
| 6. Five component diagrams, one per context, named `c4-components-<context>.mmd` | exactly five | 5 files present, named for the 5 contexts in design.md's mapping table | ✅ PASS |
| 7. Each shows controllers, handlers, aggregates, repositories and ports, and every crossing | all five element kinds plus crossings | Sampled `c4-components-workshop-operations.mmd`: controller (22 routes), 2 handler groups, aggregate, repository, 2 query ports, and 6 `cross-module` relations against 5 `Component_Ext`. The "22 routes", "seven statuses" and the 5 table names on its `ContainerDb` all match the code | ✅ PASS |
| 8. A multi-module context shows each module as its own boundary: Identity & Access reads as three, Customer Management as two | 3 and 2 | `c4-components-identity-and-access.mmd`: 3 `Component_Boundary` (`users`, `authentication`, `authorization`); `c4-components-customer-management.mmd`: 2 (`customers`, `vehicles`) | ✅ PASS |

### ARCH-04: The documents stop repeating each other

| Criterion | Spec-defined outcome | Evidence | Result |
| --- | --- | --- | --- |
| 1. Every statement in two documents reduced to one, per section 10's ownership table | one home per fact | Two reductions confirmed: the effective access key and TTL (`high-level-design.md:92` now points at the authorization page) and the ambient transaction mechanism (`shared.md` names the classes, `0023` keeps the rule). One residual pair remains, see Observation 2 | ⚠️ Spec-precision gap |
| 2. Every internal link across `docs/` resolves | zero broken | Independent parser over every `.md` and `.mmd` under `docs/` plus `README.md`: **168 internal links, 0 broken** | ✅ PASS |
| 3. README's Architecture section links the four entry points | four links, all resolving | `README.md` Architecture table links `architecture-overview.md`, `high-level-design.md`, `low-level-design/README.md`, `adr/README.md`; all four in the 168 above | ✅ PASS |
| 4. A document the code contradicts is corrected, and the correction named in the closure notes | corrected, not silent | `event-storming.md:740-745` annotates H2; recorded in T30 closure note 3, which also flags it as a scope exception. The correction's own claim verified at `work-order.ts:497,506` | ✅ PASS |
| 5. The two DDD documents stay the source of truth, edited only where sections 7 and 15 instruct | two hunks | `git diff 4834607~1..HEAD -- docs/ddd/` shows exactly three hunks: `@@ -737` (H2), `@@ -966` (section 15), `@@ -1118` (section 7). Nothing else in either file changed | ⚠️ Disclosed exception, judged justified below |

### ARCH-05: Swagger describes every route as it behaves

| Criterion | Spec-defined outcome | Evidence | Result |
| --- | --- | --- | --- |
| 1. Every route across the ten controllers carries an operation summary | 72/72 | Parser over all 10 controllers: 72 routes, 0 missing `@ApiOperation` with a `summary` | ✅ PASS |
| 2. Every route documents each status it can answer with, error statuses included | per route | Spot-checked across `roles`, `users`, `customers` and `work-orders`: each route carries its success response plus `@ApiNotFoundResponse` / `@ApiConflictResponse` / `@ApiUnprocessableEntityResponse` as its handler can raise | ✅ PASS |
| 3. Every permission-gated route documents the 403 its gate produces | 58/58 | Parser: 58 routes carry `@RequirePermissions`, **0 of them lack a 403**. The 15 that were missing one are the T32 diff | ✅ PASS |
| 4. An annotation that misstates a route is corrected to match the behaviour | corrections only in that direction | The two changed annotations are the budget decision routes' descriptions (`work-orders.controller.ts:396-402,419-425`), which now state the owner-or-permission rule and the 404. Confirmed against `budget-decision.authorizer.ts`, which throws `WorkOrderNotFoundError` | ✅ PASS |
| 5. No route behaviour, DTO shape or test changed | annotations only | `git diff 4834607~1..HEAD --name-only` matches no `*.spec.ts`, no `test/`, no DTO. The 9 controller files show only `@ApiForbiddenResponse` additions and the 2 description edits | ✅ PASS |

**Status**: ❌ 1 AC with confirmed gaps (ARCH-03 #3), 1 spec-precision gap flagged (ARCH-04 #1),
1 disclosed and justified scope exception (ARCH-04 #5). 35 of 38 criteria pass with evidence.

---

## Discrimination Sensor

**Not applicable. Documentation feature, no behaviour to mutate.** Unchanged in round 2: `ec8c6e4`
edits two markdown files and touches no source, so the ruling below carries over verbatim.

This is the reason spec.md records in Out of Scope and in Assumptions, and it is the user's explicit
decision, not an omission by the author or a shortcut by the Verifier. Injecting a fault into a
markdown file produces a wrong sentence, and a wrong sentence is what human review is for; calling
the resulting nonsense a killed mutant would be theatre. The one part of this feature that touches
`src/` is T32, which adds Swagger decorators that no test asserts on and that change no behaviour,
so there is nothing there to mutate either.

**What replaced it.** Every acceptance criterion was written as a structural fact and confirmed
mechanically. Beyond the criteria, three parsers were run as an independent accuracy probe over the
feature's real risk, which is a document that states something the code does not do:

| Probe | Scope | Result |
| --- | --- | --- |
| Internal link resolution | every `.md` and `.mmd` under `docs/`, plus `README.md` | 168 links, 0 broken |
| Documented route tables vs the controllers | all 8 module pages, all 10 controllers | 72 routes, 8/8 tables exact |
| Documented column tables vs the migrations | all 18 entity blocks across 9 pages | 14/18 exact, **4 defective → Gaps 1-3** |

The third probe is what found this report's gaps, which is the sensor's job done by other means.

**Sensor depth**: not applicable (documentation)
**Result**: N/A - structural and factual confirmation used instead, and it discriminated

---

## Independently Re-derived Counts

Every count the documents claim was recounted from the source rather than trusted.

| Claim | Where claimed | Re-derived | Match |
| --- | --- | --- | --- |
| 8 modules | LLD index, HLD | `ls src/modules` → 8 | ✅ |
| 10 controllers | T30, T32 | `find src -name '*.controller.ts'` → 10 | ✅ |
| 72 routes | T32 closure note | parser over the 10 controllers → 72 | ✅ |
| 9 migrations, `…000` to `…008` | ADR 0002, design.md | `find src -path '*migrations*'` → 9, contiguous | ✅ |
| 25 ADRs | index, T7 | 25 files, `0001`-`0025` | ✅ |
| 16 work order write handlers | `work-orders.md`, HLD | `ls src/modules/work-orders/application/commands` → 16 | ✅ |
| 22 work order routes | `work-orders.md`, the component diagram | 22 method decorators in the controller | ✅ |
| 27 error codes in work-orders | T26 closure note | `grep -rh 'readonly code = ' src/modules/work-orders/` → 27 | ✅ |
| 6 handlers open a cross-module transaction | HLD:109 | `grep -rl TRANSACTION_RUNNER src/modules/*/application/commands/` → 6 | ✅ |
| 7 work order statuses | component diagram, `work-orders.md` | `WorkOrderStatus` enum → 7 | ✅ |
| 27 columns on `work_orders`, 12 from `…008` | T26 closure note | 15 from `…006` + 12 from `…008` = 27 | ✅ (the note is right; the page is not - see Gap 1) |
| 1062 tests, 640/228/194 | T32, spec Success Criteria | gate run → 640 + 228 + 194 = 1062 | ✅ |

---

## Sampled Factual Claims

Ten claims from different pages, each checked against the code. This is the feature's real risk
surface, so it was sampled harder than the criteria required.

| # | Claim | Page | Checked against | Result |
| --- | --- | --- | --- | --- |
| 1 | Guard order is `ThrottlerGuard`, `JwtAuthGuard`, `PendingPasswordGuard`, `PermissionsGuard` | `high-level-design.md:81-84` | `app.module.ts:89-92`, declaration order | ✅ Exact |
| 2 | The `users` table's 11 columns with their types and three indexes | `users.md:66-79` | `1787702400000:8-29` | ✅ Exact, including `chk_users_status` and both `WHERE deleted_at IS NULL` predicates |
| 3 | The 9 `users` routes and their permissions | `users.md:85-95` | `users.controller.ts:72-202` | ✅ Exact, including `me` declared before `:externalId` |
| 4 | 8 user error codes and their statuses | `users.md:101-110` | the 8 files in `users/domain/errors/` | ✅ Exact, code strings identical |
| 5 | `ux_work_orders_active_vehicle ... WHERE status NOT IN ('DELIVERED','CANCELED')` | `adr/0002:38`, `work-orders.md:148` | `1787702400006:35` | ✅ Verbatim |
| 6 | `ux_customers_user_id` is the one unique index deliberately not filtered by `deleted_at` | `customers.md` | `1787702400002:26-30`, including the migration's own comment | ✅ Exact |
| 7 | `authz:access:${userId}`, 60 second TTL | `adr/0003:20`, `authorization.md:69` | `redis-access-cache.ts:7,26,34` | ✅ Exact |
| 8 | `WHERE id = :id AND version = :loadedVersion` producing a 409 | `adr/0024:21-23` | `typeorm-work-order.repository.ts:176-182`, `global-exception.filter.ts:12` | ✅ Semantically exact (see Observation 1 on the bind name) |
| 9 | `AggregateRoot` exposes a non-draining read beside `pullDomainEvents` for the trail | `adr/0021`, `shared.md` | `aggregate-root.ts:10-22`, with the same reason in its own comment | ✅ Exact |
| 10 | The metrics adapter filters with `EXISTS` rather than a join, to avoid corrupting the average | `work-orders.md:108`, component diagram | `typeorm-work-order-metrics-query.adapter.ts:14-17,31` | ✅ Exact |

Ten of ten sampled prose claims hold. The defects are confined to column tables, which is why the
mechanical sweep over all 18 of them was the probe that mattered.

---

## The Two Items the Author Flagged

### T30's H2 annotation: a justified exception, not a SPEC_DEVIATION

**Judgment: justified. No deviation marker warranted, and no fix task.**

The spec contradicts itself here, and the author resolved the contradiction the right way.
ARCH-04 criterion 4 is unconditional: *"IF the pass finds a document making a claim the code
contradicts THEN it SHALL correct the document."* ARCH-04 criterion 5 and the Out of Scope row
restrict DDD edits to sections 7 and 15. H2 is a document making a claim the code contradicts, and
it sits outside both sections. One of the two criteria had to give.

Four things make this the right call rather than a convenient one:

1. **The contradiction is real and verified.** H2 answers that work the budget does not cover means
   cancelling and opening a new work order. `work-order.ts:497` asserts `[WorkOrderStatus.InExecution]`
   and `:506` sets `AwaitingApproval`: the code opens a numbered round on the same work order and has
   done since revision 8. H18 in the same document already records the reversal, so the file
   disagreed with itself.
2. **Leaving it would have violated the feature's own purpose.** The Problem Statement names exactly
   this failure ("one of them is now wrong") as the reason the feature exists. Shipping the set with
   a known wrong statement inside it, having found it, would be the worse outcome.
3. **The edit is additive and preserves the original.** Six lines appended, the original answer kept
   verbatim, the same discipline the set applies to a superseded ADR. Nothing was rewritten.
4. **It was routed, not improvised.** ADR `0025`'s Consequences section, written at T5, already
   named this reconciliation as belonging to the consistency pass. T30 executed a decision recorded
   several tasks earlier, and its closure note flags the exception in bold rather than burying it.

What is worth recording is the **spec-precision gap**: the spec shipped with ARCH-04 criterion 4 and
criterion 5 in direct tension, and the Out of Scope table restated the narrower of the two without
noticing the conflict. That is a spec defect, not an implementation defect. A future spec that
carries both a "correct anything the code contradicts" rule and a "touch only these sections" rule
should say which wins.

### The declared gaps in `0001`, `0003`, `0004`, `0005` and `0014`

**Judgment: honest, and the claim of absence is true.**

Each of these records states in its `## Alternatives` section that no alternative is recorded in
this repository, and says where it looked, rather than inventing a rejected option. I searched the
sources myself rather than taking the claim:

| Record | Alternative it would need | Search | Found |
| --- | --- | --- | --- |
| `0001` monolith with CQRS | microservices, layerless module | `microservi`, `distributed service` across all `.md` | Nothing outside `0001`'s own sentence |
| `0003` Redis | Memcached, in-process cache | `memcached`, `in-memory cache` | Nothing |
| `0004` JWT with rotation | server-side sessions, opaque token | `opaque token`, `session cookie`, `server-side session` | Nothing outside `0004`'s own sentence |
| `0005` Argon2id | bcrypt, scrypt, PBKDF2 | `bcrypt|scrypt|pbkdf2` across `.md`, `.ts` and `.json` | Nothing at all, anywhere in the repository |
| `0014` stock consumed at withdrawal | reservation | H5 in the event storming | H5 names reservation but gives no rejection reasoning, exactly as the record says |

The framing is accurate too. `implementation-plan.md:10-12` presents the monolith with CQRS, Redis,
the JWT scheme and Argon2 as *"The repository is..."*, the state the build inherited, not as choices
deliberated at the time. `event-storming.md:754-755` reads *"H5. Stock reservation or direct
consumption? DECIDED: no reservation"*, a question that names the alternative and answers it without
arguing against it, which is precisely what `0014` claims.

This is the correct handling of spec.md's first edge case and of the declared-gap standard the user
set after T1. The records neither invent deliberation nor drop the section, and `0005` was brought
to the standard by removing an external OWASP reference, which the author recorded in T1's closure
note rather than letting stand. Nothing to fix.

---

## Code Quality

| Principle | Status |
| --- | --- |
| Minimum code | ✅ No script, no dependency, no npm script added, as Out of Scope required |
| Surgical changes | ✅ `src/` touched only by T32, and only with `@ApiForbiddenResponse` decorators and two description strings |
| No scope creep | ⚠️ One disclosed exception (H2), judged justified above |
| Matches patterns | ✅ The `.mmd` files follow `event-storming.mmd`'s comment-then-directive convention; the ADR shape is uniform across all 25 |
| Spec-anchored outcome check | ⚠️ ARCH-03 #3 asserted "every column" and 4 of 18 tables do not deliver it |
| Per-layer Coverage Expectation met | ✅ The Test Coverage Matrix says `none` for every layer this feature writes, and the one layer that could change (`src/`) ran the full build gate |
| Every test maps to a spec requirement - no unclaimed tests | ✅ No test was added, changed or removed |
| Documented guidelines followed: `.prettierrc`, `eslint.config.mjs`, `package.json` scripts | ✅ `npx prettier --check docs/` and `README.md` both clean |

---

## Edge Cases

- [x] **An ADR subject with no traceable reasoning is not invented, the gap is raised.** T1's closure
      note names the four, and the absence was independently confirmed above.
- [x] **A page covering code with no aggregate says so explicitly.** `shared.md` opens with the
      no-aggregate statement and follows it with what the unit does hold.
- [x] **A page that would repeat the high level design cites it instead.** `low-level-design/README.md:31-36`
      states the rule and names the six things the level above owns.
- [x] **A single-module context still gets its diagram.** Workshop Catalog, Inventory and Workshop
      Operations each have one; each header comment says why it is drawn anyway.
- [x] **A record with no `AD-NNN` omits the `Source` line.** 15 records carry none, including all
      five pre-build ones, matching design.md's table exactly.
- [x] **A route with no permission gate documents the rule its handler applies.** Both budget decision
      routes carry a description naming the owner-or-`work-orders:decide` rule and the 404, and no
      403 they never answer. Confirmed against `budget-decision.authorizer.ts`, which throws
      `WorkOrderNotFoundError`.

---

## Gate Check

- **Gate command**: `npm run lint && npm run build && npm run test:unit && npm run test:integration && npm run test:e2e`, plus `npx prettier --check docs/`
- **Result**: 1062 passed, 0 failed, 0 skipped. Exit code 0.
  - unit: 640 passed, 94 files
  - integration: 228 passed, 35 files
  - e2e: 194 passed, 16 files
- **Test count before feature**: 1062
- **Test count after feature**: 1062
- **Delta**: 0. Correct: this feature adds no test and changes none. `git diff 4834607~1..HEAD --name-only` matches no `*.spec.ts` and nothing under `test/`.
- **Prettier**: `npx prettier --check docs/` clean; `npx prettier --check README.md` clean, closing the gap T31 inherited.
- **`npm run format:check`**: deliberately not the gate. It fails on ~148 pre-existing files across `src`, `test` and `.claude`, none of which this feature touched. Not a regression and not reported as one.
- **Working tree**: `git status --porcelain` empty before and after verification. Nothing was modified except this report.

**Round 2 gate**, re-run in full after `ec8c6e4`:

- `npm run lint && npm run build && npm run test:unit && npm run test:integration && npm run test:e2e` exits 0.
- 1062 passed, 0 failed, 0 skipped: unit 640 in 94 files, integration 228 in 35 files, e2e 194 in 16 files.
- **Delta against round 1**: 0 in every suite. `ec8c6e4` contains no file under `src/` or `test/`, so this is structural, not coincidental.
- `npx prettier --check docs/` clean.
- `npm run format:check` remains outside the gate. Its ~148 failures are pre-existing, untouched by this feature, and are not reported as a regression in either round.
- **Working tree at the end of round 2**: only `.specs/LESSONS.md`, `.specs/lessons.json` (round 1's lesson records) and this report. No documentation or source file was modified by the Verifier in either round.

---

## Round 2 Re-verification

**Scope.** The three round 1 gaps, whether the fixes for them introduced new errors, and the same
class of check widened from the four tables that were wrong to all eighteen. The evidence behind the
35 criteria that passed in round 1 was not re-derived: `ec8c6e4` is the only new commit, it touches
two documentation files and this feature's `tasks.md`, and nothing under `src/` or `test/` appears in
it. The suites are therefore unchanged for a structural reason rather than an observed one.

### The three gaps, re-checked against the migration SQL

| Round 1 gap | Result | Evidence |
| --- | --- | --- |
| Fix 1: `work_orders` omits the five columns `…007` adds | ✅ Closed | `work-orders.md:134-138` now carries `diagnosis_started_at`, `diagnosis_completed_at`, `budget_decided_at`, `budget_decided_by_user_id` and `execution_started_at`, each `timestamptz` except the `bigint` user reference, matching `1787702400007-create-work-order-budgets.ts:8-13`. The source line at `:113-115` names all three migrations. The table is 32 rows against 32 derived columns |
| Fix 2: both item tables document a `budget_round` that does not exist | ✅ Closed | `budget_round` is gone from both column tables. `work_order_services` and `work_order_parts` each carry `budget_id` `bigint`, "References `work_order_budgets (id)`, `ON DELETE RESTRICT`", nullable, matching `…007:41-50` exactly on all four points |
| Fix 3: `stock_movement_transitions` omits `quantity` | ✅ Closed | `inventory.md:130` carries `quantity` `integer`, attributed to `1787702400008-add-work-order-closing-columns.ts` and marked nullable. `…008:27-29` adds `quantity integer` with no `NOT NULL`, so nullable is right |

### The fixes introduce no new error

Each new claim was checked against the code it describes, not accepted as written.

1. **`budget_id` is described correctly on all four attributes.** `…007:41-50` adds it to both tables
   as `budget_id bigint REFERENCES work_order_budgets (id) ON DELETE RESTRICT` with no `NOT NULL`.
   Type, FK target, on-delete action and nullability in the pages all match.
2. **The `budgetRound` alias explanation is accurate.** `work-orders.md:191-193` says the API answers
   with `budgetRound` on both item shapes, that no column of that name exists, and that
   `typeorm-work-order-query.adapter.ts` selects `wob.round AS budget_round`. The adapter does this at
   `:98` for services and `:107` for parts, in both cases joining through `budget_id` (`:101`, `:110`),
   and maps `budgetRound: row.budget_round` at `:219` and `:236`. Every element of the sentence holds.
3. **`quantity` is on the right table with the right type and nullability**, per Fix 3 above. It is not
   confused with `stock_movements.quantity`, which the same page documents separately as `integer`,
   `> 0` and non-null.
4. **`execution_started_at` "the metric subtracts this from `completed_at`"** is true:
   `typeorm-work-order-metrics-query.adapter.ts:23` computes
   `AVG(EXTRACT(EPOCH FROM (wo.completed_at - wo.execution_started_at)))`.
5. **No stale reference survives the rename.** `grep -rn "budget_round\|budgetRound" docs/` returns only
   the two lines of the alias explanation, both of which are about the alias rather than a column.

### The same check across all eighteen tables

A parser derived each table's column set from the union of its `CREATE TABLE` body and every
`ALTER TABLE ... ADD COLUMN` in a later migration, across all nine migration files, reading only the
`up()` half of each so that `DROP COLUMN` in `down()` cannot contribute. It then parsed the column
tables out of the nine low level design pages and compared name, type and order.

**Result: 18/18 tables clean**, which corroborates the author's claim independently rather than
restating it.

| Table | Page | Columns | Sources |
| --- | --- | --- | --- |
| `users` | `users.md` | 11 | `…000` |
| `roles` | `authorization.md` | 7 | `…000` |
| `permissions` | `authorization.md` | 5 | `…000` |
| `user_roles` | `authorization.md` | 3 | `…000` |
| `role_permissions` | `authorization.md` | 2 | `…000` |
| `sessions` | `authentication.md` | 11 | `…000` |
| `refresh_tokens` | `authentication.md` | 9 | `…000` |
| `customers` | `customers.md` | 15 | `…002` |
| `vehicles` | `vehicles.md` | 10 | `…003` |
| `services` | `services.md` | 9 | `…004` |
| `inventory_items` | `inventory.md` | 11 | `…005` |
| `stock_movements` | `inventory.md` | 12 | `…005` |
| `stock_movement_transitions` | `inventory.md` | 11 | `…005` + `…008` |
| `work_orders` | `work-orders.md` | 32 | `…006` + `…007` + `…008` |
| `work_order_services` | `work-orders.md` | 9 | `…006` + `…007` |
| `work_order_parts` | `work-orders.md` | 12 | `…006` + `…007` |
| `work_order_events` | `work-orders.md` | 9 | `…006` |
| `work_order_budgets` | `work-orders.md` | 9 | `…007` |

The four tables assembled from more than one migration, which round 1 identified as the whole of the
defect population, are now exact. `work_orders` at 32 columns is 15 + 5 + 12 from its three sources.

**Two false-positive traps the check had to survive**, both recorded because a naive version of this
script would report a clean sweep or a total failure for reasons unrelated to the documents:

- **Multi-line `CONSTRAINT ... REFERENCES` continuations.** `refresh_tokens` declares
  `CONSTRAINT fk_refresh_tokens_replaced_by FOREIGN KEY (replaced_by_id)` on one line and
  `REFERENCES refresh_tokens (id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED` on the next. Split
  by line, the continuation parses as a column named `references` of type `refresh_tokens`. Splitting
  on top-level commas with parenthesis-depth tracking, after stripping `--` comments, keeps each
  constraint whole. `refresh_tokens` derives 9 columns, which is correct.
- **Greedy type matching.** The first run of the parser reported 0/18 clean with 100+ type mismatches,
  every one an artefact of the type pattern swallowing the following modifier (`bigint NOT NULL` read
  as type `bigintnot`, `bigserial PRIMARY KEY` as `bigserialprimary`). No document was wrong. A
  verifier taking that first run at face value would have raised a hundred defects that do not exist,
  which is the mirror of the failure round 1 caught.

Two adjacent checks of the same class, run because the fix commit touched these files:

- **Table headings.** The nine pages carry exactly eighteen `### \`table\`` headings and they are the
  eighteen tables the migrations create. No page documents a table that does not exist, and no table
  is documented twice or not at all.
- **Index and constraint names.** All 53 `ux_*`, `ix_*`, `chk_*` and `fk_*` identifiers cited anywhere
  under `docs/architecture/` appear in the migrations. Zero fabricated, which is the same failure mode
  as `budget_round` one level down.

### Links and formatting

- 168/168 relative links across the 41 markdown files outside `node_modules` and `.specs` resolve to a
  file that exists. Unchanged from round 1, re-run because two files changed. ARCH-04 #2 holds.
- Every migration filename cited in `docs/` exists in
  `src/shared/infrastructure/database/migrations/`, all nine plus the bare `178770240000` prefix.
- `npx prettier --check docs/` reports "All matched files use Prettier code style!".

---

## Fix Plans from Round 1 (all three closed by `ec8c6e4`)

### Fix 1: `work_orders` column table is missing the five columns migration `…007` added

- **Priority**: Major
- **Root cause**: The block at `docs/architecture/low-level-design/work-orders.md:111-113` names its
  sources as `1787702400006` "extended by `1787702400008`" and never names `1787702400007`. That
  migration is a budgets migration by title, so its five `ALTER TABLE work_orders` columns at
  `1787702400007-create-work-order-budgets.ts:8-13` were not looked for: `diagnosis_started_at`,
  `diagnosis_completed_at`, `budget_decided_at`, `budget_decided_by_user_id`, `execution_started_at`.
  All five return 0 occurrences across the whole page. The table lists 27 columns; the table has 32.
- **Why it bites**: `execution_started_at` is the column `typeorm-work-order-metrics-query.adapter.ts:23`
  subtracts from `completed_at` to compute the average execution time, which the same page describes
  three paragraphs above the table at `:108`. A reader working from this page cannot find the column
  the metric they just read about actually reads.
- **Fix task**: Add the five columns to the `work_orders` block with their types and nullability, mark
  them "Added by `…007`" in the Notes column as the `…008` rows already are, and extend the source
  line at `:112-113` to name all three migrations.
- **Verify**: The column list and its order match `CREATE TABLE work_orders` plus both `ALTER TABLE
  work_orders` blocks, 32 rows.
- **Round 2**: ✅ Closed. 32 rows, matching order, all three migrations named on the source line.

### Fix 2: `work_order_services` and `work_order_parts` document a column that does not exist

- **Priority**: Major
- **Root cause**: `work-orders.md:160` and `:179` both carry a row `` `budget_round` | `integer` |
  Added by `…007` ``. No such column exists on either table. Migration
  `1787702400007-create-work-order-budgets.ts:41-50` adds `budget_id bigint REFERENCES
  work_order_budgets (id) ON DELETE RESTRICT`, and both ORM entities declare exactly that:
  `work-order-service.orm-entity.ts:29-30` and `work-order-part.orm-entity.ts:36-37`, each
  `@Column({ name: 'budget_id', type: 'bigint', nullable: true })`. `budget_round` is a SQL alias in
  the read path, `wob.round AS budget_round` at `typeorm-work-order-query.adapter.ts:98` and `:107`,
  which is almost certainly where it was picked up.
- **Why it bites**: The page states three wrong things at once, on two tables: a column name that
  does not exist, a type (`integer`) that is not the real one (`bigint`), and, by omission, the
  foreign key from the items to `work_order_budgets`. That FK is the mechanism ADR `0017` and `0018`
  both rest on, so the page hides the link that makes "items belong to a round" true in the schema.
- **Fix task**: Replace both `budget_round` rows with `budget_id`, type `bigint`, nullable, noting the
  reference to `work_order_budgets (id)` `ON DELETE RESTRICT` and that it is null while an item is a
  draft. If the round number is worth keeping on the page, state it as what it is: a value the query
  adapter resolves by joining `work_order_budgets`, not a stored column.
- **Verify**: Both tables' column lists match their `CREATE TABLE` plus the `ALTER TABLE` in `…007`,
  and `grep -c budget_round docs/architecture/low-level-design/work-orders.md` returns 0 in the
  column tables.
- **Round 2**: ✅ Closed. Both tables carry `budget_id` `bigint` with the FK, on-delete and nullability
  right; `budget_round` survives only in an explicit note saying it is a read-path alias.

### Fix 3: `stock_movement_transitions` is missing the `quantity` column

- **Priority**: Minor
- **Root cause**: The block at `docs/architecture/low-level-design/inventory.md:116-130` lists 10
  columns, all from `1787702400005`. Migration `1787702400008-add-work-order-closing-columns.ts:27-28`
  adds an eleventh, `quantity integer`, to this table. The section's only migration citation is
  `inventory.md:75`, "From migration `1787702400005-create-inventory-schema.ts`", which sits above
  the first of the section's three blocks and does not cover this one.
- **Fix task**: Add the `quantity` row marked as added by `…008`, and give the
  `stock_movement_transitions` block its own source line naming both migrations, as
  `work-orders.md` does for `work_orders`.
- **Verify**: The block lists 11 columns and names `…008`.
- **Round 2**: ✅ Closed. 11 columns, `quantity` `integer` nullable, attributed to `…008` in its own
  Notes cell rather than a block-level source line, which serves the same purpose.

---

## Observations (no fix task)

1. **ADR `0024:21` renders the guard as `WHERE id = :id AND version = :loadedVersion`.** The code binds
   `:version` (`typeorm-work-order.repository.ts:179`). The semantics are identical and the ADR is not
   quoting, but the backticks read as a quotation and a reader grepping `:loadedVersion` finds nothing.
   T7's own Done-when line specified that phrasing, so the record matches its task.
2. **The effective access key and TTL are still stated in full in two documents.** `adr/0003:20` and
   `low-level-design/authorization.md:69` both give `authz:access:${userId}` and the 60 second TTL.
   T30 removed the third copy and `high-level-design.md:92` now points at the page, so the reduction
   was real, but the ADR/page pair remains. Under section 10's ownership table the ADR "does not
   repeat how the system works" and could point at the page. It is arguable in the other direction:
   the TTL is also the ADR's own stated consequence, since it is what bounds staleness when an
   invalidation is missed. Left as an observation rather than a gap.
3. **Plan section 7 keeps two explanatory notes** beyond its table (`implementation-plan.md:1145-1160`),
   flagging that the trail row points at a record with a different mechanism and that the budget
   deviation row points at a record no longer in force. ARCH-01 #12 says the section holds "only an
   index". Read strictly that is prose; read as intended it is index apparatus that stops two rows
   from misleading, and it states no decision. Counted as PASS.

---

## Requirement Traceability Update

| Requirement | Before | After round 1 | After round 2 |
| --- | --- | --- | --- |
| ARCH-01 | Implementing | ✅ Verified | ✅ Verified |
| ARCH-02 | Implementing | ✅ Verified | ✅ Verified |
| ARCH-03 | Implementing | ❌ Needs Fix (criterion 3: Fixes 1-3) | ✅ Verified (all three closed, and the check widened to 18/18 tables) |
| ARCH-04 | Implementing | ✅ Verified (one spec-precision gap and one justified exception recorded) | ✅ Verified (168/168 links re-checked) |
| ARCH-05 | Implementing | ✅ Verified | ✅ Verified |

---

## Summary

**Overall (round 2)**: ✅ Pass. All three round 1 corrections landed, none of them introduced a new
error, and the check that found them now runs clean across every table rather than the four that were
wrong.

**Spec-anchored check**: 38/38 criteria met with evidence. ARCH-03 #3, the only criterion that failed
in round 1, is now satisfied on all eighteen column tables. The two items round 1 recorded but did not
count as gaps stand unchanged: 1 spec-precision gap flagged (ARCH-04 #1, the residual ADR/page pair on
the effective-access key and TTL) and 1 disclosed scope exception judged justified (ARCH-04 #5, the H2
annotation). Neither is a blocker and neither was re-opened.

**Sensor**: not applicable, documentation feature, no behaviour to mutate, per the user's explicit
decision recorded in spec.md. Replaced in round 1 by three mechanical probes, one of which
discriminated. Round 2 added a fourth: a column-set parser run against all 18 tables, whose own first
run produced a hundred false positives from a greedy type pattern and had to be corrected before its
clean result could be trusted.

**Gate**: 1062 passed, 0 failed, exit 0. Unit 640, integration 228, e2e 194, identical to round 1 and
structurally guaranteed, since the fix commit contains no file under `src/` or `test/`. `docs/`
Prettier-clean, 168/168 links resolve.

**What round 2 confirmed**:

1. `work_orders` lists all 32 columns from its three migrations, in order, including
   `execution_started_at`, the column the average execution time metric actually subtracts from
   `completed_at`.
2. `budget_id` replaced the fabricated `budget_round` on both item tables, correct on type, FK target,
   on-delete action and nullability, with the `budgetRound` API field explained as the read-path alias
   it is, verified line by line against `typeorm-work-order-query.adapter.ts`.
3. `stock_movement_transitions` lists `quantity`, nullable, attributed to `…008`.
4. Widened beyond the reported gaps: 18/18 tables match the union of their `CREATE TABLE` and every
   later `ADD COLUMN`; 18/18 documented table headings correspond to a real table; 53/53 index and
   constraint names cited in the docs exist in the migrations.

**Fixes verified against the source, not the claim.** The author's tasks.md states a script reports
18/18 clean. That number was re-derived here by an independently written parser rather than by running
the author's, and it matched.

**Next steps**: none blocking. ARCH-01 through ARCH-05 are all Verified. The two round 1 observations
(the ADR `0024` `:loadedVersion` phrasing and the effective-access TTL stated in two places) remain
open as judgement calls for the maintainer, deliberately not raised as gaps in either round.
