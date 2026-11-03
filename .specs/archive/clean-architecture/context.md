# Clean Architecture Context

**Gathered:** 2026-10-28, from the planning conversation of 2026-10-26 to 2026-10-28
**Spec:** `.specs/features/clean-architecture/spec.md`
**Status:** Ready for design

---

## Feature Boundary

Refactor the NestJS modular monolith to pure Clean Architecture, as the study below defines it, with no change to the API's observable behavior. The Phase 2 API changes, the infrastructure deliverables (Kubernetes, Terraform, CI/CD) and the domain's behavior stay outside.

---

## Architecture Reference

The user provided a Clean Architecture study on 2026-10-27. It is the yardstick for this feature, and it rests on Robert C. Martin's "The Clean Architecture" (2012), "A Little Architecture" (2016), "Screaming Architecture" (2011) and "When to Mock" (2014), and on Alistair Cockburn's "Hexagonal Architecture" (2005).

- Source dependencies point inward, for imports, inheritance, decorators and the types a contract exposes. The use case knows nothing of the framework, the database, HTTP or the DI container.
- A contract belongs to its consumer and exposes only what the consumer needs. It never mirrors the ORM's API.
- The controller turns the request into the use case's input and the output into the response. Transport types stay at the edge, and a business rule never lives only in a controller.
- Errors become HTTP in the adapter. Transactions run through an abstraction that exposes no ORM type.
- Modules have explicit boundaries and no cycles. `shared` must not become a dumping ground, and no module touches another module's persistence.
- No interface, factory, base class or wrapper is created by default. CQRS, a bus, one class per use case, a DI container and full DDD each need their own justification and are never purity criteria.
- Tests run real entities and replace only external dependencies at the boundaries.
- The refactor goes flow by flow: record current behavior, extract domain, use case and contracts, adapt the infrastructure, check behavior and forbidden imports, repeat.
- Acceptance: the core is testable without starting the framework, internal contracts expose no infrastructure type, and a new entry point reuses a use case without duplicating its rules.

---

## Implementation Decisions

### D1. No command or query bus

- Controllers call the use case class directly. A use case receives its dependencies through its constructor, and Nest builds it in the module's composition root with a factory provider.
- `@nestjs/cqrs` leaves the project. The split between commands and queries stays as code organization: writes go through the aggregate and its repository, reads go through query ports.
- Source: the study lists a bus among the choices that need their own justification, and with a bus the use case resolves its collaborators through a global registry, which the study says to avoid.

### D2. Consumer-owned ports between modules

- A use case that needs another module declares a port in its own `application/ports`. An adapter in its own `infrastructure` implements the port by calling the other module's use case, imported through that module's `index.ts`.
- During the migration an adapter can call a handler that has not migrated yet: the handler class is already a Nest provider and only needs exporting.

### D3. One identity module

- `users`, `authentication` and `authorization` move to `src/modules/identity/`, each as an area that keeps its four layer folders, under one Nest module.
- Reason: the three need each other in both directions. Registration assigns the `CUSTOMER` role inside the same transaction, a password change and a deactivation end sessions, login verifies credentials in `users`, session revocation reads permissions, and the permissions guard uses the authentication `Principal`. The C4 component diagram already draws them as one context, Identity & Access.

### D4. Use case naming

- `XHandler` becomes `XUseCase` in `x.use-case.ts`, in mechanical commits kept apart from behavior changes. The `commands/` and `queries/` folders and the `XCommand` and `XQuery` input classes stay.

### D5. Route permissions stay at the HTTP edge

