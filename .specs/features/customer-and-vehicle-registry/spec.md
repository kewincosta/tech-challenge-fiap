# Customer And Vehicle Registry Specification

## Problem Statement

The workshop can create staff and customer-role user accounts, but has nowhere to record what makes someone a customer of this workshop, or which vehicle they bring in. Every downstream feature - the service catalog, inventory, and every work order - needs an owning customer and a registered vehicle to point at. Without this feature, a work order has no ID to carry for "who" and "which car."

## Goals

- [ ] A service advisor turns a person into a customer, whether or not they already have an account, in one call.
- [ ] Every vehicle on record belongs to exactly one active customer and carries a structurally valid plate.
- [ ] A customer reads and maintains their own record and their own vehicles with no workshop permission.
- [ ] Deactivating a customer never touches the user account or identity data underneath it.

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
| --- | --- |
| Service catalog, inventory, work orders | Features 3-8 of the roadmap, built on top of this one. |
| A person becoming a customer through self-service, with no staff involved | `docs/ddd/event-storming.md` section 7's Commands table names only Service advisor and Administrator as the actors for Register Customer. A person becomes a `User` through public sign-up (already built, `identity-foundation`); the `Customer` record itself is always staff-completed (H7). |
| Public browsing of the service catalog by a customer | H37 in `docs/ddd/event-storming.md`: decided no. |
| Vehicle service history, mileage, or anything beyond identity fields | Not requested by the challenge document. Work orders (features 5-8) carry the service history; the vehicle record itself does not. |
| Multi-factor or delivery-channel notification when a vehicle is ready | Out of scope for the whole project (identity-foundation's own Out of Scope table), not reopened here. |

---

## Assumptions & Open Questions

Every ambiguity is resolved or recorded here. The domain rules themselves come from `docs/ddd/event-storming.md` (rules 11-16, decisions H6, H7, H13, H25, H27, H28, H35) and `docs/ddd/implementation-plan.md` (phases 4-5), which already resolved nearly everything; what remains below are the concrete bounds and low-stakes defaults those documents left unstated.

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Vehicle model year plausibility bound | Reject a year before 1950 or more than one year ahead of the current year | No numeric bound is given in the DDD documents. 1950 predates any vehicle plausibly still on Brazilian roads; one year ahead covers a dealership's next-model-year stock. | y |
| Name search on `List Customers` | Case-insensitive partial match | Standard search UX for a counter looking up a customer by a typed fragment of their name. The document filter stays an exact match, consistent with `GET /api/v1/users?document=`, since documents are normalised digit strings. | y |
| `Address` is all-or-nothing | If any address field is supplied, street, number, district, city, state and zip code are all required together; `complement` stays optional even then | `docs/ddd/implementation-plan.md` phase 4's own test list treats `Address` as either complete or empty ("should accept a complete address, should accept an empty address"), never partial. Matches the all-or-nothing validation style already used by `PersonDocument`. | y |
| `GET /api/v1/vehicles/me` for a user with no customer record | Return an empty list, not an error | Mirrors phase 13's stated behaviour for the analogous `/work-orders/me` case, and avoids leaking through an error status whether a given user is a customer. | y |
| Zip code and phone number are Brazilian-only formats | 8-digit CEP; phone requires a 2-digit area code plus 8 digits (landline) or 9 digits (mobile) | The challenge is a Brazilian workshop. `PersonDocument` already assumes CPF/CNPJ, the same national scope. | y |
| State code validated against the real Brazilian UF list | Reject any 2-letter code outside the 27 real UF codes, not just any two letters | `docs/ddd/implementation-plan.md`'s own test list says "should reject an invalid state code," which implies a real membership check, not a shape check. | y |

**Open questions:** none - all resolved or logged above.

---

## User Stories

### P1: A service advisor turns a person into a customer ⭐ MVP

**User Story**: As a service advisor, I want to register a customer either over an existing account or by creating one on the spot, so that anyone who walks in with a vehicle can be served without a separate visit to create their login first.

**Why P1**: Every work order needs an owning customer. Nothing downstream can be demoed without this.

**Acceptance Criteria**:

1. WHEN a service advisor or an administrator registers a customer over an existing user's external id THEN the system SHALL create the customer record linked to that user's internal id.
2. IF the target user does not hold the `CUSTOMER` role THEN the system SHALL refuse the registration with HTTP 422.
3. IF the target user already backs a customer record THEN the system SHALL refuse the registration with HTTP 409.
4. WHEN a service advisor or an administrator registers a customer by supplying account data (email, name, document) instead of an existing user id THEN the system SHALL create the user account through the existing staff-account-creation mechanism (`RegisterUserCommand` with a generated temporary password), assign it the `CUSTOMER` role, and create the customer record for it, all in one transaction.
5. WHEN the account-creation branch is used THEN the system SHALL return the generated temporary password once in the response, the same discipline `POST /api/v1/users/staff` already applies.
6. IF the request supplies both an existing user id and account-creation data, or neither THEN the system SHALL refuse the request with HTTP 400.
7. IF an address is supplied THEN the system SHALL require street, number, district, city, state and zip code together (complement optional), normalise the zip code to digits only, and reject an invalid state code or a zip code that is not exactly 8 digits, with HTTP 400.
8. IF a phone number is supplied THEN the system SHALL require a 2-digit area code, accept 8 digits (landline) or 9 digits (mobile) after it, normalise it to digits only, and reject any other shape with HTTP 400.
9. The system SHALL accept a registration with no address and no phone number at all.
10. IF the actor lacks `customers:manage` THEN the system SHALL refuse the request with HTTP 403.

**Independent Test**: Register a customer as a service advisor by supplying only account data (no existing user), receive a temporary password in the response, then find that customer by their document.

---

### P1: Finding and reading customer records ⭐ MVP

**User Story**: As a service advisor, I want to find a customer by the document they hand me and read their record, so that the counter never re-registers somebody who already exists.

**Why P1**: The challenge document frames this as the entry point of the whole operational flow.

**Acceptance Criteria**:

1. WHEN a service advisor or an administrator searches customers by document THEN the system SHALL return the matching active customer or an empty result.
2. WHEN a service advisor or an administrator lists customers filtered by name THEN the system SHALL return every active customer whose name contains the given text, case-insensitively.
3. WHEN a service advisor or an administrator reads one customer by external id THEN the system SHALL return its identity data, address, phone and status.
4. WHILE authenticated as the person behind a customer record, that person SHALL be able to read their own record through `GET /api/v1/customers/me` with no workshop permission.
5. IF the actor lacks `customers:read` and is not the owning person THEN the system SHALL refuse the request with HTTP 403.
6. IF no customer record exists for the requested external id THEN the system SHALL respond with HTTP 404.

**Independent Test**: Register a customer, find them by document, list them by a fragment of their name, and read their own record while authenticated as them.

---

### P1: A vehicle is on record before it can be serviced ⭐ MVP

**User Story**: As a service advisor, I want to register a vehicle under a customer, so that a work order always has a vehicle to point at.

**Why P1**: `work-order-creation` (feature 5) cannot open a work order without a registered vehicle.

**Acceptance Criteria**:

1. WHEN a service advisor or an administrator registers a vehicle for an active customer THEN the system SHALL create the vehicle record linked to that customer's internal id.
2. IF the owning customer is deactivated THEN the system SHALL refuse the registration with HTTP 422.
3. IF the owning customer does not exist THEN the system SHALL respond with HTTP 404.
4. The system SHALL accept the plate in the old format (`AAA0000`) or the Mercosul format (`AAA0A00`), with or without separators, and store it normalised: upper case, no separators.
5. IF the plate does not match either format after normalisation THEN the system SHALL refuse the registration with HTTP 400.
6. IF the plate already belongs to another active vehicle THEN the system SHALL refuse the registration with HTTP 409.
7. IF the model year is before 1950 or more than one year ahead of the current year THEN the system SHALL refuse the registration with HTTP 400.
8. IF the actor lacks `vehicles:manage` THEN the system SHALL refuse the request with HTTP 403.

**Independent Test**: Register a vehicle for a registered customer, attempt a duplicate plate and receive 409, attempt registration for a deactivated customer and receive 422.

---

### P1: Reading vehicle records ⭐ MVP

**User Story**: As a service advisor, I want to list and read the vehicles on record, so that I can confirm which car a customer is bringing in.

**Why P1**: Needed the moment a work order references "this vehicle."

**Acceptance Criteria**:

1. WHEN a service advisor or an administrator lists the vehicles of one customer THEN the system SHALL return every active vehicle linked to that customer's internal id.
2. WHEN a service advisor or an administrator reads one vehicle by external id THEN the system SHALL return its plate, brand, model, year and owning customer.
3. WHILE authenticated as the person behind a customer record, that person SHALL be able to list their own vehicles through `GET /api/v1/vehicles/me` with no workshop permission.
4. IF the authenticated user has no customer record THEN `GET /api/v1/vehicles/me` SHALL return an empty list rather than an error.
5. IF the actor lacks `vehicles:read` and is not the owning person THEN the system SHALL refuse the request with HTTP 403.
6. IF no vehicle record exists for the requested external id THEN the system SHALL respond with HTTP 404.

**Independent Test**: Register a vehicle, list it under its customer, read it by id, and confirm a customer with no vehicles gets an empty list from `/vehicles/me`.

---

### P2: Maintaining customer records

**User Story**: As the person behind a customer record, or as staff, I want to update the address and phone, and as staff I want to deactivate a customer who left, so that the record stays accurate without ever losing the history under it.

**Why P2**: The data drifts over time, but nothing downstream blocks on this the way it blocks on registration itself.

**Acceptance Criteria**:

1. WHEN the owning person updates their own customer record THEN the system SHALL apply the change with no workshop permission required.
2. WHEN a service advisor or an administrator updates a customer record they do not own THEN the system SHALL require `customers:manage`.
3. WHEN an administrator or a service advisor deactivates a customer THEN the system SHALL set the record's soft-delete marker and leave the underlying user account untouched.
4. WHILE a customer is deactivated THEN the system SHALL exclude it from `List Customers` and from `Find Customer By Document`.
5. IF the actor lacks `customers:manage` and does not own the record THEN the system SHALL refuse the update with HTTP 403.

**Independent Test**: Update a customer's address as the customer themselves, then deactivate the same customer as an administrator and confirm they no longer appear in a document search.

---

### P2: Maintaining vehicle records

**User Story**: As staff, I want to correct a vehicle's details, transfer it to a different customer when ownership changes, and remove a vehicle no longer relevant, so that the fleet on record matches reality.

**Why P2**: Same reasoning as the customer-maintenance story - accuracy over time, not a blocker for the first demo.

**Acceptance Criteria**:

1. WHEN a service advisor or an administrator updates a vehicle's brand, model or year THEN the system SHALL apply the change.
2. WHEN a service advisor or an administrator updates a vehicle's owning customer THEN the system SHALL relink it to the new customer.
3. IF the new owning customer is deactivated THEN the system SHALL refuse the transfer with HTTP 422.
4. IF the new owning customer does not exist THEN the system SHALL refuse the transfer with HTTP 404.
5. WHEN a service advisor or an administrator removes a vehicle THEN the system SHALL set its soft-delete marker rather than deleting the row.
6. IF the actor lacks `vehicles:manage` THEN the system SHALL refuse the request with HTTP 403.

**Independent Test**: Update a vehicle's model, transfer it to a second customer, and confirm it now lists under the new customer and not the old one.

---

## Edge Cases

- IF two vehicle registrations with the same plate arrive concurrently THEN the system SHALL let exactly one succeed and answer the other with HTTP 409.
- IF two customer registrations for the same existing user id arrive concurrently THEN the system SHALL let exactly one succeed and answer the other with HTTP 409.
- IF two customer registrations for the same new-account document arrive concurrently (account-creation branch) THEN the system SHALL let exactly one succeed and answer the other with HTTP 409, reusing the document uniqueness constraint `identity-foundation` already enforces.
- WHEN a vehicle is removed (soft deleted) and a later registration reuses the same plate THEN the system SHALL accept it, because plate uniqueness is scoped to active vehicles only.
- IF a customer is deactivated while it still owns active vehicles THEN the system SHALL leave those vehicle records untouched; only new work orders are blocked, which is a later feature's concern to enforce.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| CVR-01 | P1: A service advisor turns a person into a customer | Tasks | In Tasks |
| CVR-02 | P1: Finding and reading customer records | Tasks | In Tasks |
| CVR-03 | P1: A vehicle is on record before it can be serviced | Tasks | In Tasks |
| CVR-04 | P1: Reading vehicle records | Tasks | In Tasks |
| CVR-05 | P2: Maintaining customer records | Tasks | In Tasks |
| CVR-06 | P2: Maintaining vehicle records | Tasks | In Tasks |

**ID format:** `CVR-NN`

**Status values:** Pending → In Design → In Tasks → Implementing → Verified

**Coverage:** 6 total, 6 mapped to tasks, 0 unmapped

---

## Success Criteria

- [ ] A customer can be registered at the counter, with or without a pre-existing account, in one call.
- [ ] A customer's vehicle can be registered, found and listed with no SQL.
- [ ] A customer authenticated as themselves can read and update their own record and vehicles with no workshop permission.
- [ ] Two concurrent registrations for the same plate, or for the same user, never both succeed.
