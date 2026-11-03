# High level design

How the pieces fit together. What the system is and who uses it is
[the overview](architecture-overview.md); what any one module holds is
[its low level design page](low-level-design/README.md); why anything was decided is
[a decision record](../adr/README.md).

This page carries no per-class or per-column detail. Where it names a class, it names it as a
landmark, and the page that owns it is one level down.

## The code units

Six modules under `src/modules`, plus a shared kernel at `src/shared`. Five bounded contexts map
onto them, four of them one to one.

| Context             | Module        | What it owns                                                                                                                                                                                                                                                                         |
| ------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Identity & Access   | `identity`    | Who a person is, how they prove it, and what they may do, in three areas: `users` (registration, the document, the password, the account lifecycle), `authentication` (login, sessions, tokens, revocation) and `authorization` (roles, permissions, assignments, effective access). |
| Customer Management | `customers`   | The workshop's relationship with a person: the customer record and its address.                                                                                                                                                                                                      |
| Customer Management | `vehicles`    | The vehicles a customer brings in.                                                                                                                                                                                                                                                   |
| Workshop Catalog    | `services`    | What the workshop sells as labour, with its price and estimated duration.                                                                                                                                                                                                            |
| Inventory           | `inventory`   | Stock, and the append-only ledger of every unit that moved.                                                                                                                                                                                                                          |
| Workshop Operations | `work-orders` | The work order lifecycle, its items, its budget rounds, and its trail.                                                                                                                                                                                                               |
| -                   | `shared`      | What belongs to no context: `Money`, `AggregateRoot`, the error hierarchy, the ports, the event dispatcher, the exception filter.                                                                                                                                                    |

## The four layers

Every module carries the same four directories, and each arrow below is a source dependency:

```
presentation  ->  application  ->  domain
                       ^              ^
                       |              |
                  infrastructure -----+
```

`application` declares the ports it needs and `infrastructure` implements them, so the arrow runs
from the outer layer to the inner one. The module's composition root, `<module>.module.ts`, sits
outside all four: it builds every use case and binds every port to its adapter.

