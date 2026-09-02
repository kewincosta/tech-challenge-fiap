# Architecture Documentation Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: `.specs/features/architecture-documentation/design.md`
**Status**: Approved

---

## Test Coverage Matrix

> Generated from codebase, project guidelines and spec. Guidelines found: `.prettierrc`, `.prettierignore`, `package.json` scripts, `vitest.config.ts` (its coverage thresholds bind `src/`, which this feature does not write), `eslint.config.mjs`. This feature produces documents, so its layers carry no executable test by design: the user chose prose with human review over a shipped validation script, and that decision is recorded in the spec's Out of Scope and Assumptions.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| --- | --- | --- | --- | --- |
| Architecture or decision document | none | Every structural fact its acceptance criterion states, confirmed by `ls`, `grep` or one file open; Prettier-clean | `docs/**/*.md` | `npx prettier --check docs/` |
| C4 diagram | none | Opens with the C4 diagram type its criterion names, and renders in a mermaid preview. Prettier has no mermaid parser and skips `.mmd`, so the declaration is confirmed by `grep` and the rendering by opening it | `docs/architecture/*.mmd` | no runner exists; `grep` plus a preview |
| Swagger annotation on an existing controller | none | The annotation changes no behaviour, no DTO and no test, so every e2e test already covering those routes stays green | `src/modules/**/presentation/controllers/*.controller.ts` | `npm run test:e2e` |
| Existing source and its suites | untouched | 1062 tests stay green: 640 unit, 228 integration, 194 e2e | `src/**`, `test/**` | `npm run test:unit && npm run test:integration && npm run test:e2e` |

`Tests: none` is correct for every task here because the matrix says `none` for every layer this feature writes. It is not test deferral: there is no later task where a test for a markdown file becomes runnable.

## Gate Check Commands

> Generated from `package.json` and `.prettierrc` - confirm before Execute.

| Gate Level | When to Use | Command |
| --- | --- | --- |
| Quick | After a task that writes only `.mmd`, which Prettier skips | `npx prettier --check docs/` |
| Full | After a task that writes or edits markdown | `npm run lint && npm run build && npx prettier --check docs/` |
| Build | After a task that can modify `src/` | `npm run lint && npm run build && npm run test:unit && npm run test:integration && npm run test:e2e && npx prettier --check docs/` |

`npm run format:check` is deliberately absent: it fails on 149 pre-existing files across `src`, `test`, `.claude` and `README.md`, none of which this feature is here to reformat. `npx prettier --check docs/` passes today and covers exactly what this feature writes. Design's Risks table carries the detail.

---

## Confirmed lessons applied to this breakdown

