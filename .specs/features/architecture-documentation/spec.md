# Architecture Documentation Specification

## Problem Statement

Nine features shipped without the documentation set `docs/ddd/implementation-plan.md` section 10
requires. That section intended the set to be written along the phases: the overview, the high
level design, the first two C4 diagrams and ADRs 0001 to 0008 before phase 0, then one low level
design page and one component diagram at the end of every module phase. None of it exists, so
`docs/` holds only the two DDD documents it started with. Every architectural decision the build
took lives in prose scattered across the plan's section 7, the event storming's section 14 and
`.specs/STATE.md`'s own Decisions log, in three different shapes, and one of them is now wrong: the
plan's trail decision still describes a post-commit subscriber, which AD-007 reversed and the code
has never done.

## Goals

- [ ] Every architectural decision taken in this project has exactly one home, in ADR shape, findable by number.
- [ ] A reader who has never seen this repository can understand the system at three levels: one page, one design document, and one page per module.
- [ ] The PostgreSQL justification the challenge asks for exists as a written artifact rather than as tribal knowledge.
- [ ] No statement about this system lives in two documents that can drift apart.

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
| --- | --- |
| An executable validation gate for the documentation (a mermaid parse script, an ADR linter, a link checker, `npm run docs:check`) | The user chose prose with human review over a shipped validation script. Every acceptance criterion below is instead written as a structural fact confirmable by reading or by `ls`/`grep`, so the Verifier still has something concrete to check without the repository carrying a new script and a new dependency it would then have to maintain. |
| A discrimination sensor on this feature | It follows from the line above. There is no behaviour to mutate: injecting a fault into a markdown file only produces a wrong sentence, and a wrong sentence is what the human review is for. Recorded in Assumptions so the Verifier does not treat its absence as a gap. |
| C4 level 4, the code level | Plan section 10 skips it deliberately: the aggregate map in the event storming and the low level design pages carry that detail in a form that survives refactoring better than a class diagram. |
| Any change to runtime behaviour, schema, routes or tests | This feature writes documents and reviews Swagger annotations. The one exception is a Swagger annotation that is factually wrong about a route, which ARCH-05 corrects in place. |
| Rewriting the event storming or the implementation plan beyond what section 10 instructs | Section 10 asks for two specific edits: section 7 becomes an index, and section 15 points at the overview. Anything else in those two documents stays as written, and they remain the source of truth for the domain. |
| An ADR for decisions taken before this project (NestJS, TypeScript, TypeORM as pre-existing stack choices) | The ADR list in section 10 is explicit about which decisions get a file. Backfilling ADRs for choices nobody in this project made would be fiction. |

---

## Assumptions & Open Questions

