# Inventory And Stock Movements Specification

## Problem Statement

The workshop has no record of what it holds. Nothing says how many oil filters are on the shelf, what they cost, or where the ones that left went. Feature 5 opens work orders, feature 7 withdraws parts against them, and neither can work until stock exists as a number the system defends and as a ledger that explains every change to it. This feature builds the catalog, the movements that are the only way that number ever moves, and the append-only history over them.

## Goals

- [ ] An administrator keeps one catalog of parts and supplies, priced in integer BRL cents.
- [ ] The quantity on hand changes only through a recorded movement, and the movement and the new count commit together or not at all.
- [ ] The quantity on hand never goes negative, under any command and under concurrency.
- [ ] Every unit that moved is on the record, in order, and no movement is ever edited or deleted.

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
| --- | --- |
| `List Stock Shortages` | Section 13 defines it as "items whose pending withdrawals **across work orders in execution** exceed what is on hand, **with the work orders waiting**". Two of its three inputs do not exist yet: pending consumptions arrive in plan phase 11 and work order state in phase 8. Built here it would answer an empty list forever and could only be tested against synthetic rows imitating a writer whose shape may still change. Moved to feature 7, `work-order-execution-and-closing`, which is what creates consumptions. Confirmed with the product owner rather than dropped silently. |
| Consuming, returning, settling and writing off stock | Plan phases 11 and 12. Phase 7 states this boundary itself. The schema for them is created here (see the Assumptions table) and left unwritten. |
| Deactivating an inventory item | Plan phase 7 lists this aggregate's commands exhaustively - Create, Update, Replenish, Adjust - and names no deactivate. See the Assumptions table. |
| Linking a movement to a work order | `stock_movements.work_order_id` is created here without a foreign key because `work_orders` does not exist until phase 8, which adds the constraint. Phase 7 states this explicitly. |
| Purchase orders, suppliers, cost averaging, multi-warehouse | Nothing in the challenge document or the DDD documents asks for them. A replenishment records the unit price it arrived at; there is no costing model beyond that. |

---

## Assumptions & Open Questions

Every ambiguity is resolved or recorded here. The domain rules come from `docs/ddd/implementation-plan.md` phase 7 and `docs/ddd/event-storming.md` (section 9's InventoryItem aggregate, section 10 rules 19-25, section 13's read models, H5, H11, H31, H32). What follows are points those documents left unstated or state inconsistently.

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Name of the second append-only child entity | `StockMovementTransition` | The documents disagree: phase 7's prose says "StockMovementEvent" once, while section 9's owned-entities list says `StockMovementTransition` and the table is `stock_movement_transitions` in phase 7's own schema, in phase 12 and in section 15. Three references beat one. | y |
| Direction of an adjustment | An adjustment lowers the count; raising it is a replenishment | The schema carries `quantity integer CHECK (> 0)` and no sign column, so a signed adjustment is not expressible without inventing a column the plan does not have. `INBOUND` already raises the count, and phase 7's own test list says "adjust the stock down with a mandatory note". A recount that finds more units is recorded as a replenishment. | y |
| SKU comparison | Normalised to upper case in the value object, so uniqueness is exact on the stored value | A SKU is a code, not a display name, so unlike a service name there is nothing to preserve about its casing. Normalising on the way in keeps the unique index plain instead of needing an expression index. | y |
| `stock_movements.actor_user_id` | Real foreign key to `users(id)` | Phase 7's schema line is terse and does not say "unconstrained", unlike `work_order_id`, where it says so explicitly and gives the reason. Every other cross-table reference in this codebase carries a foreign key (`customers.user_id`, `vehicles.customer_id`, `sessions.user_id`), and `users` exists today. | y |
| Deactivating an item | Not implemented; every item is `ACTIVE` in this feature | No command in phase 7 creates an inactive item. The `status` column and the `WHERE status = 'ACTIVE'` partial unique index are still built exactly as specified, the same way the consumption columns are - the schema is deliberately ahead of the commands here. | y |
| The consumption-era schema | Created now, unwritten until phases 11-12 | Phase 7's Database Changes lists the `CONSUMPTION`/`RETURN` kinds, the `PENDING`/`SETTLED`/`WRITTEN_OFF` statuses, `undoes_movement_id` and the whole `stock_movement_transitions` table. A dormant column costs nothing and keeps phase 11 from rewriting the schema; this is different from building dormant *behaviour*, which is why the shortages query was deferred instead. | y |
| Quantity on hand and updates | An update never changes the quantity on hand | Rule 21 says only Inventory writes stock quantities, and rules 19-25 make the movement the only mechanism that moves the count. An update that could silently set the number would leave the ledger and the count disagreeing. | y |

**Open questions:** none - all resolved or logged above.

---

## User Stories

### P1: The workshop keeps one catalog of parts and supplies ⭐ MVP

**User Story**: As an administrator, I want one catalog holding every part and supply with its SKU, price and current count, so that the workshop knows what it stocks and feature 5 can plan parts against real items.

**Why P1**: Nothing else in this feature, and nothing in features 5 to 7, has anything to move without an item to move.

**Acceptance Criteria**:

1. WHEN an administrator creates an inventory item with a SKU, a name, a kind and a unit price THEN the system SHALL store it as `ACTIVE` with a quantity on hand of zero and return its external identifier.
2. The system SHALL accept exactly two kinds, `PART` and `SUPPLY`, and reject any other value with HTTP 400.
3. IF the unit price is negative THEN the system SHALL refuse the creation with HTTP 400.
4. IF the SKU already belongs to another active item THEN the system SHALL refuse the creation with HTTP 409.
5. WHEN an administrator updates an item's name, description or unit price THEN the system SHALL apply the change and leave the fields omitted from the request untouched.
6. WHILE an item exists the system SHALL refuse any attempt to change its quantity on hand through an update, because only a movement moves the count.
7. WHEN an actor holding `inventory:read` lists the catalog THEN the system SHALL return every item with its SKU, name, kind, unit price in cents and quantity on hand, filtered by kind when a kind is supplied.
8. IF the actor lacks `inventory:manage` THEN the system SHALL refuse the create and the update with HTTP 403.
9. IF the actor holds neither `inventory:read` nor `inventory:manage` THEN the system SHALL refuse the reads with HTTP 403.

**Independent Test**: Create a part and a supply as an administrator, list the catalog filtered by `PART` and see only the part, then confirm a mechanic is refused when creating one.

---

### P1: Stock moves only through a recorded movement ⭐ MVP

**User Story**: As an administrator, I want every change to a count to be a movement I can point at, so that the number on the screen always has an explanation behind it.

**Why P1**: Rule 21 makes Inventory the only writer of stock quantities, and the whole traceability requirement rests on the count and the ledger never disagreeing.

**Acceptance Criteria**:

1. WHEN an administrator replenishes an item by a quantity THEN the system SHALL increase the quantity on hand by that quantity and append an `INBOUND` movement carrying the quantity, the unit price, the acting user and the moment it happened.
2. WHEN an administrator adjusts an item down by a quantity THEN the system SHALL decrease the quantity on hand by that quantity and append an `ADJUSTMENT` movement.
3. IF an adjustment carries no note THEN the system SHALL refuse it with HTTP 400.
4. IF a movement quantity is zero or negative THEN the system SHALL refuse it with HTTP 400.
5. WHEN a movement is recorded THEN the system SHALL write the movement row and the item's new quantity inside one transaction, so that neither can exist without the other (AD-007).
6. WHILE recording an `INBOUND` or an `ADJUSTMENT` the system SHALL leave the movement's status empty and append no transition row, because only a consumption carries a status.
7. IF the actor lacks `inventory:manage` THEN the system SHALL refuse the replenishment and the adjustment with HTTP 403.

**Independent Test**: Replenish an item by 10, adjust it down by 3 with a note, and confirm the count reads 7 and the ledger holds exactly two movements.

---

### P1: The quantity on hand never goes negative ⭐ MVP

**User Story**: As the workshop, I want a count that can never drop below zero, so that the number is a fact about the shelf rather than an accounting artefact.

**Why P1**: Rule 19 states it as an invariant holding "at any point, through any command", and feature 7's withdrawals will lean on it.

**Acceptance Criteria**:

1. IF an adjustment would take the quantity on hand below zero THEN the system SHALL refuse it with HTTP 422 and change nothing, leaving neither a movement row nor a changed count.
2. WHEN two movements against the same item are recorded concurrently THEN the system SHALL apply both to the same running count, losing neither.
3. The system SHALL enforce a non-negative quantity on hand at the database level as the last line of defence, independently of the application check.

**Independent Test**: Replenish an item by 5, attempt to adjust it down by 6, receive 422, and confirm the count is still 5 with exactly one movement on the ledger.

---

### P2: Every unit that moved is on the record

**User Story**: As an administrator, I want to read everything that ever happened to an item, in order, so that a discrepancy on the shelf can be traced to the movement that caused it.

**Why P2**: The ledger rows are written by the P1 stories above, so the data exists from day one; the read model over them is what can follow a day later without blocking feature 5.

**Acceptance Criteria**:

1. WHEN an actor holding `audit:read` reads an item's movement history THEN the system SHALL return every movement of that item in chronological order, each with its kind, quantity, unit price, acting user, note and moment.
2. The system SHALL never update or delete a movement once it is written.
3. IF the item has no movements THEN the system SHALL return an empty history rather than an error.
4. IF the actor lacks `audit:read` THEN the system SHALL refuse the history with HTTP 403.
5. IF no item exists for the requested external identifier THEN the system SHALL respond with HTTP 404.

**Independent Test**: Replenish an item twice, adjust it down once, then read the history as an administrator and see three movements in the order they happened.

---

## Edge Cases

- IF two replenishments of the same item arrive concurrently THEN the system SHALL apply both, leaving the count equal to their sum.
- IF an adjustment would leave the count negative THEN the system SHALL append no movement row at all, not even a refused one.
- WHEN an item has just been created THEN its quantity on hand SHALL be zero and its history SHALL be empty.
- WHEN a replenishment carries a note THEN the system SHALL store it, a note being optional on a replenishment and mandatory on an adjustment.
- IF a movement is requested for an item that does not exist THEN the system SHALL respond with HTTP 404 and write nothing.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| INV-01 | P1: The workshop keeps one catalog of parts and supplies | Tasks | In Tasks |
| INV-02 | P1: Stock moves only through a recorded movement | Tasks | In Tasks |
| INV-03 | P1: The quantity on hand never goes negative | Tasks | In Tasks |
| INV-04 | P2: Every unit that moved is on the record | Tasks | In Tasks |

**ID format:** `INV-NN`

**Status values:** Pending → In Design → In Tasks → Implementing → Verified

**Coverage:** 4 total, 4 mapped to tasks, 0 unmapped

---

## Success Criteria

- [ ] An administrator can build a stocked catalog through the API, with no SQL.
- [ ] A count and its ledger never disagree, proven by a rollback test against real PostgreSQL.
- [ ] A concurrent pair of movements on one item leaves the count equal to their sum, proven against real PostgreSQL rather than argued.
- [ ] The full history of an item reads back in order, and nothing in the codebase can update or delete a movement.