- **L-002** (every spec Edge Case needs an owning task): the Edge Case Ownership table below assigns each of the spec's six edge cases to the task that carries it, and each assignment also appears as a **Done when** line in that task.
- **L-003** (a sibling call site's test does not substitute for its own) does not apply: this feature adds no call site and no test. Recorded rather than silently skipped, so the Verifier can see it was considered.

## Edge Case Ownership

| spec.md Edge Case | Owning task | Proof |
| --- | --- | --- |
| An ADR subject with no traceable reasoning is not invented, the gap is raised | T1 | Closure note naming the number, or a citation for every one of the five |
| A page covering code with no aggregate says so explicitly | T28 | `shared.md` states it and describes what it does hold |
| A page that would repeat the high level design cites it instead | T29 | The index states the rule; the pass in T30 enforces it |
| A context mapping to one module still gets its diagram | T23, T25, T27 | Three single-module contexts each carry a component diagram |
| A record corresponding to no `AD-NNN` omits the `Source` line | T1 | The five pre-build records carry no `Source` line |
| A route with no permission gate documents the rule its handler applies | T32 | The budget decision routes document the owner-or-permission rule |

---

## Preconditions

- No database, no migration, no schema change, no new dependency, no new npm script.
- `docs/` passes `npx prettier --check docs/` today. Every task keeps it passing.
- `README.md` fails Prettier today, from feature 9's T10. T31 is the task that edits it and brings it clean.
- The ADR numbering and provenance are fixed in design.md's table. No task decides a number.

## Database actions

None.

## Commit rules

One atomic commit per task, with that task's checkboxes flipped in this file in the same commit. Conventional Commits, no trailers. Validate every message with `python3 .claude/skills/tlc-spec-driven/scripts/check_commit.py --message "..."` before committing.

---

## Execution Plan

Phases run in order; tasks inside a phase run in order.

Each block carries the incoming edge from the previous phase, so every `Depends on` in a task
body has a matching arrow here.

### Phase 1: The decision records

```
T1 → T2 → T3 → T4 → T5 → T6 → T7 → T8 → T9
```

### Phase 2: The two pages and the two diagrams

```
T8 → T10 → T11
T10 → T12 → T13
T10 → T14
```

### Phase 3a: Identity and Access

```
T11 → T15 → T16 → T17 → T18
```

### Phase 3b: Customer Management and Workshop Catalog

```
T18 → T19 → T20 → T21 → T22 → T23
```

### Phase 3c: Inventory and Workshop Operations

```
T23 → T24 → T25 → T26 → T27
```

### Phase 3d: The cross-cutting page and the index

```
T27 → T28 → T29
```

### Phase 4: Consistency, README and Swagger

```
T29 → T30 → T31 → T32
```

---

## Task Breakdown

### T1: The five pre-build stack records

**What**: ADRs 0001 to 0005, the decisions taken before phase 0: modular monolith with CQRS, PostgreSQL, Redis, JWT with refresh rotation, Argon2id.
**Where**: `docs/adr/`
**Depends on**: None
**Reuses**: The plan's narrative in sections 3 and 13, which holds the reasoning for all five
**Requirement**: ARCH-01

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Five records exist, numbered `0001` to `0005`, each named `NNNN-<kebab-case-title>.md` and matching its subject in design.md's provenance table
- [ ] Each carries `## Context`, `## Decision`, `## Alternatives`, `## Consequences` and one `**Status**` line reading `Accepted`
- [ ] `0002` justifies PostgreSQL on the four grounds the plan names: relational integrity across work orders, items and stock movements; the transactional guarantee the withdrawal needs across two aggregates in two modules; partial unique indexes for the soft delete rules; integer `bigint` arithmetic for money in cents
- [ ] None of the five carries a `**Source**` line, since none corresponds to an `AD-NNN` - spec.md's fifth edge case
- [ ] Every Context cites the document its reasoning comes from. IF a record cannot be traced to an existing document THEN it is not written and the gap is named in this task's closure note - spec.md's first edge case
- [ ] Gate check passes: `npm run lint && npm run build && npx prettier --check docs/`

**Tests**: none
**Gate**: full

**Commit**: `docs(adr): record the pre-build stack decisions`

---

### T2: The identifier, money and bus records

**What**: ADRs 0006 to 0008, moved from the plan's section 7 blocks, each naming its `AD-NNN`.
**Where**: `docs/adr/`
**Depends on**: T1
**Reuses**: Section 7's blocks for these three decisions; `.specs/STATE.md` AD-001, AD-002, AD-003
**Requirement**: ARCH-01

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Three records exist, `0006` to `0008`, following the section shape T1 established
- [ ] Each carries a `**Source**` line naming AD-001, AD-002 and AD-003 respectively
- [ ] The corresponding `AD-NNN` entries in `.specs/STATE.md` are left unchanged
- [ ] Each Context carries the substance of its section 7 block rather than a paraphrase that drops the reasoning
- [ ] Gate check passes: `npm run lint && npm run build && npx prettier --check docs/`

**Tests**: none
**Gate**: full

**Commit**: `docs(adr): record the identifier, money and bus decisions`

---

### T3: The aggregate and access records

**What**: ADRs 0009 to 0012: Customer as its own aggregate, no aggregate for the three staff profiles, groups removed, super administrator outside the API.
**Where**: `docs/adr/`
**Depends on**: T2
**Reuses**: Section 7's blocks; `.specs/STATE.md` AD-004, AD-005, AD-006
**Requirement**: ARCH-01

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Four records exist, `0009` to `0012`
- [ ] `0009` and `0010` both name AD-004 in their `**Source**` line, since one entry covers both decisions
- [ ] `0011` names AD-005 and `0012` names AD-006
- [ ] `0010` carries the `Trigger to revisit` its section 7 block states, rather than dropping it
- [ ] Gate check passes: `npm run lint && npm run build && npx prettier --check docs/`

**Tests**: none
**Gate**: full

**Commit**: `docs(adr): record the aggregate and access decisions`

---

### T4: The inventory records

**What**: ADRs 0013 to 0016: one aggregate for parts and supplies, stock consumed at withdrawal, movements append only, cancellation writes off.
**Where**: `docs/adr/`
**Depends on**: T3
**Reuses**: Section 7's blocks; the event storming's section 9 for the invariants
**Requirement**: ARCH-01

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Four records exist, `0013` to `0016`
- [ ] `0016` states what the write-off does to the ledger rather than only that units are not returned
- [ ] None carries a `**Source**` line, since none corresponds to an `AD-NNN`
- [ ] Gate check passes: `npm run lint && npm run build && npx prettier --check docs/`

**Tests**: none
**Gate**: full

**Commit**: `docs(adr): record the inventory decisions`

---

### T5: The budget records

**What**: ADRs 0017 to 0020: budget as an entity inside the aggregate, numbered rounds, the frozen round price, budget total and charged total kept apart.
**Where**: `docs/adr/`
**Depends on**: T4
**Reuses**: Section 7's blocks; the event storming's section 10 rules on budget rounds
**Requirement**: ARCH-01

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Four records exist, `0017` to `0020`
- [ ] `0019` states which price a withdrawal is charged at and why the round freezes it
- [ ] `0020` states what each of the two totals answers, since keeping them apart is the decision
- [ ] Gate check passes: `npm run lint && npm run build && npx prettier --check docs/`

**Tests**: none
**Gate**: full

**Commit**: `docs(adr): record the budget decisions`

---

### T6: The trail and logout records

**What**: ADRs 0021 and 0022. `0021` records the trail written by the repository inside the aggregate's transaction, with the post-commit subscriber as the rejected alternative.
**Where**: `docs/adr/`
**Depends on**: T5
**Reuses**: `.specs/STATE.md` AD-007; the event storming's section 10 rule 8 for the logout
**Requirement**: ARCH-01

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Two records exist, `0021` and `0022`
- [ ] `0021` names AD-007 in its `**Source**` line and states the decision as built: `TypeOrmWorkOrderRepository` writes `work_order_events` through the same `EntityManager` as the aggregate
- [ ] `0021` lists the post-commit subscriber under `## Alternatives`, with the reason it was rejected, and is a single record rather than a `Superseded by` pair, since the subscriber was never built
- [ ] `0022` states that a logout ends every active session of the user on every device
- [ ] Gate check passes: `npm run lint && npm run build && npx prettier --check docs/`

**Tests**: none
**Gate**: full

**Commit**: `docs(adr): record the trail and logout decisions`

---

### T7: The two records taken during the build

**What**: ADRs 0023 and 0024, the decisions the plan's list does not have: the ambient transaction rule and the optimistic version guard.
**Where**: `docs/adr/`
**Depends on**: T6
**Reuses**: `.specs/STATE.md` AD-008 and AD-009, which already carry decision, reason, trade-off and scope
**Requirement**: ARCH-01

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Two records exist, `0023` and `0024`, naming AD-008 and AD-009 in their `**Source**` lines
- [ ] `0023` states the rule that a repository reachable from a cross-module write resolves its `EntityManager` through `currentEntityManager()` before opening its own transaction, and names why a second transaction on a second connection is invisible to the calling module's tests
- [ ] `0024` states the `WHERE id = :id AND version = :loadedVersion` guard, the 409 it produces, and that handlers carry no concurrency handling of their own
- [ ] Gate check passes: `npm run lint && npm run build && npx prettier --check docs/`

**Tests**: none
**Gate**: full

**Commit**: `docs(adr): record the transaction and concurrency decisions`

---

### T8: The decision index

**What**: `docs/adr/README.md`, listing all 24 records by number, title and status.
**Where**: `docs/adr/README.md`
**Depends on**: T7
**Reuses**: The 24 files written by T1 to T7
**Requirement**: ARCH-01

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] The index lists 24 rows, numbered `0001` to `0024`, with no number skipped and no number used twice
- [ ] Every row links a file that exists in `docs/adr/`
- [ ] The index carries no decision text of its own, only number, title and status
- [ ] It states the status vocabulary: `Accepted`, `Superseded by NNNN`, `Deprecated`, and the rule that a superseded record is never edited or deleted
- [ ] Gate check passes: `npm run lint && npm run build && npx prettier --check docs/`