Every ambiguity is resolved or recorded here - nothing is left silently unclear.

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| The plan lists 22 ADRs, but two decisions were taken after it was written | 24 ADRs: the plan's 0001-0022, plus 0023 for AD-008 (the ambient transaction rule) and 0024 for AD-009 (the optimistic version guard). A 25th was added during Execute, see the row below | Section 10's own rule is "whenever a decision is taken, one ADR, numbered next". Both are recorded in `.specs/STATE.md` with context, reason, trade-off and scope already, and both changed how every repository in the project is written. Leaving them out would make the ADR set describe the design as planned rather than as built. | y |
| Section 10 contradicts itself on C4 component diagrams: the file listing says `c4-components-<module>.mmd`, the prose says "one diagram per bounded context" | One diagram per bounded context, five in total, named `c4-components-<context>.mmd` | The prose explains the intent and the file listing is shorthand. A per-module diagram of `authentication` alone would hold two boxes, while hiding the cross-module calls that are the entire reason level 3 is worth drawing. The five contexts are named in event storming section 4. | y |
| Whether `src/shared` gets a low level design page | Yes, nine pages in total: the eight modules plus `shared` | `Money`, `TransactionRunner`/`currentEntityManager()`, `AggregateRoot`, the error-kind to HTTP mapping and the global exception filter are load-bearing and belong to no module. The high level design owns the conventions; this page owns the concrete classes, which is the split section 10 already draws between the two levels. | y |
| No executable gate exists for this feature, so its per-task Gate cannot be a test run | Each task's gate is `npm run lint && npm run build` (proving nothing in the repository broke) plus the structural checks its own acceptance criteria state, run by reading | The user chose prose with human review. The build gate still catches the realistic failure mode of a documentation task: an edit that accidentally touches a source file. | y |
| The Verifier runs without a discrimination sensor | The Verifier performs the spec-anchored outcome check and the structural confirmations, and records "sensor: not applicable, documentation feature, no behaviour to mutate" in `validation.md` | The skill makes the sensor mandatory where behaviour exists. Recording the reason explicitly is the honest form, rather than injecting a fault into prose and calling the resulting nonsense a killed mutant. | y |
| ADR 0021's subject as listed in section 10 is already correct, while section 7's prose block on the same decision is stale | The ADR file states what was built, AD-007's version, and section 7's prose is replaced by an index row rather than corrected in place | Section 10 says the decisions "move" rather than being copied, precisely so two versions cannot drift. Correcting the prose and then also writing the ADR would recreate the problem. | y |
| Section 7 holds 15 decision blocks while section 10 lists 22 ADR subjects | The records without a prose block are written from the event storming's answers and the plan's own narrative, cited in the ADR's Context | The decisions were taken and are recorded; only their prose home differs. An ADR whose context cannot be traced to an existing document is not written and is raised instead. | y |
| Found during T2: one section 7 block, "any deviation from an approved budget cancels the work order", was never given a number by section 10, and T9 deletes section 7 | It becomes ADR 0025 with status `Superseded by 0018` | The code contradicts it: `WorkOrder.submitSupplementaryBudget` runs from `IN_EXECUTION`, opens the next numbered round and returns the order to `AWAITING_APPROVAL`, which is the very alternative the block records as rejected. Section 10's own rule keeps a superseded record rather than deleting it, so the reasoning behind the reversal stays readable. Without a number the decision would vanish with section 7. | y |
| Where the ADR set lands relative to `.specs/STATE.md`'s Decisions log | `.specs/STATE.md` keeps its `AD-NNN` entries unchanged; each ADR that corresponds to one names it in a `Source` line | The Decisions log is the skill's working memory across sessions and is read on every resume. Emptying it into `docs/adr/` would break that flow, and pointing each way keeps one canonical text per decision. | y |

**Open questions:** none - all resolved or logged above.

---

## Implicit-Requirement Dimensions Sweep

Scope is Large, so every dimension resolves to a requirement or an explicit `N/A because`.

| Dimension | Resolution |
| --- | --- |
| Input validation & bounds | N/A because this feature adds no input path. It writes and edits files. |
| Failure / partial-failure states | N/A because nothing runs. A half-written document is caught by review, not by a rollback. |
| Idempotency / retry / duplicate handling | Real, as the duplication rule: no statement lives in two documents. ARCH-04. |
| Auth boundaries & rate limits | N/A because the feature adds no route and no actor. |
| Concurrency / ordering | N/A because the documents are written sequentially by one author in one branch. |
| Data lifecycle / expiry | Real, as the ADR lifecycle: a superseded ADR is never edited or deleted. ARCH-01. |
| Observability | N/A because nothing runs. |
| External-dependency failure | N/A because the set has no runtime dependency. Mermaid renders on GitHub and no build step consumes the diagrams. |
| State-transition integrity | Real, as the ADR status set: `Accepted`, `Superseded by NNNN`, `Deprecated`, and nothing else. ARCH-01. |

---

## User Stories

### P1: The decisions become findable ⭐ MVP

**User Story**: As an engineer joining this codebase, I want every architectural decision in one numbered place with its alternatives and consequences, so that I can tell what was decided from what merely happened.

**Why P1**: It is the half of the set the challenge grades directly, it includes the PostgreSQL justification asked for by name, and it is where the drift already started.

**Acceptance Criteria**:

1. The repository SHALL carry `docs/adr/` holding 25 decision records numbered `0001` to `0025`, with no number skipped and no number used twice.
2. The repository SHALL name every decision record `NNNN-<kebab-case-title>.md`, matching the subject the plan's section 10 table gives for numbers `0001` to `0022`.
3. WHEN a decision record is written THEN it SHALL carry a Context, a Decision, the Alternatives considered, and the Consequences, each as its own section.
4. Each decision record SHALL carry exactly one status, drawn from `Accepted`, `Superseded by NNNN` or `Deprecated`.
5. IF a decision is later reversed THEN the superseding record SHALL be written as a new number and the reversed record SHALL be marked `Superseded by NNNN` rather than edited or deleted.
6. `docs/adr/0002-*.md` SHALL justify PostgreSQL on the four grounds the plan states: relational integrity across work orders, items and stock movements; the transactional guarantee the part withdrawal needs across two aggregates in two modules; partial unique indexes for the soft delete rules; and integer arithmetic in `bigint` for money in cents.
7. `docs/adr/0023-*.md` SHALL record AD-008, the rule that a repository reachable from a cross-module write resolves its `EntityManager` through `currentEntityManager()` before opening its own transaction.
8. `docs/adr/0024-*.md` SHALL record AD-009, the optimistic version guard on `TypeOrmWorkOrderRepository.save` and the 409 it produces.
9. `docs/adr/0025-*.md` SHALL record the superseded decision that any deviation from an approved budget cancels the work order, with status `Superseded by 0018`, since the code authorises additional work in place through numbered rounds instead.
10. WHEN a decision record corresponds to an entry in `.specs/STATE.md`'s Decisions log THEN it SHALL name that `AD-NNN` identifier, and the log entry SHALL remain in place unchanged.
11. `docs/adr/README.md` SHALL list every record by number, title and status, and SHALL contain no decision text of its own.
12. WHEN this story is complete THEN section 7 of `docs/ddd/implementation-plan.md` SHALL hold only an index pointing at `docs/adr/`, and SHALL no longer hold the decision prose it holds today, including the stale block describing the work order trail as written by a subscriber.

