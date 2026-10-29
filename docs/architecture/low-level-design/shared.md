# shared

The kernel at `src/shared`. What belongs to no bounded context because it belongs to all of them.

**This unit holds no aggregate.** It holds the base classes aggregates are built from, the value
object every module's money is expressed in, the ports the application layer depends on, and the
filter that turns a domain error into an HTTP response. Nothing here has a lifecycle, an invariant
of its own, or a table.

Conventions this page does not repeat are in [the high level design](../high-level-design.md); this
page holds the classes that implement them.

## Domain

### `Money` (`domain/value-objects/money.ts`)

Integer BRL cents, used by `services`, `inventory` and `work-orders`
([0007](../../adr/0007-money-in-integer-brl-cents.md)). One implementation, so a total computed in
one context and compared in another uses identical arithmetic. Rejects a non-integer or negative
amount with `MONEY_INVALID_AMOUNT` (400).

### `AggregateRoot` (`domain/aggregate-root.ts`)

The base every aggregate extends. It carries `record()` for a domain event and two ways to read
them back:

- `pullDomainEvents()` drains, and is what the use case calls to publish after `save` returns.
- A second, **non-draining** read exists so a repository can write a trail from the same events the use case will publish afterwards. That is what makes [0021](../../adr/0021-the-trail-written-inside-the-aggregate-transaction.md) possible without the repository stealing the events from the publisher.

### `DomainEvent` and `EntityId`

`DomainEvent` is the base every event extends. `EntityId` wraps a UUID with validation, and every
module's `XxxId` value object builds on it. An invalid one is `INVALID_ID` (400).

### The error hierarchy

`BaseError` at the root, `DomainError` for rule violations raised by a domain object, and
`ApplicationError` for failures raised by the application layer. Each concrete error carries a
module-prefixed `code` string and an `ErrorKind`.

`ErrorKind` is the whole vocabulary, six values, and it is what the HTTP mapping keys off:

| `ErrorKind`     | Meaning                                                                          |
| --------------- | -------------------------------------------------------------------------------- |
| `Validation`    | The input cannot be accepted as given.                                           |
| `Unauthorized`  | No valid credential.                                                             |
| `Forbidden`     | A valid credential that is not allowed to do this.                               |
| `NotFound`      | The thing addressed does not exist.                                              |
| `Conflict`      | The write collides with the current state.                                       |
| `RuleViolation` | The input is well formed and the actor is allowed, but a domain rule refuses it. |

Two errors live here rather than in a module because more than one module can raise them:

| Error                         | Code                      | Kind         |
| ----------------------------- | ------------------------- | ------------ |
| `InvalidIdError`              | `INVALID_ID`              | `Validation` |
| `InvalidMoneyAmountError`     | `MONEY_INVALID_AMOUNT`    | `Validation` |
| `ConcurrentModificationError` | `CONCURRENT_MODIFICATION` | `Conflict`   |

`ConcurrentModificationError` is in `application/errors` rather than `domain/errors`, because a
version collision is a persistence concern rather than a domain rule. It lives here so a module
that later finds the same exposure adopts the guard rather than inventing another
([0024](../../adr/0024-optimistic-version-guard-on-the-work-order.md)).

## Application ports

Four ports, all implemented in `infrastructure`. Their injection tokens are in
`src/shared/shared.tokens.ts`, next to the composition root:

| Port                   | Implementation                  | Why it is a port                                                                                                                                      |
| ---------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Clock`                | `SystemClock`                   | So the time-dependent behaviour of a use case is testable without freezing the system clock.                                                          |
| `IdGenerator`          | `CryptoIdGenerator`             | So an aggregate's identifier is injected rather than generated inside the domain.                                                                     |
| `TransactionRunner`    | `TypeOrmTransactionRunner`      | So a use case can span a transaction across modules without importing TypeORM ([0023](../../adr/0023-repositories-honour-an-ambient-transaction.md)). |
| `DomainEventPublisher` | `InMemoryDomainEventDispatcher` | So a use case hands the events of its aggregate to whoever listens without knowing who that is. `DomainEventSubscriber` is the shape of a listener.   |

`domain` and `application` import no framework or infrastructure package, and `npm run lint` fails
when one does. These ports are how those layers reach the clock, the ids, the transaction and the
subscribers.

## Infrastructure

### `typeorm-transaction-runner.ts`

Holds `TypeOrmTransactionRunner`, `currentEntityManager()` and `runInNewTransaction()`. The runner
places its `EntityManager` in an `AsyncLocalStorage`; `currentEntityManager()` reads it back. A
repository that finds no ambient transaction opens its own through `runInNewTransaction()`, which
publishes that manager as the ambient one, so the key resolvers and the reads of other modules that
it calls join the transaction and take no second connection. The rule that obliges a repository to
use all of this, and why, is [ADR 0023](../../adr/0023-repositories-honour-an-ambient-transaction.md).

### `in-memory-domain-event-dispatcher.ts`

Holds `InMemoryDomainEventDispatcher` (`infrastructure/events`). A module subscribes its listeners
in its composition root, and `publish` hands each event to the subscribers of its class. Each
subscriber starts during `publish` and the dispatcher never waits for it. A subscriber that throws or
rejects is logged at error level, under the `EventBus` context, as
`"<SubscriberName>" has thrown an unhandled exception.`, and the error never reaches the caller.
`SharedModule` provides the dispatcher and binds `DOMAIN_EVENT_PUBLISHER` to the same instance.

### `database/migrations/`

Nine hand-written SQL migrations, `1787702400000` through `1787702400008`. Every table in the
system is created here, not by synchronisation, so a schema change is a reviewable file. The
per-table detail lives on each module's page.

### `typeorm-cli.datasource.ts`, `redis.module.ts`, `crypto-id-generator.ts`, `system-clock.ts`

The CLI datasource is what `npm run migration:run` and `npm run seed:admin` load. The others are
the single implementations of the ports above.

## Presentation

### `GlobalExceptionFilter` (`presentation/filters/`)

Every error the API answers passes through here. It maps `ErrorKind` to a status:

| `ErrorKind`     | Status |
| --------------- | ------ |
| `Validation`    | 400    |
| `Unauthorized`  | 401    |
| `Forbidden`     | 403    |
| `NotFound`      | 404    |
| `Conflict`      | 409    |
| `RuleViolation` | 422    |

It also maps a status to a generic code for errors that never came from the domain, so a 405 or a
429 answers in the same envelope: `METHOD_NOT_ALLOWED`, `RATE_LIMIT_EXCEEDED`, `BAD_REQUEST`,
`AUTH_UNAUTHORIZED`, `AUTH_FORBIDDEN`, `RESOURCE_NOT_FOUND`.

Every error response carries a `reference`: the request id, which `app.module.ts` configures pino
to generate as `randomUUID()` per request. It is what a caller quotes when reporting a failure, and
it differs between two otherwise identical responses, which matters when comparing them.

### `AppValidationPipe`, `ErrorResponseDto`, `RequestValidationError`

The pipe validates request DTOs and raises a `RequestValidationError`, which the filter renders as
a 400 in the same envelope as a domain error. `ErrorResponseDto` is that envelope.

## What this page does not hold

No aggregate, no table, no endpoint, no migration detail beyond the file list. Each of those
belongs to the module that owns it.