**Tests**: none
**Gate**: full

**Commit**: `docs(adr): add the decision index`

---

### T9: Section 7 of the plan becomes an index

**What**: Replace the 15 decision blocks in the plan's section 7 with rows pointing at `docs/adr/`.
**Where**: `docs/ddd/implementation-plan.md`
**Depends on**: T8
**Reuses**: The index T8 wrote
**Requirement**: ARCH-01

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Section 7 holds only an index pointing at `docs/adr/`, and no decision prose
- [ ] The stale block describing the work order trail as written by a subscriber is gone from the file, replaced by the row pointing at `0021`
- [ ] Every row resolves to a file that exists
- [ ] Nothing outside section 7 is edited
- [ ] Gate check passes: `npm run lint && npm run build && npx prettier --check docs/`

**Tests**: none
**Gate**: full

**Commit**: `docs(ddd): point section 7 at the decision records`

---

### T10: The system in one page

**What**: `architecture-overview.md`: what the system is, four business actors, five bounded contexts, three runtime pieces, the shaping constraints.
**Where**: `docs/architecture/architecture-overview.md`
**Depends on**: T8
**Reuses**: The event storming's sections 3 and 4; the ADR index for every decision it mentions
**Requirement**: ARCH-02

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] The page names the four business actors from the event storming's section 3, excluding `System`, which is not a role and never logs in
- [ ] It names the five bounded contexts from section 4 and what each is responsible for
- [ ] It names the three runtime pieces: the NestJS application, PostgreSQL and Redis
- [ ] It contains no module internals, no schema detail and no endpoint list, pointing at the high level design and the low level design pages instead
- [ ] Every decision it mentions links its ADR rather than restating the reasoning
- [ ] Gate check passes: `npm run lint && npm run build && npx prettier --check docs/`