**Independent Test**: List `docs/adr/`, count 24 records plus the index, open `0002` and find the four PostgreSQL grounds, then open the plan's section 7 and find rows pointing at files rather than decision blocks.

---

### P1: The system explains itself in two pages and two diagrams ⭐ MVP

**User Story**: As a reviewer with fifteen minutes, I want to understand what this system is and how it hangs together before reading any code, so that the module structure and the guard chain are not something I have to reverse-engineer.

**Why P1**: Without it the ADRs are a pile of decisions with no system around them, and the low level design pages have nothing to point up at.

**Acceptance Criteria**:

1. `docs/architecture/architecture-overview.md` SHALL describe the system in one page: what it is, the four business actors, the five bounded contexts named in the event storming's section 4, the three runtime pieces, and the constraints that shaped it.
2. The overview SHALL contain no module internals, no schema detail and no endpoint list, pointing instead at the high level design and the low level design pages.
3. `docs/architecture/high-level-design.md` SHALL describe the modules and what each owns, how they communicate, the CQRS wiring, the guard chain in the order the guards actually run, the transaction boundaries that span two modules, and the identifier and money conventions.
4. The high level design SHALL contain no per-class or per-column detail and no domain narrative, pointing instead at the low level design pages and at the event storming.
5. `docs/architecture/c4-system-context.mmd` SHALL hold a `C4Context` diagram carrying the four business actors and this one system, with no external system.
6. `docs/architecture/c4-containers.mmd` SHALL hold a `C4Container` diagram carrying the NestJS application, PostgreSQL and Redis.
7. WHEN this story is complete THEN section 15 of `docs/ddd/event-storming.md` SHALL point at the overview instead of restating the architectural implications it holds today.
8. Every statement in these two documents SHALL match the code as built, and each SHALL cite the file or directory a reader can open to confirm it.

**Independent Test**: Read the overview and the high level design end to end without opening any other document, then open three cited paths at random and find what the sentence claimed.

---

### P2: Every module has a design page and every context a component diagram

**User Story**: As an engineer about to change one module, I want that module's aggregates, invariants, commands, ports, entities, endpoints and errors on one page, so that I can see its boundary without reading all of its source.

**Why P2**: It is the largest part of the set by file count and the part the plan itself says cannot be written before the code exists. The system is understandable without it; changing a module safely is harder.

**Acceptance Criteria**:

1. `docs/architecture/low-level-design/` SHALL hold one page per module, nine in total: `authentication`, `authorization`, `customers`, `inventory`, `services`, `users`, `vehicles`, `work-orders` and `shared`.
2. Every page under `low-level-design/` SHALL correspond to a directory that exists under `src/modules/` or to `src/shared`, and every such directory SHALL have exactly one page.
3. WHEN a module page is written THEN it SHALL cover that module's aggregates and their invariants, its value objects, its commands and handlers, its queries and ports, its repository and mapper, its ORM entities and columns, its endpoints, and its errors with their HTTP mapping.
4. A module page SHALL describe nothing another module owns, and SHALL state no decision, pointing at the ADR instead.
5. `docs/architecture/low-level-design/README.md` SHALL list the nine pages and state what the level owns, carrying no module detail of its own.
6. The repository SHALL carry five component diagrams, one per bounded context, named `c4-components-<context>.mmd` under `docs/architecture/`.
7. Every component diagram SHALL hold a `C4Component` diagram showing that context's controllers, handlers, aggregates, repositories and ports, and every call that crosses into another module.
8. IF a context spans more than one module THEN its diagram SHALL show each module as its own boundary within the context, so that `Identity & Access` reads as three modules and `Customer Management` as two.

