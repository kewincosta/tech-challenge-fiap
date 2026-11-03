# Tracking And Metrics Specification

## Problem Statement

A customer today has no way to see their own work order. Every question about where the car is arrives by phone, and the only answer the system can give requires a staff member to look it up. On the other side, the workshop has recorded every execution start and every completion for eight features now, and has never once been able to read back how long its work actually takes. This feature adds the three read models that close both gaps, and turns the project into something a stranger can clone and run.

## Goals

- [ ] A customer reads their own work orders, and only their own, resolved from the token rather than from an id they pass.
- [ ] The administration reads the average execution time, filtered by service and by date range when it wants.
- [ ] The critical paths carry an enforced coverage floor, so a later change that guts a domain test fails the build rather than passing quietly.
- [ ] Someone who has never seen this repository can clone it, start it, and run every test suite from the README alone.

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
| --- | --- |
| The architecture documentation set: `docs/architecture/`, `docs/adr/`, the C4 diagrams and the per-module low-level design pages | The user split this out as its own feature after the roadmap review that opened this one. It is 24 general files plus 16 per-module files, none of which any test can assert the correctness of, and mixing them into this `tasks.md` would give the Verifier and its discrimination sensor nothing to bite on for half the tasks. Plan phase 13 lists them; feature 10 delivers them. |
| The written PostgreSQL justification the challenge asks for | It is ADR 0002 in plan section 10's own numbering, so it travels with the ADR set into feature 10 rather than being orphaned here. |
| A Swagger review pass over every controller | Same reason: it is a documentation review with no executable gate. Every route this feature adds still carries its own Swagger decorators, written as the routes are written. |
| Any new command, event, policy or aggregate | Plan phase 13 states there are none. These are read models, and per section 13 the read side never travels through an aggregate. |
| An index on `work_orders (status, completed_at)` | Plan phase 13 calls it conditional on the metric getting slow, "which is unlikely at this size". No migration until a measurement asks for one. |

---

## Assumptions & Open Questions