**Tests**: none
**Gate**: full

**Commit**: `docs(architecture): add the system overview`

---

### T11: How it hangs together

**What**: `high-level-design.md`: the code units and what each owns, the bus communication, the CQRS wiring, the guard chain, the cross-module transaction boundaries, the identifier and money conventions.
**Where**: `docs/architecture/high-level-design.md`
**Depends on**: T10
**Reuses**: `src/app.module.ts` for the guard order; ADRs 0006, 0007, 0008, 0023 for the conventions
**Requirement**: ARCH-02

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] It states the guard chain in the order Nest runs it, which is declaration order in `app.module.ts:89-92`: `ThrottlerGuard`, `JwtAuthGuard`, `PendingPasswordGuard`, `PermissionsGuard`
- [ ] It states how modules communicate, naming `CommandBus` and `QueryBus` and the rule that no module injects another's repository
- [ ] It states the cross-module transaction boundary and how `TransactionRunner` and `currentEntityManager()` carry it, pointing at ADR 0023
- [ ] It states the identifier and money conventions, pointing at ADRs 0006 and 0007
- [ ] It carries no per-class or per-column detail and no domain narrative, pointing at the low level design pages and the event storming instead
- [ ] Every statement cites a file or directory a reader can open to confirm it
- [ ] Gate check passes: `npm run lint && npm run build && npx prettier --check docs/`

**Tests**: none
**Gate**: full

**Commit**: `docs(architecture): add the high level design`

---

### T12: The system context diagram

**What**: `c4-system-context.mmd`, C4 level 1.
**Where**: `docs/architecture/c4-system-context.mmd`
**Depends on**: T10
**Reuses**: `docs/ddd/event-storming.mmd` for the mermaid conventions
**Requirement**: ARCH-02

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] The file opens with a `C4Context` declaration
- [ ] It carries the four business actors and this one system, and no external system
- [ ] It renders in a mermaid preview
- [ ] Gate check passes: `npx prettier --check docs/`

**Tests**: none
**Gate**: quick

**Commit**: `docs(architecture): add the system context diagram`

---

### T13: The container diagram

**What**: `c4-containers.mmd`, C4 level 2.
**Where**: `docs/architecture/c4-containers.mmd`
**Depends on**: T12
**Reuses**: T12's style; `docker-compose.yml` for the three services
**Requirement**: ARCH-02

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] The file opens with a `C4Container` declaration
- [ ] It carries the NestJS application, PostgreSQL and Redis, and the relations between them
- [ ] It renders in a mermaid preview
- [ ] Gate check passes: `npx prettier --check docs/`

**Tests**: none
**Gate**: quick

**Commit**: `docs(architecture): add the container diagram`

---

### T14: Section 15 of the event storming points up

**What**: Replace the architectural implications in section 15 with a pointer at the overview.
**Where**: `docs/ddd/event-storming.md`
**Depends on**: T10
**Reuses**: The overview T10 wrote
**Requirement**: ARCH-02

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Section 15 points at `docs/architecture/architecture-overview.md` instead of restating the implications
- [ ] Anything section 15 held that the overview does not carry is moved into the overview rather than lost
- [ ] Nothing outside section 15 is edited, and the document stays the source of truth for the domain
- [ ] Gate check passes: `npm run lint && npm run build && npx prettier --check docs/`

**Tests**: none
**Gate**: full

**Commit**: `docs(ddd): point section 15 at the architecture overview`

---

### T15: The users page

**What**: The low level design page for the `users` module.
**Where**: `docs/architecture/low-level-design/users.md`
**Depends on**: T11
**Reuses**: `src/modules/users/`; migration `1787702400000-create-identity-and-access-schema.ts`
**Requirement**: ARCH-03

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] It covers the `User` aggregate and its invariants, the value objects, the commands and handlers, the queries and ports, the repository and mapper, the ORM entity with every column, the endpoints, and the errors with their HTTP mapping
- [ ] The entity block names the migration file its columns come from
- [ ] It describes nothing another module owns and states no decision, pointing at the ADR instead
- [ ] Gate check passes: `npm run lint && npm run build && npx prettier --check docs/`

**Tests**: none
**Gate**: full

**Commit**: `docs(architecture): add the users low level design`

---

### T16: The authentication page

**What**: The low level design page for the `authentication` module.
**Where**: `docs/architecture/low-level-design/authentication.md`
**Depends on**: T15
**Reuses**: `src/modules/authentication/`; migration `1787702400000`
**Requirement**: ARCH-03

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] It covers the `Session` aggregate and `RefreshToken`, their invariants, the value objects, the commands and handlers, the ports, the repository and mapper, both ORM entities with every column, the endpoints, and the errors with their HTTP mapping
- [ ] It states where `JwtAuthGuard` and `PendingPasswordGuard` sit in the chain, pointing at the high level design for the order
- [ ] Each entity block names the migration file its columns come from
- [ ] Gate check passes: `npm run lint && npm run build && npx prettier --check docs/`

