# Service Catalog Specification

## Problem Statement

The workshop prices labour by hand today: nothing in the system says what a service is called, what it costs, or how long it takes. Feature 5 opens work orders and feature 6 generates budgets from them, and both need a maintained catalog to read prices from instead of accepting a number typed into a request. This feature builds that catalog and the read contract the later features will call.

## Goals

- [ ] An administrator creates, updates and deactivates the services the workshop offers, through the API.
- [ ] Every price is integer BRL cents in the domain and a `bigint` in the database, reloaded as the exact same amount.
- [ ] Any staff member picking work for a work order can read the active catalog; a customer cannot.
- [ ] A deactivated service leaves the active catalog without losing its record or blocking its name from being reused.

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
| --- | --- |
| Adding a service to a work order, and pricing a budget from it | Features 5 and 6. This feature only delivers the catalog and the `GetServiceQuery` read contract those features call (`docs/ddd/event-storming.md` section 12's Workshop Operations to Workshop Catalog row). |
| Reactivating a deactivated service | `docs/ddd/event-storming.md` section 9 lists this aggregate's commands exhaustively (Create, Update, Deactivate) and names no reactivate. Matches `User` and `Customer`, which are also one-way through the API. See the Assumptions table. |
| A customer browsing the catalog | H37: decided no. `services:read` stays with staff, and the seeded RBAC catalog already reflects that. |
| Service categories, bundles, parts included in a service, or per-mechanic pricing | Nothing in the challenge document or the DDD documents asks for them. A work order item carries its own snapshot of the price it was quoted at (feature 6). |
| Historical price tracking | Rule 17: a price change never touches a budget already generated, because a budget round freezes its own prices (feature 6's job). The catalog itself only carries the current price. |

---

## Assumptions & Open Questions

Every ambiguity is resolved or recorded here. The domain rules come from `docs/ddd/implementation-plan.md` phase 6 and `docs/ddd/event-storming.md` (section 9's Service aggregate, section 10 rules 17-18, section 13's read models, H37); what follows are the points those documents left unstated.

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Deactivation is one-way through the API | No reactivate command or route | Section 9 enumerates this aggregate's commands exhaustively and names no reactivate, the same way it does for every other aggregate. `User` and `Customer` are already one-way for the same reason. An administrator who deactivated a service by mistake creates it again - the name is free the moment the old one goes inactive. | y |
| Updating a deactivated service | Allowed; status is orthogonal to the other fields | No rule forbids it, and rule 18 only bars a deactivated service from being *added to a work order*. `UpdateCustomerHandler` and `UpdateVehicleHandler` already update without checking status. | y |
| `GET /services/:externalId` and `GetServiceQuery` for a deactivated service | Return the record with `status: INACTIVE`; only the list excludes it | Feature 5 must tell "this service does not exist" apart from "this service exists but is deactivated" to enforce rule 18 with a precise error. `customer-and-vehicle-registry` needed exactly this distinction and reached it by fixing a bug late; this feature adopts the same split deliberately, up front. | y |
| Name uniqueness among active services | Case-insensitive, on the trimmed name (`lower(name)` in the partial unique index) | `docs/ddd/implementation-plan.md` says "unique index on name where status = 'ACTIVE'" without settling case. A catalog that accepts both "Troca de oleo" and "troca de oleo" as separate services is a data-entry defect waiting to happen; comparing on `lower()` is a one-word refinement of the same index, not a different rule. | y |
| Estimated duration has no upper bound | Any positive integer number of minutes | Phase 6's schema states only `CHECK (> 0)`. An engine rebuild legitimately spans days, so any ceiling would be invented rather than derived. | y |
| Deactivation is a status flip, not a soft delete | `status` moves to `INACTIVE`; the table has no `deleted_at` column | Phase 6's schema for `services` has no `deleted_at`, unlike `users`, `customers` and `vehicles`. The uniqueness filter is `WHERE status = 'ACTIVE'`, not `WHERE deleted_at IS NULL`. Deliberate difference, carried through as written. | y |

**Open questions:** none - all resolved or logged above.

---

## User Stories

### P1: An administrator maintains the service catalog ⭐ MVP

**User Story**: As an administrator, I want to create, update and deactivate the services the workshop offers, so that work orders are priced from a maintained catalog instead of a number somebody typed.

**Why P1**: Feature 5 cannot add a service to a work order, and feature 6 cannot price a budget, until the catalog exists.

**Acceptance Criteria**:

1. WHEN an administrator creates a service with a name, a price and an estimated duration THEN the system SHALL store it as `ACTIVE` and return its external identifier.
2. IF the price is negative THEN the system SHALL refuse the creation with HTTP 400.
3. IF the estimated duration is zero or negative THEN the system SHALL refuse the creation with HTTP 400.
4. IF the name already belongs to another active service, compared case-insensitively THEN the system SHALL refuse the creation with HTTP 409.
5. WHEN an administrator updates a service's name, description, price or estimated duration THEN the system SHALL apply the change and leave the fields omitted from the request untouched.
6. WHEN an administrator deactivates a service THEN the system SHALL set its status to `INACTIVE` and keep the record.
7. The system SHALL accept a service created with no description.
8. IF the actor lacks `services:manage` THEN the system SHALL refuse the create, update and deactivate requests with HTTP 403.

**Independent Test**: Create a service as an administrator, update its price, deactivate it, and confirm a service advisor attempting the same create receives 403.

---

### P1: Staff read the catalog to pick work ⭐ MVP

**User Story**: As a service advisor or a mechanic, I want to list the active services and read one by id, so that I can pick what goes on a work order.

**Why P1**: Section 13's `List Services` read model exists for exactly this, and feature 5 depends on the `GetServiceQuery` contract this story delivers.

**Acceptance Criteria**:

1. WHEN an actor holding `services:read` lists the catalog THEN the system SHALL return every active service with its name, description, price in cents, estimated duration and status.
2. WHILE a service is deactivated the system SHALL exclude it from that list.
3. WHEN an actor holding `services:read` reads one service by its external identifier THEN the system SHALL return it whether it is active or deactivated, with its current status.
4. IF no service exists for the requested external identifier THEN the system SHALL respond with HTTP 404.
5. IF the actor holds neither `services:read` nor `services:manage` THEN the system SHALL refuse the request with HTTP 403.

**Independent Test**: As a mechanic, list the catalog and read one service by id; as a customer, receive 403 on both.

---

### P1: A price is integer BRL cents, end to end ⭐ MVP

**User Story**: As the workshop, I want every catalog price handled as integer BRL cents by the shared `Money` value object, so that a budget total generated in feature 6 equals the sum of the prices it was built from.

**Why P1**: AD-002 makes this the project-wide rule, and phase 6 names the concrete hazard: TypeORM returns `bigint` as a string, so an implicit conversion silently produces the wrong number.

**Acceptance Criteria**:

1. The system SHALL represent a service price as an integer number of BRL cents, using the shared `Money` value object.
2. WHEN a price is written to the database and read back THEN the system SHALL return the exact same amount.
3. WHEN a price of zero is supplied THEN the system SHALL accept it.

**Independent Test**: Create a service priced at 15099 cents, reload it from the database, and confirm the value is 15099 and its type is a number, not a string.

---

### P2: A deactivated service leaves the catalog without disappearing

**User Story**: As an administrator, I want a service I no longer offer to drop out of the active catalog while its record survives, so that work orders that already reference it stay readable and its name becomes free again.

**Why P2**: The catalog works without this the day it ships; it matters the first time the workshop retires a service. Rule 18 depends on the record surviving.

**Acceptance Criteria**:

1. WHILE a service is deactivated the system SHALL keep its row, its identifier and its price readable by id.
2. WHEN a service is deactivated THEN the system SHALL allow a new service to be created with the same name.
3. WHEN a service is deactivated twice THEN the system SHALL leave it deactivated without error.

**Independent Test**: Deactivate a service, create a new one with the same name and succeed, then read the deactivated one by id and see `INACTIVE`.

---

## Edge Cases

- IF two services with the same name are created concurrently THEN the system SHALL let exactly one succeed and answer the other with HTTP 409.
- IF a name differs from an existing active one only by case or by surrounding whitespace THEN the system SHALL treat it as the same name and refuse it with HTTP 409.
- WHEN a price of zero is created THEN the system SHALL accept it.
- IF an update sets a name that another active service already holds THEN the system SHALL refuse it with HTTP 409.
- IF an update sets a name that only a deactivated service holds THEN the system SHALL accept it.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| SVC-01 | P1: An administrator maintains the service catalog | Tasks | Implementing |
| SVC-02 | P1: Staff read the catalog to pick work | Tasks | Implementing |
| SVC-03 | P1: A price is integer BRL cents, end to end | Tasks | Implementing |
| SVC-04 | P2: A deactivated service leaves the catalog without disappearing | Tasks | Implementing |

**ID format:** `SVC-NN`

**Status values:** Pending → In Design → In Tasks → Implementing → Verified

**Coverage:** 4 total, 4 mapped to tasks, 0 unmapped

---

## Success Criteria

- [ ] An administrator can build a working catalog through the API, with no SQL.
- [ ] A service advisor and a mechanic can read the catalog; a customer cannot.
- [ ] A price written as 15099 cents reloads as exactly 15099, proven against real PostgreSQL.
- [ ] `GetServiceQuery` returns name, price, duration and status for any service, which is the contract feature 5 will call to enforce rule 18.
