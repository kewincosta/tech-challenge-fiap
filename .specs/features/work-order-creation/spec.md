# Work Order Creation Specification

## Problem Statement

The workshop has customers, vehicles, a service catalog and stock, and nothing that ties them to one visit. A car arrives and there is no record saying whose it is, what was asked for, who took it in, or what happened since. This feature opens that record: a work order with a number the counter can say out loud, the requested services and planned parts on it, and an append-only trail that every later phase writes to.

## Goals

- [ ] One visit is one record, addressed by a human readable number, carrying who created it and for which vehicle.
- [ ] A vehicle has at most one work order that is not finished, enforced by the database and not only by the application.
- [ ] The requested services and planned parts sit on the work order, snapshotted at the moment they were added, without touching the stock.
- [ ] Every step recorded on a work order lands on its trail, written in the same transaction as the work order itself.

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
| --- | --- |
| Diagnosis, budget, approval, execution start, part withdrawal, return, discount, completion, delivery and cancellation | Plan phases 9 to 12. This feature builds the seven-state enum and only the transitions its own five commands need. `Cancel Work Order` is reachable from `RECEIVED` in section 11's table and still belongs to phase 12, which owns the cancellation columns and the `work-orders:cancel-in-execution` rule. |
| The `Budget` child entity and budget rounds | Phase 9 owns `work_order_budgets`, `budget_id` and `budgeted_unit_price_cents`, and names all three in its own Database Changes. Item rows here carry the add-time catalog snapshot, never the frozen budget price. The "items belong to a round" invariant arrives with the rounds. |
| `Get My Work Orders` and `Get My Work Order` | Section 13's customer-scoped reads land in plan phase 13, with `work-orders:read-own` and the ownership check that answers 404 rather than 403. |
| Average execution time and the operational metrics | Plan phase 13. |
| Charging, totals, and any arithmetic over `withdrawn_quantity` | The column is created here because phase 8 names it and phase 11 states it creates no column of its own. Nothing writes or reads it until phase 11. |

---

## Assumptions & Open Questions