**Tests**: none
**Gate**: full

**Commit**: `docs(architecture): add the authentication low level design`

---

### T17: The authorization page

**What**: The low level design page for the `authorization` module.
**Where**: `docs/architecture/low-level-design/authorization.md`
**Depends on**: T16
**Reuses**: `src/modules/authorization/`; migrations `1787702400000` and `1787702400001-seed-rbac-catalog.ts`
**Requirement**: ARCH-03

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] It covers the `Role` and `Permission` aggregates, the four ORM entities with every column, the three controllers and their endpoints, the effective access reader, the Redis access cache and its key and TTL, and the errors with their HTTP mapping
- [ ] It states the role escalation rule and points at ADR 0012 rather than restating why
- [ ] It records that registration assigns `CUSTOMER` to every account, since that is the fact behind every staff account also holding `work-orders:read-own`
- [ ] Each entity block names the migration file its columns come from
- [ ] Gate check passes: `npm run lint && npm run build && npx prettier --check docs/`

**Tests**: none
**Gate**: full

**Commit**: `docs(architecture): add the authorization low level design`

---

### T18: The Identity and Access component diagram

**What**: `c4-components-identity-and-access.mmd`, showing `users`, `authentication` and `authorization` as three boundaries in one context.
**Where**: `docs/architecture/c4-components-identity-and-access.mmd`
**Depends on**: T17
**Reuses**: The three pages T15 to T17 wrote; T12's mermaid conventions
**Requirement**: ARCH-03

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] The file opens with a `C4Component` declaration
- [ ] It shows three module boundaries inside the context, one per module - spec.md's eighth criterion on ARCH-03
- [ ] It shows the controllers, handlers, aggregates, repositories and ports of each, and every call that crosses into another module
- [ ] It renders in a mermaid preview
- [ ] Gate check passes: `npx prettier --check docs/`

**Tests**: none
**Gate**: quick

**Commit**: `docs(architecture): add the identity and access component diagram`

---

### T19: The customers page

**What**: The low level design page for the `customers` module.
**Where**: `docs/architecture/low-level-design/customers.md`
**Depends on**: T18
**Reuses**: `src/modules/customers/`; migration `1787702400002-create-customers-table.ts`
**Requirement**: ARCH-03

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] It covers the `Customer` aggregate and the one-identity-per-customer invariant, `Address` and `PhoneNumber`, the commands and handlers, the queries and ports, the repository and mapper, the ORM entity with every column, the endpoints, and the errors with their HTTP mapping
- [ ] It states the cross-module lookup by document goes through the `QueryBus`, pointing at ADR 0008
- [ ] The entity block names the migration file its columns come from
- [ ] Gate check passes: `npm run lint && npm run build && npx prettier --check docs/`

**Tests**: none
**Gate**: full

**Commit**: `docs(architecture): add the customers low level design`

---

### T20: The vehicles page

**What**: The low level design page for the `vehicles` module.
**Where**: `docs/architecture/low-level-design/vehicles.md`
**Depends on**: T19
**Reuses**: `src/modules/vehicles/`; migration `1787702400003-create-vehicles-table.ts`
**Requirement**: ARCH-03

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] It covers the `Vehicle` aggregate, `LicensePlate` and `VehicleYear` with their rules, the commands and handlers, the queries and ports, the repository and mapper, the ORM entity with every column, the endpoints including `GET /vehicles/me`, and the errors with their HTTP mapping
- [ ] It records that `GET /vehicles/me` carries no permission decorator, unlike the work order equivalent, since that asymmetry is real and surprising
- [ ] The entity block names the migration file its columns come from
- [ ] Gate check passes: `npm run lint && npm run build && npx prettier --check docs/`

**Tests**: none
**Gate**: full

**Commit**: `docs(architecture): add the vehicles low level design`

---

### T21: The Customer Management component diagram

**What**: `c4-components-customer-management.mmd`, showing `customers` and `vehicles` as two boundaries in one context.
**Where**: `docs/architecture/c4-components-customer-management.mmd`
**Depends on**: T20
**Reuses**: T19 and T20's pages; T12's conventions
**Requirement**: ARCH-03

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] The file opens with a `C4Component` declaration
- [ ] It shows two module boundaries inside the context
- [ ] It shows every call crossing into `users` and into `work-orders`
- [ ] It renders in a mermaid preview
- [ ] Gate check passes: `npx prettier --check docs/`

**Tests**: none
**Gate**: quick

**Commit**: `docs(architecture): add the customer management component diagram`

---

### T22: The services page