Every ambiguity is resolved or recorded here. The domain rules come from `docs/ddd/implementation-plan.md` phase 13 and `docs/ddd/event-storming.md` (section 13's read models, rules 43 and 44, and H10). What follows are the points those documents left unstated.

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| The permission on `GET /work-orders/me` and `GET /work-orders/me/{number}` | `work-orders:read-own` | The permission exists and is seeded to `CUSTOMER` and `SUPER_ADMIN` already, named for exactly this. `GET /vehicles/me` carries no decorator, but only because no `vehicles:read-own` was ever seeded - the divergence is the permission catalog's, not a new convention. | y |
| The unit the metric answers in | Integer seconds, in a field named for the unit | The same reasoning AD-002 applies to money: an integer in a named unit, with formatting left to the client. A float of hours would invite three rounding implementations. | y |
| Which work orders the metric averages | `COMPLETED` and `DELIVERED` only, over `executionStartedAt` to `completedAt` | H10 decides the pair of timestamps. A work order still in execution has no end, and a cancelled one never completed - plan phase 13's own unit tests name both exclusions. | y |
| The metric with nothing to average | Zero, with the work order count alongside it | Plan phase 13's first unit test says "should return zero when no work order has been completed". The count travels with it so a zero average is never mistaken for a fast workshop. | y |
| What the service filter means for a work order carrying several services | The work order's full elapsed time counts once for each service it carries, and the response says so | Plan phase 13 names this directly as a risk: "attributing one elapsed time to several services is an approximation and the response should say so". The response carries an explicit flag whenever the service filter is applied. | y |
| What the date range filters on | `completedAt`, inclusive at both ends | The metric is about work finished in a period. Filtering on `executionStartedAt` would let a work order started inside the range but finished long after it distort the period it did not belong to. | y |
| What a customer sees on `GET /work-orders/me/{number}` | The same `WorkOrderResponseDto` a staff read returns | Section 13 asks for "progress of one of the customer's own work orders, with the budget when it is waiting on them", which the existing DTO already carries in full. A second, reduced DTO would be a parallel shape to keep in step for no stated requirement. | y |
| Route declaration order | Every `me` route is declared before every `:number` route | Plan phase 13's own Risks section names this, and `UsersController` and `VehiclesController` both already declare `me` first. | y |
| Where the metric's aggregation runs | In SQL, in a new metrics query port and adapter beside `WorkOrderQueryPort` | Plan phase 13 says "a metrics query port running the aggregation in SQL". Loading every work order to average in TypeScript would read the whole table to answer one number. | y |
| Which coverage metrics the floor applies to | Statements, branches, functions and lines, all at 80, per critical path | A floor on lines alone passes today everywhere and would prove nothing about the branches a domain rule is made of. Measured before writing this spec: every critical path clears 80 on statements and lines already, and `customers/domain/value-objects` sits at 76.31 branches and 75 functions, driven by `address.ts` (lines 48 and 62-72 uncovered) and `phone-number.ts` (lines 22-23). Closing that gap is this feature's work. | y |
| What the README links to for architecture | `docs/ddd/` only, for now | The architecture set does not exist until feature 10. A link to a file that is not there is worse than no link, and feature 10 adds them when it creates them. | y |

**Open questions:** none, all resolved or logged above.

---

## User Stories

### P1: A customer follows their own work orders ⭐ MVP

**User Story**: As a customer, I want to see my own work orders without calling the workshop, so that I know where my car is.

**Why P1**: It is the only customer-facing requirement in the whole challenge, and the reason `work-orders:read-own` was seeded eight features ago.

**Acceptance Criteria**:

1. WHEN an actor holding `work-orders:read-own` reads their own work order list THEN the system SHALL return every work order belonging to the customer resolved from their token, and no other.
2. WHILE the acting user carries no customer record the system SHALL return an empty list rather than an error.
3. IF the actor lacks `work-orders:read-own` THEN the system SHALL refuse the read with HTTP 403.
4. IF no token is presented THEN the system SHALL refuse the read with HTTP 401.
5. WHEN an actor holding `work-orders:read-own` reads one of their own work orders by number THEN the system SHALL return it in full, with its items, its budget rounds and its closing fields.
6. IF the work order belongs to another customer THEN the system SHALL respond with HTTP 404, never 403 and never 200.
7. IF no work order carries the requested number THEN the system SHALL respond with HTTP 404, indistinguishable from the previous case.

**Independent Test**: Open work orders for two different customers, read `/work-orders/me` as the first, and see only their own; then read the second customer's number through `/work-orders/me/{number}` as the first and receive 404.

---

### P1: The workshop reads how long its work takes ⭐ MVP

**User Story**: As an administrator, I want the average execution time, so that the workshop can see how long a job actually takes rather than guessing.

**Why P1**: It is the one metric the challenge names, and the data to compute it has been recorded since the execution and completion timestamps landed.

**Acceptance Criteria**:

1. WHEN an actor holding `metrics:read` reads the average execution time THEN the system SHALL return the mean elapsed time between the moment execution started and the moment the work order was completed, in whole seconds, alongside the number of work orders it averaged.
2. The system SHALL include only work orders in `COMPLETED` or `DELIVERED` in that average.
3. The system SHALL exclude work orders still in execution and work orders that were cancelled.
4. WHILE no work order has ever been completed the system SHALL return an average of zero and a count of zero, rather than an error or a null.
5. WHEN the read carries a service filter THEN the system SHALL average only the work orders carrying that service, and SHALL mark the response as an approximation.
6. WHEN the read carries a date range THEN the system SHALL average only the work orders completed within it, inclusive at both ends.
7. IF the actor lacks `metrics:read` THEN the system SHALL refuse the read with HTTP 403.
8. The system SHALL compute the average in SQL, never by loading the work orders into memory to average them.

**Independent Test**: Seed three work orders with known execution and completion timestamps, one of them cancelled, and read back an average over the two that completed, ignoring the cancelled one.

---

### P2: The critical paths carry an enforced coverage floor

**User Story**: As a maintainer, I want the domain paths to fail the build when their coverage drops, so that a later change cannot quietly delete the tests that hold a rule up.

**Why P2**: It protects work already delivered rather than delivering new behaviour, so it follows the two reads.

**Acceptance Criteria**:

1. The system SHALL enforce a floor of 80 on statements, branches, functions and lines for each critical path plan section 8 names.
2. WHEN a coverage run falls below that floor on any of those paths THEN the run SHALL fail.
3. The system SHALL raise `customers/domain/value-objects` above the floor on branches and functions, which is where it sits below it today.
4. WHILE the floor is enforced the existing suites SHALL keep passing unchanged, so the floor never becomes a reason to weaken a test.

**Independent Test**: Run the coverage suite and see it pass; drop a domain test file, run it again, and see it fail on the floor rather than on the missing file.

---

### P2: The project runs from its README

**User Story**: As someone who has never seen this repository, I want to clone it and get it running, so that I can evaluate it without asking anybody how.

**Why P2**: It gates nothing in the code, and every command it documents already works.

**Acceptance Criteria**:

1. The README SHALL state the prerequisites, the environment setup, how to start the infrastructure, how to run the migrations, and how to seed the first super administrator.
2. The README SHALL name each test suite and the command that runs it.
3. The README SHALL give the URL where the API documentation is served.
4. Every command the README states SHALL work as written against a clean clone.

**Independent Test**: Follow the README top to bottom against a fresh checkout and reach a running API with a seeded administrator, without reading any other file.

---

## Edge Cases

- WHILE the acting user carries no customer record the system SHALL answer an empty list from the customer's own list route, never an error.
- IF a customer reads a work order number that belongs to somebody else THEN the answer SHALL be identical to the answer for a number nobody carries.
- WHILE no work order has ever been completed the metric SHALL answer zero with a count of zero.
- IF the date range filter excludes every completed work order THEN the metric SHALL answer zero with a count of zero, the same shape as having no data at all.
- WHEN a work order carrying three services is averaged under a service filter THEN its elapsed time SHALL count once for each of the three, and the response SHALL say it is an approximation.
- IF a work order reached `DELIVERED` THEN the metric SHALL still count it, since it completed before it was delivered.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| TAM-01 | P1: A customer follows their own work orders | Design | Pending |
| TAM-02 | P1: The workshop reads how long its work takes | Design | Pending |
| TAM-03 | P2: The critical paths carry an enforced coverage floor | Design | Pending |
| TAM-04 | P2: The project runs from its README | Design | Pending |

**ID format:** `TAM-NN`

**Status values:** Pending → In Design → In Tasks → Implementing → Verified

**Coverage:** 4 total, 0 mapped to tasks, 4 unmapped

---

## Success Criteria

- [ ] A customer reaches their own work orders and nothing else, proven with two customers rather than one.
- [ ] The metric is computed by the database, proven by the adapter carrying the aggregation and no handler iterating work orders.
- [ ] The coverage floor fails a run when a domain test is removed, proven by removing one rather than by asserting the configuration.
- [ ] A clean clone reaches a running API by following the README alone.