Every ambiguity is resolved or recorded here. The domain rules come from `docs/ddd/implementation-plan.md` phase 8 and `docs/ddd/event-storming.md` (section 9's WorkOrder aggregate, section 10 rules 26 to 46, section 11's state machine, section 12's context interactions, section 13's read models, H1, H16, H17, H29, H39). What follows are the points those documents left unstated or state inconsistently.

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| The composition of the work order number | Six characters drawn from `A-Z` and `0-9`, a hyphen, then the four-digit year the work order was created in, stored in `varchar(11)` | H17 gives `A1B090-2026` as the shape and phase 8 sizes the column at 11, which is exactly `6 + 1 + 4`. The sample's first block mixes letters and digits, so the alphabet is both. | y |
| What blocks a second work order for a vehicle | Every status except `DELIVERED` and `CANCELED`, so `RECEIVED`, `IN_DIAGNOSIS`, `AWAITING_APPROVAL`, `IN_EXECUTION` and `COMPLETED` all block one | Section 11 names `DELIVERED` and `CANCELED` as the terminal states, and phase 8 says the partial unique index covers the vehicle "where the status is not terminal". A completed car is still in the workshop until it is handed over. | y |
| The state `Plan Part` is allowed in | `IN_DIAGNOSIS` and `IN_EXECUTION`, exactly as section 11's table says, which makes the command unreachable end to end until feature 6 opens the diagnosis | Phase 8 lists the command among its own, and section 11 owns which states accept it. The command, its guard and its route are built here; the refusal in `RECEIVED` is the behaviour this feature can prove over HTTP. Confirmed with the product owner rather than widened silently. | y |
| The permission on the write routes | `work-orders:manage` on create, add service, plan part, remove item and assign mechanic; `audit:read` on the trail | Phase 8 states only two permission expectations: 403 without `work-orders:manage` on creation, and the trail behind `audit:read`. In this feature the only reachable state is `RECEIVED`, where the actor is the counter, and `SERVICE_ADVISOR` holds `work-orders:manage`. The mechanic's own entry point arrives with the diagnosis in feature 6, which can widen a guard then. | y |
| Which columns this migration creates | Only the ones phase 8's own Database Changes block names | Phases 9, 10 and 12 each name their own columns on `work_orders` explicitly: the diagnosis timestamps, the budget decision and execution start, then completion, delivery, cancellation and discount. Phase 8's trailing "plus the lifecycle columns of later phases" is a summary of where the table is heading, not an instruction to create them now. | y |
| The one column deliberately ahead of its command | `work_order_parts.withdrawn_quantity integer not null default 0` | Phase 8 names it and phase 11 says it creates "None beyond the columns created in phases 7 and 8". Same reasoning as `inventory-and-stock-movements`: a dormant column costs nothing, dormant behaviour is what gets deferred. | y |
| A removed vehicle against a deactivated customer | A removed vehicle answers 404, a deactivated customer answers 422 | `TypeOrmVehicleQueryAdapter.getById` filters `deleted_at IS NULL`, so a removed vehicle is indistinguishable from one that never existed. `TypeOrmCustomerQueryAdapter.getById` is deliberately unfiltered, so a deactivated customer comes back carrying its status and earns a precise refusal. Both adapters made that choice in features 2 and 3; this feature consumes them as they are instead of changing another module's read. | y |
| What the routes are keyed by | The human readable number, as in `GET /api/v1/work-orders/A1B090-2026`, with items addressed by their own external uuid on the removal route | Phase 8's API list uses `{number}` on every work order route and `{itemExternalId}` on the removal. The external uuid stays on every response, so AD-001 holds. | y |
| Where `event_type` on a trail entry comes from | An explicit constant declared per event class | Phase 8's Risks name the hazard directly: reading `constructor.name` means renaming an event class silently changes what lands in the column, and the trail is append-only, so the old rows are never corrected. | y |
| The non-draining read on `AggregateRoot` | A `domainEvents` getter added beside `pullDomainEvents`, which keeps draining | AD-007, H39 and phase 8's Risks all prescribe it. The repository reads the events to write the trail, and the handler still publishes them afterwards, so the existing drain has to stay untouched. This is the shared kernel's only change in this feature. | y |
| What a service item and a part item snapshot | Service item: the service identifier, its name and its unit price at the moment it was added, with no quantity. Part item: the inventory item identifier, its SKU, its name, its unit price at that moment, the planned quantity, and a withdrawn quantity of zero | Phase 8 says "the snapshot columns" without listing them. Section 12 names exactly what crosses each boundary: name, price and duration from the catalog, and name, SKU and unit price from inventory. Phase 8's own test list says "should add a requested service" with no quantity and "should not plan a zero quantity" for parts, so quantity belongs to parts alone. | y |
| Adding the same service twice | Allowed, as two separate items | Nothing in the documents forbids it, and with no quantity on a service item, a second line is the only way to record the same service twice. | y |
| Removing an item | One route resolves the external identifier across both item tables, and an item belonging to another work order answers 404 | Phase 8 gives one removal route, `DELETE /work-orders/{number}/items/{itemExternalId}`, for both kinds. Answering 404 rather than 403 matches the ownership behaviour section 13 already prescribes for work orders. | y |

**Open questions:** none, all resolved or logged above.

---

## User Stories

### P1: A visit becomes one record with a number ⭐ MVP

**User Story**: As a service advisor, I want to open a work order for a customer's vehicle and get back a number I can say out loud, so that everything about this visit has one place to live and the workshop can find it at the counter.

**Why P1**: Nothing else in this feature, and nothing in features 6 to 8, has anything to attach to without the record.

**Acceptance Criteria**:

1. WHEN an actor holding `work-orders:manage` creates a work order for an active customer and a vehicle that customer owns THEN the system SHALL store it as `RECEIVED`, assign it a number matching `[A-Z0-9]{6}-[0-9]{4}`, record the acting user as its creator, and return that number with the external identifier.
2. WHEN a work order is created THEN the system SHALL copy the customer name and the vehicle plate, brand, model and year onto the record.
3. WHILE a work order exists the system SHALL keep that snapshot as it was copied, even when the customer or the vehicle is edited afterwards.
4. IF the customer is deactivated THEN the system SHALL refuse the creation with HTTP 422.
5. IF the vehicle belongs to a different customer THEN the system SHALL refuse the creation with HTTP 422.
6. IF the customer or the vehicle does not exist THEN the system SHALL refuse the creation with HTTP 404.
7. IF the vehicle already has a work order in any state other than `DELIVERED` or `CANCELED` THEN the system SHALL refuse the creation with HTTP 409.
8. The system SHALL enforce at the database level that two work orders in a non-terminal state never share a vehicle.
9. WHILE assigning the number the system SHALL retry on a collision with the unique index up to five times, and SHALL fail the request after the fifth rather than store a work order without a number.
10. IF the actor lacks `work-orders:manage` THEN the system SHALL refuse the creation with HTTP 403.

**Independent Test**: Open a work order as a service advisor for an active customer's vehicle, read back a number in the `A1B090-2026` shape, then attempt a second one for the same vehicle and receive 409.

---

### P1: The requested work sits on the work order ⭐ MVP

**User Story**: As a service advisor, I want to record the services the customer asked for and the parts the workshop plans to use, so that the visit carries its own scope before anybody prices it.

**Why P1**: The diagnosis in feature 6 generates its budget from these items, and rule 29 says no actor ever supplies a total.

**Acceptance Criteria**:

1. WHEN an actor holding `work-orders:manage` adds a catalog service to a work order in `RECEIVED`, `IN_DIAGNOSIS` or `IN_EXECUTION` THEN the system SHALL append a service item carrying the service identifier, its name and its unit price as they stand at that moment.
2. WHEN the same service is added twice THEN the system SHALL record two separate items, a service item carrying no quantity.
3. IF the service is deactivated THEN the system SHALL refuse the addition with HTTP 422.
4. IF the service does not exist THEN the system SHALL refuse the addition with HTTP 404.
5. WHEN an actor plans a part on a work order in `IN_DIAGNOSIS` or `IN_EXECUTION` THEN the system SHALL append a part item carrying the inventory item identifier, its SKU, its name, its unit price at that moment, the planned quantity and a withdrawn quantity of zero.
6. WHILE planning a part the system SHALL leave the item's quantity on hand untouched, because a part is taken from the shelf at withdrawal and not at planning.
7. IF a part is planned on a work order in any state other than `IN_DIAGNOSIS` or `IN_EXECUTION` THEN the system SHALL refuse it with HTTP 422.
8. IF the planned quantity is zero or negative THEN the system SHALL refuse the plan with HTTP 400.
9. IF the inventory item does not exist THEN the system SHALL refuse the plan with HTTP 404.
10. WHEN an actor removes an item from a work order in `RECEIVED`, `IN_DIAGNOSIS` or `IN_EXECUTION` THEN the system SHALL delete that item and SHALL leave every other item of that work order in place.
11. IF the addressed item belongs to a different work order or does not exist THEN the system SHALL respond with HTTP 404.
12. IF the actor lacks `work-orders:manage` THEN the system SHALL refuse the addition, the plan and the removal with HTTP 403.

**Independent Test**: Add two services to a work order, confirm both appear as separate items with their prices frozen, remove one, and confirm the other survives.

---

### P1: Every step lands on the trail, with the record ⭐ MVP

**User Story**: As an administrator, I want each step of a work order recorded as it happens, so that the question of who did what is answered by the record instead of by memory.

**Why P1**: Rule 41 makes the trail append-only and mandatory for every transition, and AD-007 makes it inseparable from the write it describes.

**Acceptance Criteria**:

1. WHEN the repository saves a work order THEN the system SHALL write one trail entry per domain event the aggregate recorded, inside the same transaction that persists the aggregate (AD-007).
2. IF the write fails at any point THEN the system SHALL leave neither the work order changes nor any trail entry.
3. WHEN the repository has read the recorded events THEN the system SHALL leave them in place for the handler to publish afterwards.
4. Each trail entry SHALL carry its event type, the acting user, the moment it happened, and the states it moved from and to when the event is a transition.
5. The system SHALL never update or delete a trail entry once it is written.
6. The system SHALL take a trail entry's event type from a constant declared on the event class rather than from the class name read at runtime.