**What**: The low level design page for the `services` module.
**Where**: `docs/architecture/low-level-design/services.md`
**Depends on**: T21
**Reuses**: `src/modules/services/`; migration `1787702400004-create-services-table.ts`
**Requirement**: ARCH-03

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] It covers the `Service` aggregate, `ServiceName`, `ServiceDuration` and the use of `Money`, the commands and handlers, the queries and ports, the repository and mapper, the ORM entity with every column, the endpoints, and the errors with their HTTP mapping
- [ ] It states that the catalog price is frozen into a budget round rather than read live, pointing at ADR 0019
- [ ] The entity block names the migration file its columns come from
- [ ] Gate check passes: `npm run lint && npm run build && npx prettier --check docs/`

**Tests**: none
**Gate**: full

**Commit**: `docs(architecture): add the services low level design`

---

### T23: The Workshop Catalog component diagram

**What**: `c4-components-workshop-catalog.mmd`, a single-module context.
**Where**: `docs/architecture/c4-components-workshop-catalog.mmd`
**Depends on**: T22
**Reuses**: T22's page; T12's conventions
**Requirement**: ARCH-03

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] The file opens with a `C4Component` declaration
- [ ] The diagram is drawn even though the context maps to exactly one module, so the five contexts are covered uniformly - spec.md's fourth edge case
- [ ] It shows every call that crosses into `work-orders`
- [ ] It renders in a mermaid preview
- [ ] Gate check passes: `npx prettier --check docs/`

**Tests**: none
**Gate**: quick

**Commit**: `docs(architecture): add the workshop catalog component diagram`

---

### T24: The inventory page

**What**: The low level design page for the `inventory` module.
**Where**: `docs/architecture/low-level-design/inventory.md`
**Depends on**: T23
**Reuses**: `src/modules/inventory/`; migration `1787702400005-create-inventory-schema.ts`
**Requirement**: ARCH-03

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] It covers the `InventoryItem` and `StockMovement` aggregates and their invariants, `Sku` and `StockQuantity`, the commands and handlers including the settle and write-off handlers, the queries and ports, the repositories and mappers, both ORM entities with every column, the endpoints, and the errors with their HTTP mapping
- [ ] It states the append-only movement ledger and its transitions, pointing at ADRs 0014, 0015 and 0016
- [ ] It records that both handlers are dispatched from `work-orders` over the `CommandBus` and must stay registered in `inventory.module.ts`, since a missing registration compiles and unit-tests clean
- [ ] Each entity block names the migration file its columns come from
- [ ] Gate check passes: `npm run lint && npm run build && npx prettier --check docs/`

**Tests**: none
**Gate**: full

**Commit**: `docs(architecture): add the inventory low level design`

---

### T25: The Inventory component diagram

**What**: `c4-components-inventory.mmd`, a single-module context.
**Where**: `docs/architecture/c4-components-inventory.mmd`
**Depends on**: T24
**Reuses**: T24's page; T12's conventions
**Requirement**: ARCH-03

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] The file opens with a `C4Component` declaration
- [ ] The diagram is drawn even though the context maps to one module - spec.md's fourth edge case
- [ ] It shows the calls arriving from `work-orders` on the `CommandBus`, since that is the boundary crossing this context is defined by
- [ ] It renders in a mermaid preview
- [ ] Gate check passes: `npx prettier --check docs/`

**Tests**: none
**Gate**: quick

**Commit**: `docs(architecture): add the inventory component diagram`

---

### T26: The work orders page

**What**: The low level design page for the `work-orders` module, the largest in the set.
**Where**: `docs/architecture/low-level-design/work-orders.md`
**Depends on**: T25
**Reuses**: `src/modules/work-orders/`; migrations `1787702400006`, `1787702400007` and `1787702400008`
**Requirement**: ARCH-03

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] It covers the `WorkOrder` aggregate with `Budget`, `WorkOrderServiceItem` and `WorkOrderPartItem`, the status machine and its transitions, the value objects, all 16 write handlers, the query handlers and ports, the three authorizers, the repository and mapper, all five ORM entities with every column, every endpoint on the controller, and the errors with their HTTP mapping
- [ ] It states the version guard on `save` and the 409 it produces, pointing at ADR 0024
- [ ] It states that the trail is written by the repository in the same transaction, pointing at ADR 0021
- [ ] It records the route ordering rule that `me` and `metrics/*` are declared before `:number`
- [ ] Each entity block names the migration file its columns come from, including the columns migration `1787702400008` added
- [ ] Gate check passes: `npm run lint && npm run build && npx prettier --check docs/`

**Tests**: none
**Gate**: full

**Commit**: `docs(architecture): add the work orders low level design`

---

### T27: The Workshop Operations component diagram

**What**: `c4-components-workshop-operations.mmd`, a single-module context with the most crossings.
**Where**: `docs/architecture/c4-components-workshop-operations.mmd`
**Depends on**: T26
**Reuses**: T26's page; T12's conventions
**Requirement**: ARCH-03

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] The file opens with a `C4Component` declaration
- [ ] The diagram is drawn even though the context maps to one module - spec.md's fourth edge case
- [ ] It shows every call crossing into `inventory`, `customers`, `vehicles`, `services` and `users`
- [ ] It renders in a mermaid preview
- [ ] Gate check passes: `npx prettier --check docs/`

