# 0027. Modules meet through consumer-owned ports and public APIs, with no cycle

**Status**: Accepted
**Supersedes**: [0008](0008-cross-context-calls-through-the-buses.md)
**Source**: AD-012 in `.specs/STATE.md`
**Recorded**: 2026-10-28, from AD-012, taken during the `clean-architecture` feature

## Context

ADR 0008 made the CommandBus and the QueryBus the only way for one module to reach another. That
kept modules from importing each other's repositories. It also means a handler holds the bus, so its
constructor does not show which modules it calls. `users`, `authentication` and `authorization`
depend on one another in a cycle that nothing reports.

ADR 0026 removes the bus. Every call between modules then becomes a visible dependency, and the
dependencies need a rule about their shape.

One pair of modules needs more than a rule. `work-orders` calls `inventory` to consume, restore,
settle and write off stock. `inventory` needs work order data in return: the internal key of a work
order, the outstanding demand per item for the shortage report, and the open work orders that plan
an item before it is deactivated. A direct call from `inventory` into `work-orders` closes a cycle
between the two modules.

## Decision

A module reaches another only through a port that the caller declares in its own `application/ports`
and implements in its own `infrastructure/gateways`. The gateway calls the other module's public
API: the use cases and the input and output types that module exports from its `index.ts`. No file
under `domain` or `application` imports another module, the `infrastructure` and `presentation` of a
module import another module only through its `index.ts`, and the module dependencies contain no
cycle.

A gateway turns the provider's not-found error into `null`. The consumer then raises its own error,
as `ReferencedCustomerNotFoundError` does when `POST /work-orders` names a customer that does not
exist.

Where the owner of some data already depends on the module that needs it, the consumer declares the
interface, the owner implements it, and the root module binds the two. `inventory` declares
`WorkOrderReads` for its three needs. `work-orders` implements it in `TypeOrmWorkOrderReads`, and
`WorkOrderReadsModule`, a global module imported once by `app.module.ts`, provides the
implementation under the interface's token. Every dependency between the two modules then points
from `work-orders` to `inventory`.

## Alternatives

Keeping the buses was rejected for the reasons in the context.

A `forwardRef` between `InventoryModule` and `WorkOrdersModule` was rejected. It makes
`inventory.module.ts` import `work-orders.module.ts`, which is the source cycle the rule forbids.

A dynamic `InventoryModule.register()` was rejected. It needs the same implementation instance
handed to `WorkOrdersModule`, while the global module binds it with one import at the root.

## Consequences

Each cross-module need costs a port, a gateway and an in-memory fake for the use case specs. A spec
asserts the collaboration through the state of the fake.

`inventory` will reach work order data through a global binding registered at the root, a mechanism
the codebase has not used before. When the binding is missing, Nest fails at bootstrap and the e2e
suite fails first.

`npm run lint` will enforce the rule with dependency-cruiser (`no-circular`, `core-stays-in-module`
and `through-public-api`), starting from a baseline of known violations that each rewritten module
shrinks until it is empty.

A write that spans two modules still commits as one. ADR 0023 holds, and the shared transaction
wraps the direct calls between use cases.