- `@RequirePermissions` keeps running in the guard. Rules that depend on the data (the budget's owner, the assigned mechanic, cancellation) stay in the use cases, as today.
- An ADR records that each entry point authenticates and authorizes its own caller: the seed runs as a trusted process, and the Phase 2 budget webhook will validate a signature.

### D6. Import rules through dependency-cruiser

- Added as a dev dependency and run by `npm run lint`. Rules: layers point inward, framework and infrastructure packages are banned in `domain` and `application` (specs included), modules have no cycles, and a module reaches another only through its `index.ts`.
- The check starts from a baseline of known violations. Each migrated flow removes its own, and the baseline is empty when the feature ends.

### D7. Cross-module table access

- Today nine adapters read tables owned by other modules, and none writes one.
- The four repositories (`customers`, `vehicles`, `inventory`, `work-orders`) read foreign tables only to translate identifiers: a direct lookup such as `SELECT id FROM customers WHERE external_id = $1` when saving, the reverse lookup when loading, or a join on `external_id` inside the query itself. The `work-orders` and `inventory` repositories build the table name at runtime (`SELECT id FROM ${table} ...`), which is why a first search by table name missed the `work-orders` one.
- The five read adapters join foreign tables to assemble responses. The customer listing takes name, email and document from `users` and filters on them. The vehicle listing takes the owner's UUID from `customers`. The work order board and detail join `customers`, `vehicles`, `users`, `services` and `inventory_items`. The execution-time metric filters by a service UUID through `services`. The stock shortage report starts from `work_order_parts` and joins `work_orders` and `work_order_budgets`, and the movement history joins `users` and `work_orders`.
- AD-001 is the root: foreign keys use internal ids, so turning a UUID into a key means reading the owner's table. Phase 1 already treated these reads as known exceptions to AD-003, and the adapters' comments say so.
- Decided by the user on 2026-10-28: every module queries only its own tables. This replaces an intermediate rule discussed the same day, under which JOINs could stay and only standalone lookups went through the owner.
- The ADR justifies this decision with three reasons and no other: it avoids coupling between modules, it avoids dependency cycles, and it keeps each module responsible for its own data.
- The shared schema and its foreign keys stay, and a module writes only its own tables. A check run by `npm run lint` fails when any adapter references a table another module owns.
- Identifier translation: each owner of a referenced table (`identity` for `users`, `customers`, `vehicles`, `services`, `inventory` for `inventory_items`, `work-orders` for `work_orders`) offers a key resolver that turns its UUIDs into internal keys and back, one at a time and in batch. The resolver lives in the owner's infrastructure, because internal keys are a persistence detail no use case or port may expose. It runs on `currentEntityManager()` when there is one: `POST /customers` creates the user and the customer in one transaction, and the customer repository must find that uncommitted user.
- Data owned by another module comes through the owner's public API, in batch, and the consumer composes it in memory. The JOINs that only translate identifiers (work order board, detail and trail; vehicle listing; execution-time metric; the check of whether a user is already a customer) become key resolver calls. The JOINs that bring data become owner APIs: `identity` gains a user search by name and document and a batch read, keeping the exact document match and the partial, case-insensitive name match in its own SQL; `work-orders` provides the outstanding demand per item and the open work orders that plan a given item.
- `inventory` and `work-orders`: `work-orders` already calls `inventory` to move stock, so `inventory` declares what it needs (work order key translation, outstanding demand per item, open work orders using an item) as interfaces of its own, `work-orders` implements them, and the root module binds them. The design proves this Nest wiring (a `forwardRef` or a binding in the root module) before it spreads.
- Accepted costs: more queries per request (the work order detail gains five batch queries, and the customer listing goes from one query to two or three), reads composed from two modules no longer come from one database snapshot, and the 11 integration specs of the rewritten adapters are redone. Every ordering stays on the consumer's own columns, so nothing is sorted in memory.
- One database schema per module stays a deferred idea.

### D8. Adjustments the study brought to the plan

- Repository contracts move from `domain/repositories` to `application/ports`. No entity uses them.
- No interface per use case, no generic handler interface and no `Logger` port. The refresh-token-reuse subscriber only writes a log line, so it moves to infrastructure.
- The authentication use cases receive their token lifetimes as a plain settings object built in the composition root.
- Query use cases raise their own not-found errors. Seven controllers decide that today.
- `PersonDocument` stays in `identity`. `customers` stops parsing it and passes the raw document filter to the `identity` user search, which normalizes it and returns nothing for a malformed document, as the customer listing does today.
- `src/shared` grows only by the domain event publisher port and its in-memory dispatcher.
- Injection tokens leave `domain` and `application` and live in `<module>.tokens.ts`, next to the composition root.
- No presenter layer. The controllers already translate the output.

### D9. Domain events

- A `DomainEventPublisher` port in `shared/application`, an in-memory dispatcher in `shared/infrastructure`, and the subscribers registered in the composition root.
- Semantics stay as today: the publisher does not wait, and a subscriber error is logged with the subscriber's name.
- Justification for the ADR: cache invalidation reacts to role changes today, and the Phase 2 status e-mails will react to work order changes, with no use case knowing who listens.

### D10. Sequence

- Baseline (OpenAPI document and the three suites), characterization e2e tests for uncovered routes, the architecture check in report mode, the identity move (paths only, no behavior), the domain event port, the pilot on opening a work order, then the flows module by module (`services`, `inventory`, `identity`, `customers`, `vehicles`, the rest of `work-orders`), the removal of the bus, the enforcement with an empty baseline, the acceptance checks and the documentation.

### Agent's Discretion

- The folder that holds cross-module adapters inside `infrastructure`, the port names and the exact shape of each port, as long as each port exposes only what its consumer uses.
- The mechanism that captures and compares the OpenAPI document.
- The form of the table-access check (a script or a test), as long as `npm run lint` runs it.

### Declined / Undiscussed Gray Areas → Assumptions

- How "the API is unchanged" is measured, characterization tests for uncovered routes, the event dispatch semantics, and query-port stubs staying as stubs. Each is logged with its default in the spec's Assumptions & Open Questions table.

---

## Specific References

- The composition example from the study: `new CancelarPedido(new PrismaPedidoRepository(prisma))`, with the use case knowing neither Prisma, SQL, HTTP nor the injection container.
- The study's acceptance criteria, which map to CA-01 (core testable without the framework), CA-01 and CA-03 (no infrastructure type in internal contracts) and CA-06 (a new entry point reuses a use case).

---

## Deferred Ideas

- One database schema per module, with cross-module references by UUID and no foreign keys between modules.
- Moving route-level permission checks into the use cases.
- Turning the query-port stubs in query use case specs into in-memory fakes.
- A Prettier pass over the ~148 files that `npm run format:check` already flags.