**Tests**: none
**Gate**: quick

**Commit**: `docs(architecture): add the workshop operations component diagram`

---

### T28: The shared kernel page

**What**: The low level design page for `src/shared`, the only unit in the set with no aggregate of its own.
**Where**: `docs/architecture/low-level-design/shared.md`
**Depends on**: T27
**Reuses**: `src/shared/`
**Requirement**: ARCH-03

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] It states explicitly that this unit holds no aggregate, and describes what it does hold instead - spec.md's second edge case
- [ ] It covers `Money`, `AggregateRoot`, `EntityId`, the domain errors and the error-kind vocabulary
- [ ] It covers the `Clock`, `IdGenerator` and `TransactionRunner` ports and their TypeORM and system implementations
- [ ] It covers the global exception filter and the error-kind to HTTP status mapping, which every module's errors travel through
- [ ] Gate check passes: `npm run lint && npm run build && npx prettier --check docs/`

**Tests**: none
**Gate**: full

**Commit**: `docs(architecture): add the shared kernel low level design`

---

### T29: The low level design index

**What**: `low-level-design/README.md`, listing the nine pages and stating what the level owns.
**Where**: `docs/architecture/low-level-design/README.md`
**Depends on**: T28
**Reuses**: The nine pages T15 to T28 wrote
**Requirement**: ARCH-03

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] It lists nine pages, and every page it lists exists
- [ ] Every directory under `src/modules/`, plus `src/shared`, has exactly one page listed, and no page names a unit that does not exist
- [ ] It states what this level owns and what it does not, including the rule that a page cites the high level design rather than repeating it - spec.md's third edge case
- [ ] It records the commit the ORM columns were read at, so a stale page is datable
- [ ] Gate check passes: `npm run lint && npm run build && npx prettier --check docs/`

**Tests**: none
**Gate**: full

**Commit**: `docs(architecture): add the low level design index`

---

### T30: The consistency pass

**What**: Reduce every statement appearing in two documents to one, and confirm every internal link resolves.
**Where**: `docs/`
**Depends on**: T29
**Reuses**: Section 10's ownership table as the arbiter
**Requirement**: ARCH-04

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Every statement found in two documents is reduced to one, with the other pointing at it, following section 10's ownership table
- [ ] Every internal link across `docs/` resolves to a file that exists
- [ ] IF the pass finds a document contradicting the code THEN the document is corrected and the correction is named in this task's closure note
- [ ] The two DDD documents are unchanged except for sections 7 and 15, already edited by T9 and T14
- [ ] Gate check passes: `npm run lint && npm run build && npx prettier --check docs/`

**Tests**: none
**Gate**: full

**Commit**: `docs: reconcile the documentation set`

---

### T31: The README points at the set

**What**: Rewrite the `Architecture` section to link the four entry points, and bring the file Prettier-clean.
**Where**: `README.md`
**Depends on**: T30
**Reuses**: The four indexes and entry documents
**Requirement**: ARCH-04

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] The `Architecture` section links the overview, the high level design, the low level design index and the ADR index, and every link resolves
- [ ] It keeps the existing pointer to `docs/ddd/`, which owns the domain
- [ ] `npx prettier --check README.md` passes, closing the formatting gap feature 9's T10 left
- [ ] Gate check passes: `npm run lint && npm run build && npx prettier --check docs/ README.md`

**Tests**: none
**Gate**: full

**Commit**: `docs: link the architecture set from the README`

---

### T32: The Swagger review

**What**: Review the ten controllers so the published contract matches the implemented one.
**Where**: `src/modules/`
**Depends on**: T31
**Reuses**: The endpoint sections of the nine low level design pages, written from the same controllers
**Requirement**: ARCH-05

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Every route across the ten controllers carries an operation summary
- [ ] Every route documents each HTTP status it can answer with, its error statuses included
- [ ] Every permission-gated route documents the 403 its gate produces
- [ ] IF an annotation states something the route does not do THEN it is corrected to match the implemented behaviour, never the reverse
- [ ] The budget decision routes, which carry no permission decorator by design, document the owner-or-permission rule their handler applies rather than a 403 they never answer - spec.md's sixth edge case
- [ ] No route behaviour, DTO shape or test is changed
- [ ] Gate check passes: `npm run lint && npm run build && npm run test:unit && npm run test:integration && npm run test:e2e && npx prettier --check docs/`
- [ ] Test count: 1062 tests pass, unchanged - 640 unit, 228 integration, 194 e2e

**Tests**: none
**Gate**: build

**Commit**: `docs(api): align the Swagger annotations with the routes`

---

## Phase Execution Map

Phases run in sequence: 1, 2, 3a, 3b, 3c, 3d, 4.

