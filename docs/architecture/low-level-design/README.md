# Low level design

One page per code unit: the eight modules under `src/modules`, plus the shared kernel at
`src/shared`.

| Page                                | Context             | Holds                                                                          |
| ----------------------------------- | ------------------- | ------------------------------------------------------------------------------ |
| [users](users.md)                   | Identity & Access   | The `User` aggregate, the document, the password, the account lifecycle        |
| [authentication](authentication.md) | Identity & Access   | `Session` and `RefreshToken`, rotation and reuse detection, revocation         |
| [authorization](authorization.md)   | Identity & Access   | `Role` and `Permission`, assignment, the escalation rule, effective access     |
| [customers](customers.md)           | Customer Management | The `Customer` aggregate, `Address`, `PhoneNumber`                             |
| [vehicles](vehicles.md)             | Customer Management | The `Vehicle` aggregate, `LicensePlate`, `VehicleYear`                         |
| [services](services.md)             | Workshop Catalog    | The `Service` aggregate and the catalog price                                  |
| [inventory](inventory.md)           | Inventory           | `InventoryItem`, `StockMovement`, the append-only ledger                       |
| [work-orders](work-orders.md)       | Workshop Operations | The `WorkOrder` aggregate, its items, its budget rounds, its trail             |
| [shared](shared.md)                 | none                | `Money`, `AggregateRoot`, the ports, the error hierarchy, the exception filter |

## What this level owns

Each page covers, for its own unit: the aggregates and their invariants, the value objects, the
commands and handlers, the queries and ports, the repository and mapper, the ORM entities with
their columns, the endpoints, and the errors with their HTTP mapping.

## What it does not

**Anything another unit owns.** A page describes what its own module holds. Where a module talks to
another, the page names the call and links the other page rather than describing it.

**Any decision.** Why something is the way it is belongs to [a record](../../adr/README.md), and a
page links it rather than restating the reasoning. A page that argued a decision would become a
second copy of it, free to drift.

**Anything the level above already carries.** The layering, the bus rule, the guard chain, the
cross-module transaction rule, the identifier and money conventions and the error-kind mapping are
in [the high level design](../high-level-design.md). A page cites it instead of repeating it.

## On the column tables

Every ORM entity is documented with its full column list, and each block names the migration file
its columns come from, so a reader verifies with one file open rather than by trusting the page.

That fidelity has a cost: nothing mechanical detects a migration that lands without the
corresponding page being updated. **The columns on these pages were read at commit `875f073`.** A
page that disagrees with the schema is stale rather than wrong about the design, and the migration
named in its block is the authority.

## The diagrams

One C4 component diagram per bounded context, not per module, in the directory above:

- [Identity & Access](../c4-components-identity-and-access.mmd), spanning three modules
- [Customer Management](../c4-components-customer-management.mmd), spanning two
- [Workshop Catalog](../c4-components-workshop-catalog.mmd)
- [Inventory](../c4-components-inventory.mmd)
- [Workshop Operations](../c4-components-workshop-operations.mmd)