**Independent Test**: Create a work order, add a service, and read the trail as an administrator to see two entries in that order, each naming the acting user.

---

### P2: A work order carries the mechanic responsible for it

**User Story**: As a service advisor, I want to assign a mechanic to a work order and change that assignment while the visit is open, so that the workshop knows who is on it.

**Why P2**: The record and its items are what features 6 and 7 build on. The assignment is needed before the diagnosis starts, which is feature 6.

**Acceptance Criteria**:

1. WHEN an actor holding `work-orders:manage` assigns a user who holds the `MECHANIC` role to a work order in a non-terminal state THEN the system SHALL record that user as the assigned mechanic and SHALL append a trail entry naming the acting user.
2. IF the target user does not hold the `MECHANIC` role THEN the system SHALL refuse the assignment with HTTP 422.
3. IF the target user does not exist THEN the system SHALL refuse the assignment with HTTP 404.
4. WHEN a work order already carries an assigned mechanic THEN the system SHALL replace them, reassignment being allowed while the work order is not terminal.
5. IF the actor lacks `work-orders:manage` THEN the system SHALL refuse the assignment with HTTP 403.

**Independent Test**: Assign a mechanic, assign a second one over the first, and confirm the work order names the second while the trail holds both assignments.

---

### P2: The board and the trail read back

**User Story**: As a service advisor, I want to see the work orders on the board and open one by its number, so that the counter can answer where a car is without asking anyone.

**Why P2**: The write side is what features 6 and 7 depend on. The reads over it can follow a day later without blocking them.

**Acceptance Criteria**:

1. WHEN an actor holding `work-orders:read` lists work orders THEN the system SHALL return each one with its number, status, customer name, vehicle plate and creation moment, filtered by status when a status is supplied.
2. WHEN an actor holding `work-orders:read` reads a work order by its number THEN the system SHALL return its snapshot, its status, its assigned mechanic, its service items and its part items.
3. IF no work order carries the requested number THEN the system SHALL respond with HTTP 404.
4. WHEN an actor holding `audit:read` reads a work order's trail THEN the system SHALL return every entry in chronological order.
5. IF the actor lacks `audit:read` THEN the system SHALL refuse the trail with HTTP 403, whether or not they hold `work-orders:read`.
6. IF the actor lacks `work-orders:read` THEN the system SHALL refuse the list and the detail with HTTP 403.

**Independent Test**: List the board filtered by `RECEIVED` and see the work order just created, then read its trail as an administrator and receive 403 as a service advisor.

---

## Edge Cases

- IF two creations for the same vehicle arrive concurrently THEN the system SHALL store one and refuse the other with HTTP 409, the database being what decides.
- IF the number generator draws a number that already exists THEN the system SHALL draw again rather than fail the request.
- WHEN a work order has just been created THEN its trail SHALL already hold the creation entry and its item lists SHALL be empty.
- IF a part is planned on a work order in `RECEIVED` THEN the system SHALL refuse it with HTTP 422, parts being identified during the diagnosis.
- IF the customer or the vehicle is edited after the work order was created THEN the work order SHALL keep the snapshot it copied.
- IF a trail is requested for a number that does not exist THEN the system SHALL respond with HTTP 404 rather than an empty list.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| WO-01 | P1: A visit becomes one record with a number | Design | Pending |
| WO-02 | P1: The requested work sits on the work order | Design | Pending |
| WO-03 | P1: Every step lands on the trail, with the record | Design | Pending |
| WO-04 | P2: A work order carries the mechanic responsible for it | Design | Pending |
| WO-05 | P2: The board and the trail read back | Design | Pending |

**ID format:** `WO-NN`

**Status values:** Pending → In Design → In Tasks → Implementing → Verified

**Coverage:** 5 total, 0 mapped to tasks, 5 unmapped

---

## Success Criteria

- [ ] A service advisor can open a work order through the API and read it back by its number, with no SQL.
- [ ] A second work order for the same vehicle is refused by the database, proven against real PostgreSQL rather than argued.
- [ ] A work order and its trail never disagree, proven by a forced rollback that leaves neither.
- [ ] Every step this feature can perform appears on the trail, in order, with the user who did it.