```
Phase 1:   T1 → T2 → T3 → T4 → T5 → T6 → T7 → T8 → T9
Phase 2:   T8 → T10 → T11
           T10 → T12 → T13
           T10 → T14
Phase 3a:  T11 → T15 → T16 → T17 → T18
Phase 3b:  T18 → T19 → T20 → T21 → T22 → T23
Phase 3c:  T23 → T24 → T25 → T26 → T27
Phase 3d:  T27 → T28 → T29
Phase 4:   T29 → T30 → T31 → T32
```

Phase 2 is the only one that is not a chain: T11, T12 and T14 each depend on the overview rather
than on each other, and T13 depends on T12 for its mermaid conventions. Tasks still execute in
number order within the phase.

---

## Task Granularity Check

| Task | Scope | Status |
| --- | --- | --- |
| T1 | 5 ADRs from one source | ✅ Cohesive group, each file ~40 lines |
| T2, T3, T4, T5 | 3 to 4 ADRs from one source each | ✅ Cohesive group |
| T6, T7 | 2 ADRs each | ✅ Granular |
| T8, T9 | 1 file each | ✅ Granular |
| T10 to T14 | 1 file each | ✅ Granular |
| T15 to T29 | 1 file each | ✅ Granular |
| T30 | A pass over `docs/`, no new file | ✅ One deliverable: the set stops repeating itself |
| T31 | 1 file | ✅ Granular |
| T32 | 10 controllers, annotations only | ⚠️ Ten files, one mechanical pass with no behaviour change. Kept whole because splitting it per controller would produce ten commits that each leave the contract half-aligned |

ADR tasks group 2 to 5 records because an ADR is a short document from a source already in ADR
shape, while a low level design page is written from scratch by reading a module. Grouping the
former and splitting the latter keeps the tasks comparable in weight rather than in file count.

---

## Diagram-Definition Cross-Check

| Task | Depends On (body) | Diagram Shows | Status |
| --- | --- | --- | --- |
| T1 | None | phase start | ✅ Match |
| T2 | T1 | T1 → T2 | ✅ Match |
| T3 | T2 | T2 → T3 | ✅ Match |
| T4 | T3 | T3 → T4 | ✅ Match |
| T5 | T4 | T4 → T5 | ✅ Match |
| T6 | T5 | T5 → T6 | ✅ Match |
| T7 | T6 | T6 → T7 | ✅ Match |
| T8 | T7 | T7 → T8 | ✅ Match |
| T9 | T8 | T8 → T9 | ✅ Match |
| T10 | T8 | phase 2 start, backward to phase 1 | ✅ Match |
| T11 | T10 | T10 → T11 | ✅ Match |
| T12 | T10 | T11 → T12 in sequence, dependency on T10 | ✅ Match, noted under the map |
| T13 | T12 | T12 → T13 | ✅ Match |
| T14 | T10 | T13 → T14 in sequence, dependency on T10 | ✅ Match, noted under the map |
| T15 | T11 | phase 3a start, backward to phase 2 | ✅ Match |
| T16 | T15 | T15 → T16 | ✅ Match |
| T17 | T16 | T16 → T17 | ✅ Match |
| T18 | T17 | T17 → T18 | ✅ Match |
| T19 | T18 | phase 3b start, backward to phase 3a | ✅ Match |
| T20 | T19 | T19 → T20 | ✅ Match |
| T21 | T20 | T20 → T21 | ✅ Match |
| T22 | T21 | T21 → T22 | ✅ Match |
| T23 | T22 | T22 → T23 | ✅ Match |
| T24 | T23 | phase 3c start, backward to phase 3b | ✅ Match |
| T25 | T24 | T24 → T25 | ✅ Match |
| T26 | T25 | T25 → T26 | ✅ Match |
| T27 | T26 | T26 → T27 | ✅ Match |
| T28 | T27 | phase 3d start, backward to phase 3c | ✅ Match |
| T29 | T28 | T28 → T29 | ✅ Match |
| T30 | T29 | phase 4 start, backward to phase 3d | ✅ Match |
| T31 | T30 | T30 → T31 | ✅ Match |
| T32 | T31 | T31 → T32 | ✅ Match |

No dependency points at a later phase.

---

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| --- | --- | --- | --- | --- |
| T1 to T9 | Architecture or decision document | none | none | ✅ OK |
| T10, T11, T14 | Architecture or decision document | none | none | ✅ OK |
| T12, T13 | C4 diagram | none | none | ✅ OK |
| T15 to T17, T19, T20, T22, T24, T26, T28, T29 | Architecture or decision document | none | none | ✅ OK |
| T18, T21, T23, T25, T27 | C4 diagram | none | none | ✅ OK |
| T30, T31 | Architecture or decision document | none | none | ✅ OK |
| T32 | Swagger annotation on an existing controller | none | none | ✅ OK - the build gate proves the 194 e2e tests covering those routes stay green |

Every `none` traces to a matrix row that says `none`, not to deferral. T32 is the only task that
can touch `src/`, and it runs the full build gate for exactly that reason.