`npm run lint` makes those arrows real. Files under `src/**/domain/**` and `src/**/application/**`,
specs included, may not import `@nestjs/*`, `typeorm`, `ioredis`, `argon2`, `pg`,
`class-validator`, `class-transformer`, `zod`, `express`, `rxjs` or a `node:*` module, may not
carry a decorator, and may not declare an injection token with `Symbol()`. dependency-cruiser
fails an import from `domain` or `application` into `infrastructure` or `presentation`, and one
from `domain` into `application`. A violation fails `npm run lint`, so the layering cannot erode
quietly. [The README](../../README.md#what-npm-run-lint-enforces) lists every rule.

## How a request travels

A controller receives it, builds a `<Name>Command` or `<Name>Query`, and calls the use case class
directly. It never touches a repository.

```
HTTP  ->  controller  ->  use case  ->  repository / query port  ->  PostgreSQL
```

Writes go through an aggregate: the use case loads it, calls a method on it, and saves it. Reads do
not. A query use case goes to a query port that runs SQL and returns a DTO, because loading an
aggregate to read from it buys nothing and costs a hydration. A query that looks one record up by
its identifier throws its module's not-found error, so every entry point inherits the rule.

A use case is a plain class with no decorator and no injection token. The composition root builds it
with a factory provider and hands each dependency to its constructor, so the constructor lists
exactly what the operation uses. A use case that the root does not provide cannot be injected into
the controller that calls it, and Nest refuses to start, which the e2e suite catches first. The seed
script resolves the same use cases from the application context, so a second entry point reuses the
rules without copying them.

## How modules talk

Only through ports and public APIs ([0027](../adr/0027-ports-between-modules.md)). A module that
needs another declares a port in its own `application/ports` and implements it in its own
`infrastructure/gateways`. The gateway calls the use cases the other module exports from its
`index.ts`, and turns that module's not-found error into `null`, so the caller keeps raising its own
error. No `domain` or `application` file imports another module, the `infrastructure` and
`presentation` of a module import another only through its `index.ts`, and the dependencies between
modules have no cycle. [The README](../../README.md#the-module-dependency-graph) draws the graph.

Each module also queries only its own tables ([0028](../adr/0028-each-module-queries-only-its-own-tables.md)).
Turning another module's UUID into an internal key goes through the key resolver that module
offers, and data another module owns comes through its public API, in batch, composed in memory by
the consumer. The customer listing shows the shape: `customers` asks `identity` for the users that
match the filter, turns their ids into keys, and reads its own table by those keys.

One pair is inverted. `work-orders` calls `inventory` to move stock, and `inventory` needs work
order data for the shortage report and the in-use check. `inventory` declares the `WorkOrderReads`
interface, `work-orders` implements it, and a global module binds the two at the root, so every
import between the two modules points from `work-orders` to `inventory`.

The rule is visible in an import list, which is what makes it reviewable, and `npm run lint`
checks it.

## The guard chain

Four guards run on every request, globally registered in `src/app.module.ts` as `APP_GUARD`
providers. Nest runs them in declaration order, which is the order below:

| Order | Guard                  | What it decides                                                                                        |
| ----- | ---------------------- | ------------------------------------------------------------------------------------------------------ |
| 1     | `ThrottlerGuard`       | Whether this caller has made too many requests. Counters live in Redis.                                |
| 2     | `JwtAuthGuard`         | Whether the token is valid and its session is not revoked. Consults the revoked session list in Redis. |
| 3     | `PendingPasswordGuard` | Whether an account that must change its password is trying to do anything else.                        |
| 4     | `PermissionsGuard`     | Whether the effective access carries every permission the route requires.                              |

`PermissionsGuard` reads `@RequirePermissions()` metadata and requires **all** of the permissions
it finds. It cannot express "either of two", which is why a rule of that shape lives in the use case
instead, as the budget decision and cancellation authorizers do.

Effective access is resolved per user and cached in Redis, invalidated by a subscriber on
assignment changes ([0003](../adr/0003-redis-for-cache-revocation-and-rate-limiting.md)). The cache
key and its TTL are on [the authorization page](low-level-design/identity/authorization.md).

One consequence catches people: registration assigns `CUSTOMER` to every account, so every staff
account also carries the permissions of `CUSTOMER`. A permission that `CUSTOMER` holds is held by
everyone.

## Writes across modules

A transaction writes the tables of one module only. Most writes touch one aggregate and get their
transaction from their own repository. A use case that writes more than one aggregate of its module
runs under the `TransactionRunner`, which opens the transaction and puts the manager in an
`AsyncLocalStorage`. Any repository of that module resolves its manager through
`currentEntityManager()` first, and opens its own only when there is none. A repository that does
open its own does it through `runInNewTransaction`, which publishes that manager as the ambient
one, so the key resolvers and the reads of other modules that it calls join the transaction and
take no second connection
([0032](../adr/0032-a-repository-own-transaction-is-the-ambient-one.md)). `run` rejects a call made
inside a transaction that is already open.

A flow that writes two modules runs as steps, and each module commits its own
([0033](../adr/0033-writes-across-modules-run-as-steps.md)). The module that orchestrates the flow
records each pending step in an outbox table of its own: `work_order_stock_steps` in `work-orders`
and `customer_account_steps` in `customers`. A processor in each module claims the steps that are
due at application bootstrap and every `OUTBOX_POLL_INTERVAL_MS`, applies them through an applier,
and retries a failed step after 1 second, 5 seconds, 30 seconds, 2 minutes, 10 minutes and then
every hour, until `OUTBOX_MAX_ATTEMPTS` marks it failed and logs it. Five flows work this way:

| Flow                                   | First step                                                                               | Last step                                                                                                                        | When a step fails                                                                                             |
| -------------------------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Withdraw parts                         | Arm an undo step, then consume in `inventory`                                            | Disarm the step, save the work order and record a confirmation step, in one transaction; apply the confirmation after the commit | The request undoes the consumption at once and answers the first error; the processor undoes it after a crash |
| Register a customer with a new account | Arm a discard step, then open the account in `identity`                                  | Disarm the step and save the customer, in one transaction                                                                        | The request discards the account at once and answers the first error; the processor discards it after a crash |
| Return parts, deliver, cancel          | Save the work order and record the restore, settle or write-off step, in one transaction | Apply the step after the commit                                                                                                  | The step stays pending and the processor retries it; the request still succeeds                               |

When the processor claimed an armed step before the request reached its last transaction, the
disarm finds the step taken, the request answers 409 `CONCURRENT_MODIFICATION`, saves nothing and
applies its own compensation. Every receiving step is idempotent by operation id, so a repeat after
a crash or a retry changes nothing. A registration over an existing user writes nothing in
`identity` and arms no step. The `inventory` use cases that consume, restore, undo, settle and
write off each open a transaction of their own, and the confirmation is a single statement.

A work order's steps apply in the order they were recorded, and a failed step holds the later ones
until an operator sets it back to pending. The undo is outside that order: it applies once it is
due and holds no other step. The confirmation tells `inventory` that the work order accepted the
withdrawal. Until it applies, the consumption belongs to the withdrawal's undo alone, and a restore,
a settlement and a write-off leave it untouched.

The work order aggregate additionally carries a `version` column, and its repository refuses a
write whose loaded version no longer matches, answering 409
([0024](../adr/0024-optimistic-version-guard-on-the-work-order.md)).

## Conventions that apply everywhere

**Identifiers.** Every addressable table carries `id bigserial` internally and `external_id uuid`
externally. The domain carries external identifiers, foreign keys carry internal ones, and
repositories resolve one into the other at their boundary, asking the key resolver of the module
that owns the row when it is another module's. Join tables no route addresses keep a composite key
of internal ids ([0006](../adr/0006-internal-key-plus-external-uuid.md)).

**Money.** Integer BRL cents everywhere, `bigint` columns, cents in API payloads. TypeORM returns
`bigint` as a string, so mappers convert explicitly
([0007](../adr/0007-money-in-integer-brl-cents.md)).

**Aggregates.** Private constructor, a static creation method that records a domain event, a static
`restore` for the mapper, a props interface, read-only getters, and `record()` /
`pullDomainEvents()` from `AggregateRoot`. `AggregateRoot` also exposes a non-draining read, which
is what lets a repository write a trail from the same events the use case will publish afterwards.

**Append-only history.** `stock_movements`, `stock_movement_transitions` and `work_order_events`
are never deleted and never rewritten beyond a movement's status and a consumption's confirmation
time ([0015](../adr/0015-stock-movements-append-only.md),
[0021](../adr/0021-the-trail-written-inside-the-aggregate-transaction.md)).

**Persistence.** Hand-written SQL migrations under
`src/shared/infrastructure/database/migrations`, eleven of them. `CHECK` constraints for status
columns, partial unique indexes filtered by `deleted_at IS NULL` for the soft-delete rules.

**Errors.** Each rule gets a `DomainError` subclass with a module-prefixed `code` and an
`ErrorKind`. `GlobalExceptionFilter` maps the kind to a status, and that mapping is the whole
contract:

| `ErrorKind`     | Status |
| --------------- | ------ |
| `Validation`    | 400    |
| `Unauthorized`  | 401    |
| `Forbidden`     | 403    |
| `NotFound`      | 404    |
| `Conflict`      | 409    |
| `RuleViolation` | 422    |

**Domain events.** Recorded by the aggregate, published by the use case through the
`DomainEventPublisher` port with `events.publish(aggregate.pullDomainEvents())`. An in-memory
dispatcher hands each event to the subscribers of its class without waiting for them, and logs a
subscriber that fails, by name, without failing the caller. A subscriber is a plain class that the
composition root of its module registers on the dispatcher. It runs after the commit, which is why
anything that must not be lost is written inside the transaction instead
([0021](../adr/0021-the-trail-written-inside-the-aggregate-transaction.md)).

**Cross-context work that must be able to fail the caller** is a synchronous call through a port,
not a subscriber. Stock consumption and the opening of an account go through the `StockLedger` and
`CustomerAccounts` ports for exactly that reason, and the request answers the error of the call.
Work that must not fail the caller, such as the confirmation of a withdrawal and the restore, the
settlement and the write-off that follow a committed save, is a step in the outbox of the module
that saved.

## The HTTP surface

Global prefix `api`, URI versioning at `v1`, so every route is `/api/v1/...`. Swagger is served at
`/api/docs`. Helmet, throttling and pino logging with redaction are applied globally.

Routes and their shapes belong to the module pages, not here.