**Independent Test**: For each of the nine directories, find its page and check the page names that module's real aggregate and real endpoints; open the `Identity & Access` diagram and count three module boundaries.

---

### P3: The documents stop repeating each other

**User Story**: As a maintainer, I want each fact stated in exactly one document, so that a change lands in one place and the set cannot drift into disagreeing with itself.

**Why P3**: The set is usable before this pass. The pass is what keeps it usable a year from now, and it can only run once every document exists.

**Acceptance Criteria**:

1. WHEN the consistency pass runs THEN every statement appearing in two documents SHALL be reduced to one, with the other pointing at it, following the ownership table in the plan's section 10.
2. Every internal link across `docs/` SHALL resolve to a file that exists in the repository.
3. The `Architecture` section of `README.md` SHALL link the four entry points of the set: the overview, the high level design, the low level design index and the ADR index.
4. IF the pass finds a document making a claim the code contradicts THEN it SHALL correct the document, and SHALL record the correction in the feature's own `tasks.md` closure notes rather than silently.
5. `docs/ddd/event-storming.md` and `docs/ddd/implementation-plan.md` SHALL remain the source of truth for the domain, edited only where sections 7 and 15 instruct.

**Independent Test**: Follow every link in `README.md`'s Architecture section and in the four index pages, and land on an existing file each time.

---

### P3: Swagger describes every route as it behaves

**User Story**: As someone reading the API through Swagger UI, I want every route to state what it does and which failures it can answer with, so that the published contract matches the implemented one.

**Why P3**: The routes work and carry annotations already. This is a review pass over ten controllers, valuable but not what makes the set complete.

**Acceptance Criteria**:

1. Every route across the ten controllers SHALL carry an operation summary describing what it does.
2. Every route SHALL document each HTTP status it can answer with, including its error statuses.
3. IF a route is gated by a permission THEN its documented responses SHALL include the 403 that gate produces.
4. IF an annotation states something the route does not do THEN the review SHALL correct the annotation to match the implemented behaviour.
5. The review SHALL change no route behaviour, no DTO shape and no test.

**Independent Test**: Start the app, open `http://localhost:13000/api/docs`, and find a summary and a documented error status on every route.

---

## Edge Cases

- IF an ADR subject in section 10's table describes a decision no existing document explains THEN the ADR SHALL NOT be invented, and the gap SHALL be raised in the task's closure notes instead.
- IF a page covers code that holds no aggregate of its own, as `shared` does not THEN it SHALL state that explicitly and describe what it does hold, rather than leaving the section blank.
- IF the low level design of a module would repeat the high level design THEN the module page SHALL cite it instead, since duplication is what the pass in ARCH-04 removes.
- IF a bounded context maps to exactly one module THEN its component diagram SHALL still be drawn, so that the five contexts are covered uniformly.
- WHEN a decision record corresponds to no `AD-NNN` entry, as the pre-build decisions `0001` to `0005` do THEN it SHALL omit the `Source` line rather than invent an identifier.
- IF the Swagger review finds a route with no permission gate, as the budget decision routes have none by design THEN it SHALL document the rule the handler applies rather than a 403 the route never answers.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| ARCH-01 | P1: The decisions become findable | Specify | Pending |
| ARCH-02 | P1: The system explains itself in two pages and two diagrams | Specify | Pending |
| ARCH-03 | P2: Every module has a design page and every context a component diagram | Specify | Pending |
| ARCH-04 | P3: The documents stop repeating each other | Specify | Pending |
| ARCH-05 | P3: Swagger describes every route as it behaves | Specify | Pending |

**ID format:** `ARCH-NN`

**Status values:** Pending → In Design → In Tasks → Implementing → Verified

---

## Success Criteria

- [ ] `docs/adr/` holds 25 records numbered without a gap, each with one status from the fixed set.
- [ ] The PostgreSQL justification exists as `0002` and states the four grounds the plan names.
- [ ] AD-008 and AD-009, taken during the build, have records of their own.
- [ ] Nine low level design pages exist, one per module directory plus `shared`, and no page names a module that does not exist.
- [ ] Seven mermaid diagrams exist: one context, one container, five component.
- [ ] Section 7 of the plan holds an index, and section 15 of the event storming points at the overview.
- [ ] Every internal link across `docs/` resolves.
- [ ] `npm run lint && npm run build` stays clean, and the test suites are untouched at 1062 passing.
