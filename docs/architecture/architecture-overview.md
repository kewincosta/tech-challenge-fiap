# Architecture overview

The system in one page. How the pieces fit together is
[the high level design](high-level-design.md); what any one module holds is
[its low level design page](low-level-design/README.md); why anything was decided is
[a decision record](../adr/README.md).

## What this is

A medium sized mechanical workshop runs attendance, diagnosis, execution and delivery by hand,
with no single place holding what was requested, what was diagnosed, what the customer approved,
which parts were used, and where each vehicle stands.

This is the backend that centralises that operation around one concept: the **work order**. A
service advisor receives a customer and a vehicle, a mechanic diagnoses it, the system prices the
work, the customer approves it, the mechanic executes it and withdraws parts as they are used, and
the vehicle is delivered. The domain narrative behind that flow is
[the event storming](../ddd/event-storming.md).

It is an HTTP API. There is no user interface in this repository.

## The actors

Four business actors, all of them people who log in. A fifth name appears in the event storming,
`System`, which is not a role and never logs in: it names what the application does on its own,
such as pricing a budget or applying an automatic status transition.

| Actor           | What they do                                                                                                                                                                                    |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Customer        | Owns vehicles, approves or rejects the budget, follows their own work orders.                                                                                                                   |
| Service advisor | Registers customers and vehicles, opens the work order, records requested services, assigns a mechanic, approves a budget on the customer's behalf, delivers the vehicle, cancels a work order. |
| Mechanic        | Runs the diagnosis, plans parts and supplies, executes the work, withdraws parts as they are used, returns what turned out unnecessary, completes the work order.                               |
| Administrator   | Manages the service catalog, the inventory, the customers and the staff accounts, applies discounts, reads operational metrics and the trails.                                                  |

Each maps to a seeded role: `CUSTOMER`, `SERVICE_ADVISOR`, `MECHANIC`, `ADMIN`. A fifth role,
`SUPER_ADMIN`, exists below the API and is the only one that can grant `ADMIN`
([0012](../adr/0012-super-administrator-created-outside-the-api.md)).

## The five bounded contexts

| Context             | Responsibility                                                                                                                                    |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity & Access   | Who exists as a person, how they prove it, and what they may do.                                                                                  |
| Customer Management | Who the workshop serves, what it records about that relationship, and which vehicles belong to whom.                                              |
| Workshop Catalog    | What the workshop sells as labour, at which price and estimated duration.                                                                         |
| Inventory           | What the workshop holds in stock, how much is left, and the traceable history of every unit that moved.                                           |
| Workshop Operations | The life of a work order, from reception to delivery or cancellation, including the budget, the approval, what is charged, and who did each step. |

Contexts are not modules one for one. Identity & Access spans three modules and Customer
Management spans two; the other three map to one each. Which modules belong to which context is in
[the high level design](high-level-design.md).

Vehicles live with customers rather than in a context of their own, because a vehicle exists in
this system only as something a customer brings in.

## The three runtime pieces

| Piece                  | What it holds                                                                                                                                                                        |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| The NestJS application | Every module, in one deployable process. It is a modular monolith ([0001](../adr/0001-modular-monolith-with-cqrs.md)).                                                               |
| PostgreSQL             | The system of record. Everything durable ([0002](../adr/0002-postgresql-as-the-relational-database.md)).                                                                             |
| Redis                  | The effective access cache, the revoked session list, and rate limit counters. Nothing that cannot be rebuilt ([0003](../adr/0003-redis-for-cache-revocation-and-rate-limiting.md)). |

`docker-compose.yml` starts all three. The application waits on healthchecks for the other two.

## What shaped it

**One workshop, one stock, one location.** The MVP covers a single physical site. No invoicing, no
supplier management, no scheduling. Simplifications are justified against a workshop of that size
rather than against a dealership.

**Traceability is a requirement, not a feature.** The workshop has to be able to say where every
unit of stock went and who did what to a work order. That is why the stock ledger and the work
order trail are append only ([0015](../adr/0015-stock-movements-append-only.md),
[0021](../adr/0021-the-trail-written-inside-the-aggregate-transaction.md)), and why a cancellation
records a loss instead of quietly restoring stock
([0016](../adr/0016-cancellation-writes-movements-off.md)).

**A repair is one work order, whatever it turns out to need.** Work found during execution is
priced into a new numbered round on the same work order and authorised in place
([0018](../adr/0018-numbered-budget-rounds.md)). An earlier decision cancelled and reopened
instead; it was reversed, and the record of it is kept
([0025](../adr/0025-deviation-from-the-budget-cancels-the-work-order.md)).

**The customer pays what they approved.** Prices freeze into the budget round that quoted them,
and a price drop is answered by a person applying a discount with a reason recorded
([0019](../adr/0019-withdrawal-charged-at-the-budgeted-price.md),
[0020](../adr/0020-budget-total-and-charged-total-kept-apart.md)).

**Nothing enumerable leaves the process.** Every addressable table carries an internal key and an
external UUID, and only the UUID appears in a route or a payload
([0006](../adr/0006-internal-key-plus-external-uuid.md)).

## Where to go next

| Question                                                      | Document                                       |
| ------------------------------------------------------------- | ---------------------------------------------- |
| How do the modules fit together, and what is the guard chain? | [High level design](high-level-design.md)      |
| What is inside one module?                                    | [Low level design](low-level-design/README.md) |
| Why was something decided this way?                           | [Decision records](../adr/README.md)           |
| What does the domain actually do?                             | [Event storming](../ddd/event-storming.md)     |
| How do I run it?                                              | [README](../../README.md)                      |
