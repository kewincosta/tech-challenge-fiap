# Event Storming — Workshop Management

Status: analysis and modelling only. No production code, schema or endpoint was created in
this stage. Reference for the technical patterns: the existing repository
(`src/modules/users`, `src/modules/authentication`, `src/modules/authorization`,
`src/shared`).

Revision 9. Section 14 records the answers given by the product owner. The model in sections 3
to 13 already reflects them.

## 1. Context

A medium sized mechanical workshop runs its attendance, diagnosis, execution and delivery
by hand. There is no single place holding what was requested, what was diagnosed, what the
customer approved, which parts were used and where each vehicle stands.

The system centralises that operation around one concept: the **Work Order**. A service advisor
receives a customer and a vehicle, a mechanic diagnoses it, the system prices the work, the
customer approves it, the mechanic executes it and withdraws the parts as they are used, and
the vehicle is delivered.

The workshop is medium sized, and this MVP covers one physical location with one stock. No
invoicing, no supplier management, no scheduling. The model below stays at that size on
purpose, and every simplification in section 14 is justified against it rather than against a
dealership.

## 2. Scope

Modelled in this document:

- people identified by CPF or CNPJ at registration, whoever registers them;
- the workshop customer as an aggregate of its own, anchored on a user identity;
- vehicle records with plate, brand, model and year, belonging to a customer;
- service catalog;
- parts and supplies as one stock, with an auditable movement history linked to the work order that consumed them;
- work order lifecycle across the six mandatory states plus cancellation;
- automatic budget generation from the work order items, in as many rounds as the job needs;
- additional repairs found during execution, authorised by the customer on the same work order;
- budget approval and rejection by the customer, or by the counter on the customer's behalf;
- part withdrawal during execution, which is what actually moves the stock;
- completion, delivery, settlement of the stock movements, and a restricted discount;
- an append only trail of who did what on a work order;
- work order tracking by the customer through the API;
- average execution time as a read model.

Out of scope: payments and cash register, invoicing, suppliers, purchase orders, warranty,
returns, mechanic scheduling, employee records, commissions, multi-branch, multi-warehouse,
notification channels, budget versioning.

Reused as-is: authentication (JWT, sessions, refresh token rotation) and authorization (roles,
groups, permissions, effective access cache). Extended: `users` gains the document and the
administration endpoints, `authorization` gains a super administrator role and an escalation
rule, `authentication` gains the forced password change and a logout that ends every session,
and every addressable table gains the internal key plus external identifier pattern.

## 3. Actors

| Actor           | Responsibility                                                                                                                                                                                           |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Customer        | Owns vehicles, approves or rejects the budget, tracks the progress of their own work orders.                                                                                                             |
| Service advisor | Registers customers and vehicles, opens the work order, records the requested services, assigns a mechanic, approves a budget on the customer's behalf, delivers the vehicle, cancels a work order.      |
| Mechanic        | Runs the diagnosis, plans the parts and supplies, executes the work, withdraws the parts from stock as they are used, returns what turned out unnecessary, reports a shortage, completes the work order. |
| Administrator   | Manages the service catalog, the inventory, the customers and the staff accounts, applies discounts, reads operational metrics and the trails.                                                           |
| System          | Prices the work order and generates the budget, applies the automatic status transitions, settles, transfers or writes off the stock movements, and records the work order trail.                        |

Four of them map onto system roles already seeded in the database: `ADMIN`, `MECHANIC`,
`SERVICE_ADVISOR` and `CUSTOMER` (see `1787702400001-seed-rbac-catalog.ts`). `System` is not a
role and never logs in; it names what the application does on its own.

One more actor exists, and it belongs to a different plane:

| Platform actor      | Responsibility                                                                                                                                                                                   |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Super administrator | Owns the authorization model itself. Manages roles and permissions, and is the only one who can grant the administrator profile. Created outside the API, by the seed script or a direct insert. |

The super administrator is not a workshop role. Nobody in the oficina holds that job. It exists
so that an operational administrator cannot widen their own access, and it is kept out of the
domain actor list on purpose. See H30.

### 3.1 Profiles, aggregates and who maintains them

A profile is not automatically an aggregate. Every person in the system is one `User`, and the
profile is a `Role` assigned to that user. Both already exist and are implemented: `User` in
the `users` module, `Role` and the assignment in `authorization`, backed by `user_roles` and
the `AssignRoleToUserCommand` and `RevokeRoleFromUserCommand` that are already wired.

One profile does get an aggregate. `Customer` exists because the workshop records things about
that relationship which are nobody else's business: the address, the vehicles, the work order
history. Putting those on the user record would grow the identity module with data from other
domains. Mechanic, Service advisor and Administrator get none, because in this system they have no
state, no behaviour and no invariant beyond their access. See H28 for the trigger that would
change that.

| Profile             | Represented by                                               | Who creates the person                                                 | Who edits the workshop data                                        | Who grants or revokes the profile                         |
| ------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------- |
| Customer            | `User` plus the `CUSTOMER` role, plus a `Customer` aggregate | The person through public sign up, or a service advisor at the counter | The person for their own data, a service advisor, an administrator | Assigned at registration. An administrator can revoke it. |
| Service advisor     | `User` plus the `SERVICE_ADVISOR` role                       | An administrator                                                       | The person, an administrator                                       | An administrator                                          |
| Mechanic            | `User` plus the `MECHANIC` role                              | An administrator                                                       | The person, an administrator                                       | An administrator                                          |
| Administrator       | `User` plus the `ADMIN` role                                 | An administrator, granted only by a super administrator                | The person, an administrator                                       | A super administrator                                     |
| Super administrator | `User` plus the `SUPER_ADMIN` role                           | `scripts/seed-admin.ts` or a direct database insert                    | The person                                                         | Nobody through the API                                    |

Rules that follow from this table:

- Granting a profile is an existing capability. `PUT /api/v1/users/{userId}/roles/{roleId}`
  behind `user-access:manage` is how somebody becomes a mechanic.
- `SUPER_ADMIN` is never assignable through the API, and `ADMIN` is assignable only by a super
  administrator. Nobody grants a profile at or above their own level.
- The counter endpoints reach customers only. A request through `customers:manage` that targets
  a user holding a staff role is refused, so a service advisor cannot edit an administrator through the
  customer door.
- Editing one's own personal data needs no workshop permission. It is scoped to the
  authenticated principal.
- Editing somebody else's personal data needs `customers:manage` for a customer and
  `users:manage` for anybody, staff included.
- A person can hold more than one profile. A mechanic who brings their own car holds MECHANIC
  and CUSTOMER and has a `Customer` record, and the work order rules read that record rather
  than the absence of other roles.

Aggregate map, for the whole system:

| Aggregate     | Module                    | Context             | What it protects                                                                                                          |
| ------------- | ------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| User          | `users` (exists)          | Identity & Access   | Identity, credentials, document validity and uniqueness, personal data, the pending password rule                         |
| Session       | `authentication` (exists) | Identity & Access   | Session lifecycle, refresh token rotation and reuse detection                                                             |
| Role          | `authorization` (exists)  | Identity & Access   | Role naming, immutability of the system roles, the permission set, the escalation rule                                    |
| Group         | `authorization` (exists)  | Identity & Access   | Group membership and the roles and permissions it carries                                                                 |
| Permission    | `authorization` (exists)  | Identity & Access   | The permission catalog                                                                                                    |
| Customer      | `customers` (new)         | Customer Management | Exactly one user identity per customer, the address, and the anchor for everything the workshop records about that person |
| Vehicle       | `vehicles` (new)          | Customer Management | Plate validity and uniqueness, exactly one owning customer                                                                |
| Service       | `services` (new)          | Workshop Catalog    | Catalog name uniqueness, price, estimated duration                                                                        |
| InventoryItem | `inventory` (new)         | Inventory           | The unit count, and the lifecycle of every movement                                                                       |
| WorkOrder     | `work-orders` (new)       | Workshop Operations | The state machine, the budget, the charged total, the trail of who did what                                               |

## 4. Bounded contexts

| Context                              | Responsibility                                                                                                                                   | Main concepts                                                                               |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| Identity & Access (exists, extended) | Who exists as a person, how they prove it, and what they may do.                                                                                 | User, PersonDocument, Session, Role, Group, Permission                                      |
| Customer Management (new)            | Who the workshop serves, what it records about that relationship, and which vehicles belong to whom.                                             | Customer, Address, Vehicle, LicensePlate                                                    |
| Workshop Catalog (new)               | What the workshop sells as labour, at which price and estimated duration.                                                                        | Service, Money, ServiceDuration                                                             |
| Inventory (new)                      | What the workshop holds in stock, how much is left, and the traceable history of every unit that moved.                                          | InventoryItem, StockMovement, StockMovementTransition                                       |
| Workshop Operations (new)            | The life of a work order, from reception to delivery or cancellation, including the budget, the approval, what is charged and who did each step. | WorkOrder, WorkOrderServiceItem, WorkOrderPartItem, Budget, WorkOrderStatus, WorkOrderEvent |

Adjustments to the proposal in the briefing:

- Parts and Supplies are one `InventoryItem` aggregate with a `kind` label. They share every
  rule and differ only by that adjective.
- Diagnosis, Budget, Approval and Execution are phases of the same work order lifecycle and
  share one transactional boundary. They live around the `WorkOrder` aggregate.
- `User` and `Customer` are separate aggregates in separate contexts. The user record carries
  what identifies a person, the document included, because a mechanic and an administrator have
  one too. The customer record carries what the workshop knows about the relationship.
- Vehicles live with Customers rather than in a context of their own, because a vehicle exists
  in this system only as something a customer brings in.

## 5. Main business flow

A customer arrives at the workshop with a vehicle. The service advisor identifies them by CPF or CNPJ.
Someone already known is found by that document. Someone new gets a user account with the
document, a temporary password to change on first access, the CUSTOMER role that registration
already assigns, and a customer record carrying the address. If the vehicle is unknown, the
service advisor registers it under that customer, with plate, brand, model and year.

The service advisor opens a work order for that customer and that vehicle and records the services the
customer asked for. The work order is now **Received**, and the trail records who opened it.

A mechanic starts the diagnosis, which moves the work order to **In diagnosis** and makes that
mechanic responsible for it. During the diagnosis the mechanic adds the services the vehicle
actually needs and the parts and supplies that will be used. Those parts are planned, not
withdrawn. Nothing has left the stock yet.

When the mechanic completes the diagnosis, the system prices everything from the work order
items and produces the budget, freezing the catalog prices at that moment. The work order moves
to **Awaiting approval** and the budget becomes readable by the customer.

The customer approves or rejects the budget, and the counter can decide on their behalf. On
rejection the work order returns to diagnosis, the workshop revises the items and produces a new
budget, which is how a price disagreement is resolved before approval. On approval the work
order moves straight to **In execution**.

The mechanic works on the vehicle. Each time a part is used, the mechanic withdraws it, which
takes the units out of stock at the price the budget froze and records a movement tied to that
work order and to the mechanic who took it. If a part turns out unnecessary after being taken,
the mechanic returns it and the units go back to the shelf. If a part is missing, the
withdrawal is refused and the shortage becomes visible to the administration, which replenishes
the stock. A movement tied to a work order is not a counter sale, so it stays pending until the
vehicle is delivered.

If the mechanic finds work the budget does not cover, the work order is not cancelled. The
mechanic adds the extra services and parts as a draft, the system prices them into a
supplementary budget, and the work order goes back to awaiting approval. The customer authorises
the additional repairs, or refuses them, and either way the work order returns to execution: with
the extra scope when approved, with the original scope when refused. The parts of a refused round
are never withdrawn and never charged.

When the work is done, the mechanic completes the work order, which moves to **Completed**. The
amount charged comes from the services plus the parts actually withdrawn, so a planned part that
turned out unnecessary was never charged. An administrator can reduce that amount with a
discount, and the reason is mandatory.

The service advisor hands the vehicle over, the work order moves to **Delivered**, and the stock
movements of that work order are settled.

A cancelled work order keeps its withdrawn parts out of stock. Those parts are installed in a car
the workshop will not charge for, so the movements are written off as a loss and stay visible in
the history. Cancellation is for a customer who gives up, not for extra work.

Every transition leaves an entry in the work order trail with the actor and the timestamp, so
the administration can answer who started the diagnosis, who approved on the customer's behalf,
who gave the discount and why, and who cancelled.

Throughout, the customer can query the status of their own work orders. The administration
lists and inspects work orders, reads the movement history of any item, reads the trail of any
work order and the average execution time.

### 5.1 Parts and supplies flow

The challenge asks for this flow to be modelled on its own, next to the work order flow. It
shares the timeline above and reads like this end to end.

An administrator registers a part or a supply in the catalog with a SKU, a description saying
what one unit is, a unit price and an initial count. Parts and supplies are the same thing here
and differ only by a label used for filtering.

When a supplier delivery arrives, the administrator replenishes the item and the units enter
the stock as an INBOUND movement. When a count is wrong or something is lost, the administrator
adjusts it with a mandatory note, which appends an ADJUSTMENT movement. Nobody else writes stock
quantities.

During a diagnosis the mechanic plans the parts a work order will need. Planning touches nothing
in the stock: it only records an intention that the budget will price.

During execution the mechanic takes the parts from the shelf and registers the withdrawal, in
one call for several parts when convenient. Only parts on an approved budget round can be
withdrawn: a part waiting on a supplementary approval stays on the shelf. Each withdrawal appends a CONSUMPTION movement
carrying the work order, the acting mechanic and a PENDING status, because a part taken for a
work order is not money entering the till. If the count on hand does not cover it, the whole
withdrawal is refused, nothing moves, and the shortage becomes visible to the administration
through the shortage read model, which lists every item whose pending withdrawals across work
orders in execution exceed what is on the shelf. That list is how the mechanic's signal reaches
the person who buys.

A part that turns out unnecessary goes back to the shelf while the work order is still in
execution. The return appends a RETURN movement pointing at the consumption it undoes, and the
withdrawn quantity on the work order item becomes the net, so the customer is never billed for
a part that came back.

When the vehicle is delivered, every pending movement of that work order is settled. When the
work order is cancelled, the pending movements are written off as a loss, because those parts are
installed in a car nobody will pay for and the units do not come back.

Every one of those steps is auditable. `stock_movements` records what changed the count and why,
and `stock_movement_transitions` records what happened to each movement afterwards, with the actor,
the timestamp and the work orders it moved between.

## 6. Event timeline

| Order | Event                          | Actor / System                               | Context             | Description                                                                                                      |
| ----- | ------------------------------ | -------------------------------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------- |
| 1     | User Registered                | The person, or staff                         | Identity & Access   | An account exists with a name, an email and a CPF or CNPJ. A staff created account carries a temporary password. |
| 2     | Password Changed               | The person                                   | Identity & Access   | The temporary password was replaced on first access, and every session was revoked.                              |
| 3     | Customer Registered            | Service advisor, Administrator               | Customer Management | A user identity became a workshop customer, with an address.                                                     |
| 4     | Vehicle Registered             | Service advisor                              | Customer Management | A vehicle with plate, brand, model and year is linked to a customer.                                             |
| 5     | Work Order Created             | Service advisor                              | Workshop Operations | A work order was opened for a customer and a vehicle. State: RECEIVED.                                           |
| 6     | Service Added To Work Order    | Service advisor, Mechanic                    | Workshop Operations | A catalog service was placed on the work order.                                                                  |
| 7     | Mechanic Assigned              | Service advisor, Administrator               | Workshop Operations | A mechanic became responsible for the work order.                                                                |
| 8     | Diagnosis Started              | Mechanic                                     | Workshop Operations | A mechanic began inspecting the vehicle. State: IN_DIAGNOSIS.                                                    |
| 9     | Part Planned For Work Order    | Mechanic                                     | Workshop Operations | A part or supply was listed on the work order. The stock is untouched.                                           |
| 10    | Item Removed From Work Order   | Mechanic                                     | Workshop Operations | An item was taken off the work order during diagnosis.                                                           |
| 11    | Diagnosis Completed            | Mechanic                                     | Workshop Operations | The mechanic closed the diagnosis with the final list of items.                                                  |
| 12    | Budget Generated               | System                                       | Workshop Operations | The work order was priced from its own items, freezing the catalog prices.                                       |
| 13    | Budget Sent                    | System                                       | Workshop Operations | The budget became readable by the customer. State: AWAITING_APPROVAL.                                            |
| 14    | Budget Approved                | Customer, or Service advisor on their behalf | Workshop Operations | The price was accepted.                                                                                          |
| 15    | Budget Rejected                | Customer, or Service advisor on their behalf | Workshop Operations | The price was refused. State: back to IN_DIAGNOSIS.                                                              |
| 16    | Execution Started              | System                                       | Workshop Operations | Work began on the vehicle. State: IN_EXECUTION.                                                                  |
| 17    | Stock Replenished              | Administrator                                | Inventory           | Units entered the stock, from a supplier purchase.                                                               |
| 18    | Part Withdrawn                 | Mechanic                                     | Workshop Operations | A planned part was physically taken and installed, at the budgeted price.                                        |
| 19    | Stock Consumed                 | System                                       | Inventory           | The units left the stock against that work order. The movement is pending settlement.                            |
| 20    | Insufficient Stock Detected    | System                                       | Inventory           | The withdrawal asked for more than the stock holds. The withdrawal fails and the shortage becomes visible.       |
| 20b   | Part Returned                  | Mechanic                                     | Workshop Operations | A withdrawn part turned out unnecessary and went back to the shelf. The units return to stock.                   |
| 20c   | Supplementary Budget Generated | System                                       | Workshop Operations | Extra work found during execution was priced into a new budget round. State: AWAITING_APPROVAL.                  |
| 20d   | Supplementary Budget Approved  | Customer, or Service advisor                 | Workshop Operations | The customer authorised the additional repairs. State: back to IN_EXECUTION with the wider scope.                |
| 20e   | Supplementary Budget Rejected  | Customer, or Service advisor                 | Workshop Operations | The customer refused the additional repairs. State: back to IN_EXECUTION with the original scope.                |
| 21    | Discount Applied               | Administrator                                | Workshop Operations | The amount charged was reduced, with a mandatory reason.                                                         |
| 22    | Work Order Completed           | Mechanic                                     | Workshop Operations | The work was finished and the charged total is closed. State: COMPLETED.                                         |
| 23    | Vehicle Delivered              | Service advisor                              | Workshop Operations | The vehicle was handed back. State: DELIVERED.                                                                   |
| 24    | Stock Movements Settled        | System                                       | Inventory           | The pending movements of the delivered work order were settled.                                                  |
| 25    | Work Order Canceled            | Service advisor, Administrator               | Workshop Operations | The work order was closed without delivery. State: CANCELED.                                                     |
| 27    | Stock Movements Written Off    | System                                       | Inventory           | Pending movements of a cancelled work order became a loss.                                                       |

Events 14 and 15 are alternatives, so are 19 and 20, and so are 26 and 27. Every Workshop
Operations event above is also appended to the work order trail with its actor, see H29.

## 7. Commands

| Command                     | Actor                                      | Aggregate               | Trigger                                                             | Resulting event                                    |
| --------------------------- | ------------------------------------------ | ----------------------- | ------------------------------------------------------------------- | -------------------------------------------------- |
| Register User               | The person, Service advisor, Administrator | User (exists, extended) | Sign up, or a staff registration.                                   | User Registered                                    |
| Update User                 | The person, Service advisor, Administrator | User (exists)           | Wrong name, email or document.                                      | User Updated                                       |
| Deactivate User             | Administrator                              | User (exists)           | The person left.                                                    | User Deactivated                                   |
| Change Password             | Any user                                   | User (exists)           | First access with a temporary password, or a routine change.        | Password Changed                                   |
| Assign Role To User         | Administrator, Super administrator         | Role (exists)           | Somebody becomes a mechanic, a service advisor or an administrator. | Role Assigned To User                              |
| Register Customer           | Service advisor, Administrator             | Customer                | A user identity starts being served by the workshop.                | Customer Registered                                |
| Update Customer             | The person, Service advisor, Administrator | Customer                | The address changed.                                                | Customer Updated                                   |
| Deactivate Customer         | Service advisor, Administrator             | Customer                | The customer left the workshop base.                                | Customer Deactivated                               |
| Register Vehicle            | Service advisor, Administrator             | Vehicle                 | A customer brings a vehicle not yet known.                          | Vehicle Registered                                 |
| Update Vehicle              | Service advisor, Administrator             | Vehicle                 | Wrong brand, model or year recorded.                                | Vehicle Updated                                    |
| Remove Vehicle              | Service advisor, Administrator             | Vehicle                 | The vehicle no longer belongs to that customer.                     | Vehicle Removed                                    |
| Create Service              | Administrator                              | Service                 | The workshop starts offering a new service.                         | Service Created                                    |
| Update Service              | Administrator                              | Service                 | Price or estimated duration changed.                                | Service Updated                                    |
| Deactivate Service          | Administrator                              | Service                 | The service is no longer offered.                                   | Service Deactivated                                |
| Create Inventory Item       | Administrator                              | InventoryItem           | A new part or supply enters the catalog.                            | Inventory Item Created                             |
| Update Inventory Item       | Administrator                              | InventoryItem           | Description or unit price changed.                                  | Inventory Item Updated                             |
| Replenish Stock             | Administrator                              | InventoryItem           | A supplier purchase arrived.                                        | Stock Replenished                                  |
| Adjust Stock                | Administrator                              | InventoryItem           | Count correction or loss, with a mandatory note.                    | Stock Adjusted                                     |
| Consume Stock               | System                                     | InventoryItem           | A mechanic withdrew a part for a work order.                        | Stock Consumed / Insufficient Stock Detected       |
| Restore Stock               | System                                     | InventoryItem           | A mechanic returned a part that was not needed.                     | Stock Restored                                     |
| Settle Stock Movements      | System                                     | InventoryItem           | The work order was delivered.                                       | Stock Movements Settled                            |
| Write Off Stock Movements   | System                                     | InventoryItem           | The work order was cancelled.                                       | Stock Movements Written Off                        |
| Create Work Order           | Service advisor                            | WorkOrder               | The customer leaves the vehicle at the workshop.                    | Work Order Created                                 |
| Add Requested Service       | Service advisor, Mechanic                  | WorkOrder               | The customer asked for a service, or the diagnosis found one.       | Service Added To Work Order                        |
| Plan Part                   | Mechanic                                   | WorkOrder               | The diagnosis found a part or supply to use.                        | Part Planned For Work Order                        |
| Remove Work Order Item      | Service advisor, Mechanic                  | WorkOrder               | An item was recorded by mistake or is no longer needed.             | Item Removed From Work Order                       |
| Assign Mechanic             | Service advisor, Administrator             | WorkOrder               | The responsible mechanic changed.                                   | Mechanic Assigned                                  |
| Start Diagnosis             | Mechanic                                   | WorkOrder               | A mechanic picks up the work order.                                 | Diagnosis Started                                  |
| Submit Supplementary Budget | Mechanic                                   | WorkOrder               | Extra work was found while the vehicle was on the lift.             | Supplementary Budget Generated, Budget Sent        |
| Complete Diagnosis          | Mechanic                                   | WorkOrder               | The mechanic closed the item list.                                  | Diagnosis Completed, Budget Generated, Budget Sent |
| Approve Budget              | Customer, Service advisor                  | WorkOrder               | The price was accepted.                                             | Budget Approved                                    |
| Reject Budget               | Customer, Service advisor                  | WorkOrder               | The price was refused.                                              | Budget Rejected                                    |
| Start Execution             | System                                     | WorkOrder               | Reaction to the approval.                                           | Execution Started                                  |
| Withdraw Part               | Mechanic                                   | WorkOrder               | The parts are being taken from the shelf for this work order.       | Part Withdrawn                                     |
| Return Part                 | Mechanic                                   | WorkOrder               | A part taken for this work order turned out unnecessary.            | Part Returned                                      |
| Apply Discount              | Administrator                              | WorkOrder               | A negotiated reduction, with a mandatory reason.                    | Discount Applied                                   |
| Complete Work Order         | Mechanic                                   | WorkOrder               | The work on the vehicle is done.                                    | Work Order Completed                               |
| Deliver Vehicle             | Service advisor                            | WorkOrder               | The customer picked the vehicle up.                                 | Vehicle Delivered                                  |
| Cancel Work Order           | Service advisor, Administrator             | WorkOrder               | The customer gave up on the repair.                                 | Work Order Canceled                                |

`Complete Diagnosis` records three events in one transaction. Pricing the work order from its
own items is an invariant of the `WorkOrder` aggregate, so it stays inside the aggregate instead
of becoming a policy.

## 8. Policies

| Event               | Policy                                                                | Command                     | Reason                                                                                                                                                                                                                             |
| ------------------- | --------------------------------------------------------------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Budget Sent         | Make the budget reachable by the customer and record that it went out | (subscriber, no command)    | The requirement asks for the budget to be sent for approval. The stack has no notification channel, so the budget is exposed through the customer API and the subscriber logs the fact, following `security-events.subscriber.ts`. |
| Budget Approved     | An approved work order goes straight into execution                   | Start Execution             | The requirement asks for automatic status changes driven by the actions performed.                                                                                                                                                 |
| Part Withdrawn      | The units leave the stock against that work order                     | Consume Stock               | The work order must not write stock quantities. Inventory owns that decision and can refuse it.                                                                                                                                    |
| Part Returned       | The units go back to the shelf                                        | Restore Stock               | Same reason, in the other direction. The return appends a movement rather than editing the consumption, because movements are append only.                                                                                         |
| Vehicle Delivered   | The pending movements of that work order are settled                  | Settle Stock Movements      | A part taken for a work order is not a counter sale. It stays pending until the vehicle is handed over.                                                                                                                            |
| Work Order Canceled | The pending movements become a loss                                   | Write Off Stock Movements   | The parts are installed in a car nobody will pay for. The units do not come back, and the loss stays visible. Cancellation is abandonment, so there is never a successor to hand them to.                                          |
| Password Changed    | Every session of that user is revoked                                 | Logout (exists, now global) | The token issued before the change still carries the pending flag, and a password change ends every device.                                                                                                                        |

Seven policies. The work order trail is not one of them: since revision 9 it is written by the
repository inside the same transaction that saves the aggregate, so an entry can never be missing
while the fact it describes is committed. See H39.

The stock consumption runs inside the `Withdraw Part` handler as a
cross-context command rather than as an event subscriber, so that insufficient stock fails the
withdrawal instead of leaving the work order claiming a part it never got. This mirrors
`RegisterUserHandler`, which dispatches `AssignRoleToUserCommand` through the `CommandBus`.

Everything else that could look like a policy is an internal rule of an aggregate and is listed
in section 10.

## 9. Aggregates

```text
Aggregate:        User (exists, extended)
Responsibility:   Identity, credentials and the personal data of everybody in the system.
Commands:         Register User, Update User, Deactivate User, Change Password
Events:           User Registered, User Updated, User Deactivated, Password Changed
New invariants:   - The document is a structurally valid CPF or CNPJ, check digits included.
                  - The document is unique among active users.
                  - While the password is pending replacement, every request other than the
                    password change and the logout is refused.
                  - Changing the password clears the pending flag and revokes every session.
Value objects:    UserId, Email, PersonDocument (new), Password, PasswordHash
Holds no workshop data. The document is here because it identifies a person, and a mechanic
and an administrator have one too.
```

```text
Aggregate:        Customer
Responsibility:   Represent the workshop's relationship with one person, and anchor everything
                  the workshop records about them, including how to reach them when the
                  vehicle is ready.
Commands:         Register Customer, Update Customer, Deactivate Customer
Events:           Customer Registered, Customer Updated, Customer Deactivated
Invariants:       - A customer exists only over a user identity, exactly one, and that user
                    holds the CUSTOMER role.
                  - A user identity backs at most one customer.
                  - The address, when present, is structurally valid.
                  - The phone number, when present, is structurally valid.
                  - A deactivated customer cannot be the target of a new work order.
Owned entities:   none
Value objects:    CustomerId, Address, PhoneNumber
This is the only profile with an aggregate of its own, because it is the only one with data
and rules that belong to the workshop rather than to the identity. See H28.
```

```text
Aggregate:        Vehicle
Responsibility:   Identify a vehicle and keep it attached to exactly one customer.
Commands:         Register Vehicle, Update Vehicle, Remove Vehicle
Events:           Vehicle Registered, Vehicle Updated, Vehicle Removed
Invariants:       - The plate is a valid Brazilian plate, old format or Mercosul format.
                  - The plate is unique among active vehicles.
                  - The vehicle belongs to one and only one active customer.
                  - The manufacturing year is within a plausible range.
Owned entities:   none
Value objects:    VehicleId, LicensePlate, VehicleYear
```

Vehicle is its own aggregate root rather than a child of Customer. Registering a vehicle,
fixing its model or opening a work order for it never needs the customer's other vehicles to be
loaded or kept consistent, and plate uniqueness is global rather than per customer.

```text
Aggregate:        Service
Responsibility:   Describe a service the workshop offers, with its current price and duration.
Commands:         Create Service, Update Service, Deactivate Service
Events:           Service Created, Service Updated, Service Deactivated
Invariants:       - The name is unique among active services.
                  - The price is not negative.
                  - The estimated duration is positive.
                  - A deactivated service cannot be added to a work order.
Owned entities:   none
Value objects:    ServiceId, ServiceName, Money, ServiceDuration
```

```text
Aggregate:        InventoryItem
Responsibility:   Hold one part or supply, keep its unit count truthful, and keep a traceable
                  history of every unit that moved and of every work order it answered to.
Commands:         Create Inventory Item, Update Inventory Item, Replenish Stock, Adjust Stock,
                  Consume Stock, Restore Stock, Settle Stock Movements,
                  Write Off Stock Movements
Events:           Inventory Item Created, Inventory Item Updated, Stock Replenished,
                  Stock Adjusted, Stock Consumed, Stock Restored,
                  Insufficient Stock Detected, Stock Movements Settled,
                  Stock Movements Written Off
Invariants:       - The unit count is never negative.
                  - A consumption larger than the count on hand is refused.
                  - Every consumption carries the work order that caused it and the user who
                    took it.
                  - A consumption is PENDING until its work order ends, then SETTLED on
                    delivery or WRITTEN_OFF as a loss on cancellation.
                  - A movement is never edited or deleted. Only the status of a consumption
                    changes, and every change appends a transition recording who did it and when.
                  - Only a consumption carries a status. An inbound, a return and an adjustment
                    are born final and never produce a transition.
                  - Writing off a movement never returns units to stock.
                  - A return appends a RETURN movement pointing at the consumption it undoes,
                    and never edits that consumption.
                  - A return never exceeds what the work order withdrew.
                  - The SKU is unique among active items.
                  - The unit price is not negative.
Owned entities:   StockMovement (append only), StockMovementTransition (append only)
Value objects:    InventoryItemId, Sku, InventoryItemKind (PART or SUPPLY), StockQuantity,
                  Money, StockMovementKind, StockMovementStatus (PENDING, SETTLED, WRITTEN_OFF)
```

Parts and supplies are the same aggregate with a `kind` label used for filtering and for the two
CRUD listings the challenge asks for. The stock counts whole units per SKU. What is inside the
unit is free text on the description and the system never does arithmetic with it.

`StockMovement` and `StockMovementTransition` are different things, and the names say which.
Every `StockMovement` row moves units: a supplier delivery in, a consumption out, a return back,
a count correction either way. Its quantity never changes after it is written. A
`StockMovementTransition` row moves nothing. It records that a consumption which already happened
changed meaning, from pending to settled when the vehicle was delivered, or from pending to
written off when the work order was cancelled, with the actor and the moment. Only a consumption
carries a status, so only a consumption ever produces a transition.

The work order trail keeps the name `work_order_events` rather than transitions, because it
records every domain event of the work order and not only status changes. The different suffix is
the signal.

```text
Aggregate:        WorkOrder (aggregate root of Workshop Operations)
Responsibility:   Drive one vehicle through reception, diagnosis, budget, approval, execution
                  and delivery, or to cancellation, keep the status transitions legal, hold
                  what the customer approved against what is actually charged, and record who
                  did each step.
Commands:         Create Work Order, Add Requested Service, Plan Part,
                  Remove Work Order Item, Assign Mechanic, Start Diagnosis,
                  Complete Diagnosis, Submit Supplementary Budget, Approve Budget,
                  Reject Budget, Start Execution, Withdraw Part, Return Part, Apply Discount,
                  Complete Work Order, Deliver Vehicle, Cancel Work Order
Events:           Work Order Created, Service Added To Work Order,
                  Part Planned For Work Order, Item Removed From Work Order,
                  Mechanic Assigned, Diagnosis Started, Diagnosis Completed,
                  Budget Generated, Supplementary Budget Generated, Budget Sent,
                  Budget Approved, Budget Rejected, Execution Started, Part Withdrawn,
                  Part Returned, Discount Applied, Work Order Completed, Vehicle Delivered,
                  Work Order Canceled
Invariants:       - Only the transitions in section 11 are allowed.
                  - Items belong to a budget round. Items of an approved or rejected round are
                    frozen. Items can be added to the draft round while the status is RECEIVED,
                    IN_DIAGNOSIS or IN_EXECUTION.
                  - A budget round is generated from the items of its own round, and rounds are
                    numbered. Round one comes from the diagnosis, later rounds from extra work
                    found during execution.
                  - The diagnosis cannot be completed with an empty item list.
                  - The budget total is always the sum of its own items, never a value supplied
                    from outside.
                  - The budget freezes the catalog prices when it is generated, and never
                    follows later catalog changes in either direction.
                  - The budget total never changes after approval.
                  - The charged total sums the items of the approved rounds only: the services,
                    plus the parts actually withdrawn, at the unit price their round froze,
                    minus the discount. Items of a rejected round never reach it.
                  - A part is withdrawn at most up to its planned quantity, only in
                    IN_EXECUTION, and only when its budget round was approved. A part waiting on
                    a supplementary approval stays on the shelf.
                  - A part is returned at most up to what was withdrawn, and only in
                    IN_EXECUTION. After completion the charged total is closed.
                  - The withdrawn quantity of an item is the net of withdrawals and returns,
                    and it is what the charged total uses.
                  - A discount is never negative, never exceeds the charged total, always
                    carries a reason, and only happens in IN_EXECUTION or COMPLETED.
                  - Only the customer who owns the work order, or a staff member with the
                    decide permission, decides on the budget.
                  - Every transition records the acting user.
                  - A cancelled work order accepts no further command.
                  - executionStartedAt, completedAt, deliveredAt and canceledAt are set once.
Owned entities:   WorkOrderServiceItem, WorkOrderPartItem, Budget (one per round),
                  WorkOrderEvent (append only)
Value objects:    WorkOrderId, WorkOrderNumber, WorkOrderStatus, Money, StockQuantity
```

Budget is an entity inside the `WorkOrder` aggregate, and there is one per round. Approving a
round changes the work order status in the same act, and its total has to stay consistent with
the items of that round at all times. Rounds are the reason the aggregate stays one: the second
approval has to be atomic with the status change exactly like the first.

The work order carries two totals. The **budget total** is the sum of the rounds the customer
approved, and an approved round never moves. The **charged total** is what the workshop bills: the services, plus the parts
actually withdrawn at the budgeted price, minus a discount. A planned part that turned out
unnecessary was never withdrawn, so it never reaches the charged total.

The customer and the vehicle are referenced by id, and their data reaches the work order as a
snapshot of what matters for the history. The assigned mechanic is referenced as a user, because
there is no Mechanic aggregate to point at.

## 10. Rules and constraints

Identity & Access

1. A registration captures name, email and a CPF or CNPJ. The document is mandatory whoever performs the registration.
2. The document is validated structurally, check digits included, and stored normalised as digits only.
3. Two active users cannot share a document, and two active users cannot share an email.
4. Public sign up assigns the CUSTOMER role and nothing else.
5. An account created by staff carries a temporary password and is flagged as pending replacement.
6. While the flag is set, every request other than the password change and the logout is refused.
7. Changing the password clears the flag and revokes every session of that user.
8. A logout ends every active session of that user, on every device.
9. `SUPER_ADMIN` is never assignable through the API. It is created by the seed script or by a direct database insert.
10. `ADMIN` is assignable only by a user holding `SUPER_ADMIN`.

Customer Management

11. A customer exists only over a user identity, and that user holds the CUSTOMER role.
12. A user identity backs at most one customer.
13. Deactivating a customer stops new work orders and leaves the user account untouched.
14. The plate is validated against the old Brazilian format (`AAA0000`) and the Mercosul format (`AAA0A00`), and stored normalised in upper case without separators.
15. Two active vehicles cannot share a plate.
16. A vehicle always belongs to one active customer. Ownership transfer is an update of that link.

Workshop Catalog

17. Prices and durations of a service can change freely. Budgets already generated are unaffected.
18. A deactivated service can no longer be added to a work order, and existing work orders keep theirs.

Inventory

19. The unit count never goes negative, at any point, through any command.
20. A withdrawal larger than the count on hand is refused. There is no partial withdrawal. The mechanic does not replenish stock: a refused withdrawal makes the shortage visible to the administration, which replenishes it. See H31.
21. Only Inventory writes stock quantities. Workshop Operations asks and can be refused.
22. Every consumption records the work order that caused it, the acting user, and starts as PENDING. A return appends a RETURN movement that puts the units back and points at the consumption it undoes. The consumption itself is never edited.
23. A pending consumption becomes SETTLED when the vehicle is delivered.
24. A pending consumption of a cancelled work order is WRITTEN_OFF as a loss. The units are not returned to stock, because the parts are installed in the car.
25. Movements are append only. Every status change appends an entry recording who did it, when, and which work order the movement moved from and to.

Workshop Operations

26. A work order is always for one active customer and one of that customer's vehicles.
27. Only one active work order per vehicle at a time.
28. The diagnosis cannot be completed without at least one service or one part.
29. The budget is generated by the system from the work order items. No actor supplies a total.
30. The budget total is the sum of the service items plus the sum of the planned part items.
31. A budget round freezes the catalog prices when it is generated, and never changes after its approval.
    31a. Extra work found during execution goes into a new round. The mechanic adds the items, submits the supplementary budget, and the work order returns to AWAITING_APPROVAL for the customer to authorise the additional repairs.
    31b. A rejected round leaves the work order with the scope approved so far. Its items stay attached to it, are never withdrawn and never charged.
    31c. Cancellation is for a customer who gives up on the repair, not for extra work.
32. A withdrawal is charged at the budgeted unit price, whichever way the catalog moved afterwards. A customer who complains about a price drop is answered with a discount, not with a recalculation.
33. The charged total is the services plus the withdrawn parts, minus the discount.
34. A discount requires the discount permission and a mandatory reason, cannot exceed the charged total, and only happens in IN_EXECUTION or COMPLETED.
    34a. Cancelling a work order that is already IN_EXECUTION requires `work-orders:cancel-in-execution`, which only an administrator holds, because parts already withdrawn become a loss. A service advisor cancelling from that state is refused with an explicit error naming the reason. See H36.
35. A price disagreement before approval is resolved by rejecting the budget and revising the items.
36. Only the customer who owns the work order, or a staff member with `work-orders:decide`, approves or rejects the budget.
37. Execution never starts without an approved budget.
38. Once a round is approved, the items of that round are frozen. Work it does not cover goes into the next round.

39. Delivery only happens from COMPLETED.
40. DELIVERED and CANCELED are terminal.
41. Every transition appends an entry to the work order trail with the acting user and the timestamp. The trail is append only.

Cross-cutting

43. Every administrative endpoint requires a valid JWT, which the existing `JwtAuthGuard` already enforces globally.
44. A customer reading a work order must own it. The work order identifier alone never grants access, matching the ownership check already used in `RevokeSessionHandler`.
45. Money is handled as integer BRL cents everywhere in the backend. Formatting and currency presentation belong to the client.
46. Every table that a route can address has an internal sequential primary key and a separate external identifier. Join tables that no route addresses keep a composite key of internal ids.

## 11. Work order state machine

Seven states. The six the challenge requires, plus CANCELED.

| Current state                | Command                         | Preconditions                                                                                                                                                                                          | Event                                              | Next state                       |
| ---------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------- | -------------------------------- |
| (none)                       | Create Work Order               | The customer is active; the vehicle belongs to them; the vehicle has no other active work order.                                                                                                       | Work Order Created                                 | RECEIVED                         |
| RECEIVED                     | Add Requested Service           | The catalog service exists and is active.                                                                                                                                                              | Service Added To Work Order                        | RECEIVED                         |
| RECEIVED                     | Remove Work Order Item          | The item belongs to this work order.                                                                                                                                                                   | Item Removed From Work Order                       | RECEIVED                         |
| RECEIVED                     | Assign Mechanic                 | The target user holds the MECHANIC role.                                                                                                                                                               | Mechanic Assigned                                  | RECEIVED                         |
| RECEIVED                     | Start Diagnosis                 | The actor is a mechanic. The acting mechanic becomes the assignee when there is none.                                                                                                                  | Diagnosis Started                                  | IN_DIAGNOSIS                     |
| RECEIVED                     | Cancel Work Order               | The actor holds `work-orders:cancel`.                                                                                                                                                                  | Work Order Canceled                                | CANCELED                         |
| IN_DIAGNOSIS                 | Add Requested Service           | The catalog service exists and is active.                                                                                                                                                              | Service Added To Work Order                        | IN_DIAGNOSIS                     |
| IN_DIAGNOSIS                 | Plan Part                       | The inventory item exists and is active; the quantity is positive. The stock is not touched.                                                                                                           | Part Planned For Work Order                        | IN_DIAGNOSIS                     |
| IN_DIAGNOSIS                 | Remove Work Order Item          | The item belongs to this work order.                                                                                                                                                                   | Item Removed From Work Order                       | IN_DIAGNOSIS                     |
| IN_DIAGNOSIS                 | Assign Mechanic                 | The target user holds the MECHANIC role.                                                                                                                                                               | Mechanic Assigned                                  | IN_DIAGNOSIS                     |
| IN_DIAGNOSIS                 | Complete Diagnosis              | At least one service or part item is present.                                                                                                                                                          | Diagnosis Completed, Budget Generated, Budget Sent | AWAITING_APPROVAL                |
| IN_DIAGNOSIS                 | Cancel Work Order               | The actor holds `work-orders:cancel`.                                                                                                                                                                  | Work Order Canceled                                | CANCELED                         |
| AWAITING_APPROVAL            | Approve Budget                  | The actor owns the work order or holds `work-orders:decide`.                                                                                                                                           | Budget Approved, then the policy below             | AWAITING_APPROVAL                |
| AWAITING_APPROVAL (approved) | Start Execution                 | The budget is approved.                                                                                                                                                                                | Execution Started                                  | IN_EXECUTION                     |
| AWAITING_APPROVAL            | Reject Budget                   | The actor owns the work order or holds `work-orders:decide`.                                                                                                                                           | Budget Rejected                                    | IN_DIAGNOSIS                     |
| AWAITING_APPROVAL            | Cancel Work Order               | The actor holds `work-orders:cancel`.                                                                                                                                                                  | Work Order Canceled                                | CANCELED                         |
| IN_EXECUTION                 | Withdraw Part                   | The part is planned, the withdrawn quantity does not exceed the planned one, and the stock holds it.                                                                                                   | Part Withdrawn, Stock Consumed                     | IN_EXECUTION                     |
| IN_EXECUTION                 | Withdraw Part                   | The stock does not hold the quantity.                                                                                                                                                                  | Insufficient Stock Detected                        | IN_EXECUTION, withdrawal refused |
| IN_EXECUTION                 | Return Part                     | The part was withdrawn on this work order and the returned quantity does not exceed it.                                                                                                                | Part Returned, Stock Restored                      | IN_EXECUTION                     |
| IN_EXECUTION                 | Assign Mechanic                 | The target user holds the MECHANIC role.                                                                                                                                                               | Mechanic Assigned                                  | IN_EXECUTION                     |
| IN_EXECUTION                 | Apply Discount                  | The actor holds `work-orders:discount`; the reason is present; the discount does not exceed the charged total.                                                                                         | Discount Applied                                   | IN_EXECUTION                     |
| IN_EXECUTION                 | Complete Work Order             | The actor is the assigned mechanic or an administrator. Parts never withdrawn are simply not charged.                                                                                                  | Work Order Completed                               | COMPLETED                        |
| IN_EXECUTION                 | Add Requested Service           | The catalog service exists and is active. The item joins the draft round.                                                                                                                              | Service Added To Work Order                        | IN_EXECUTION                     |
| IN_EXECUTION                 | Plan Part                       | The inventory item exists and is active. The item joins the draft round and the stock is not touched.                                                                                                  | Part Planned For Work Order                        | IN_EXECUTION                     |
| IN_EXECUTION                 | Remove Work Order Item          | The item belongs to the draft round. Items of a decided round are frozen.                                                                                                                              | Item Removed From Work Order                       | IN_EXECUTION                     |
| IN_EXECUTION                 | Submit Supplementary Budget     | The draft round has at least one item.                                                                                                                                                                 | Supplementary Budget Generated, Budget Sent        | AWAITING_APPROVAL                |
| AWAITING_APPROVAL            | Approve Budget, round above one | The actor owns the work order or holds `work-orders:decide`.                                                                                                                                           | Budget Approved, Execution Started                 | IN_EXECUTION                     |
| AWAITING_APPROVAL            | Reject Budget, round above one  | The actor owns the work order or holds `work-orders:decide`. The items of that round stay attached to it, unwithdrawable and uncharged.                                                                | Budget Rejected, Execution Started                 | IN_EXECUTION                     |
| IN_EXECUTION                 | Cancel Work Order               | The actor holds `work-orders:cancel-in-execution`, which only an administrator has. Anyone else is refused with WORK_ORDER_CANCEL_IN_EXECUTION_FORBIDDEN. Pending movements are written off as a loss. | Work Order Canceled                                | CANCELED                         |
| COMPLETED                    | Apply Discount                  | The actor holds `work-orders:discount`; the reason is present.                                                                                                                                         | Discount Applied                                   | COMPLETED                        |
| COMPLETED                    | Deliver Vehicle                 | The actor is a service advisor or an administrator.                                                                                                                                                    | Vehicle Delivered, Stock Movements Settled         | DELIVERED                        |
| DELIVERED                    | (none)                          | Terminal state.                                                                                                                                                                                        |                                                    |                                  |
| CANCELED                     | (none)                          | Terminal state.                                                                                                                                                                                        |                                                    |                                  |

Forbidden transitions, each one refused by the aggregate with a rule violation error:

- RECEIVED to AWAITING_APPROVAL, IN_EXECUTION, COMPLETED or DELIVERED directly.
- IN_DIAGNOSIS to IN_EXECUTION without an approved budget.
- IN_EXECUTION back to IN_DIAGNOSIS or AWAITING_APPROVAL.
- COMPLETED back to IN_EXECUTION.
- Any transition out of DELIVERED or CANCELED.
- Cancelling a work order that is COMPLETED or DELIVERED.
- Adding or removing items in AWAITING_APPROVAL, COMPLETED, DELIVERED or CANCELED, and touching the items of a round that was already decided.
- Withdrawing a part outside IN_EXECUTION, or a part that was never planned.
- Returning a part outside IN_EXECUTION, or more than was withdrawn.
- Applying a discount before execution starts or after delivery.
- Cancelling a work order in execution without `work-orders:cancel-in-execution`.
- Approving or rejecting a budget in any state other than AWAITING_APPROVAL.

Two transitions are automatic: `Budget Sent` on completing a diagnosis or a supplementary
round, and `Execution Started` on deciding a round, whichever way the customer decided it from
round two onwards. The others are driven by an actor, and every one of them
appends to the trail.

## 12. Context interactions

| Source                            | Target                  | Interaction                                                             | Data                                                             | Direction                                     |
| --------------------------------- | ----------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------- |
| Customer Management               | Identity & Access       | Create the account of a customer registered at the counter.             | name, email, document, temporary password                        | Synchronous write, CommandBus                 |
| Customer Management               | Identity & Access       | Validate the identity and read the name and email for a response.       | userId in, user out                                              | Synchronous read, QueryBus                    |
| Customer Management               | Identity & Access       | Validate that the user holds the CUSTOMER role.                         | userId in, roles out                                             | Synchronous read, QueryBus                    |
| Vehicle to Customer, same context | Customer Management     | Validate that the owner is an active customer.                          | CustomerId                                                       | Inside the context                            |
| Workshop Operations               | Customer Management     | Validate the customer and the vehicle, and snapshot both.               | CustomerId and VehicleId in, name, plate, brand, model, year out | Synchronous read, QueryBus                    |
| Workshop Operations               | Identity & Access       | Resolve the acting principal, validate the assigned mechanic's role.    | userId in, roles out                                             | Guards plus QueryBus                          |
| Workshop Operations               | Workshop Catalog        | Read the service to place it on the work order and to price the budget. | ServiceId in, name, price and duration out                       | Synchronous read, QueryBus                    |
| Workshop Operations               | Inventory               | Read the inventory item to plan it on the work order.                   | InventoryItemId in, name, sku and unit price out                 | Synchronous read, QueryBus                    |
| Workshop Operations               | Inventory               | Take the units out of stock when a part is withdrawn.                   | WorkOrderId, item id, quantity, actor                            | Synchronous write, CommandBus, can be refused |
| Workshop Operations               | Inventory               | Settle or write off the movements of a work order.                      | WorkOrderId                                                      | Synchronous write, CommandBus                 |
| Users (exists)                    | Authorization (exists)  | Assign the CUSTOMER role at registration.                               | userId and role name                                             | CommandBus, already implemented               |
| Users (exists)                    | Authentication (exists) | Revoke every session after a password change.                           | userId                                                           | CommandBus                                    |

No context imports another context's entities or repositories. Contexts exchange identifiers,
commands through the `CommandBus`, and read DTOs through the `QueryBus`, which is the pattern
already used between `users` and `authorization`.

## 13. Read models

| Query                      | Actor                                    | Context             | Purpose                                                                                                                                                                  |
| -------------------------- | ---------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Find Customer By Document  | Service advisor                          | Customer Management | Identify the person at the counter by CPF or CNPJ, the entry point of the whole flow.                                                                                    |
| List Customers             | Service advisor, Administrator           | Customer Management | Customers filtered by name or document.                                                                                                                                  |
| Get Customer               | Service advisor, Administrator           | Customer Management | One customer with their identity data, address, vehicles and work orders.                                                                                                |
| List Users                 | Administrator                            | Identity & Access   | Every account, filtered by role, for staff administration.                                                                                                               |
| List Vehicles              | Service advisor, Administrator           | Customer Management | Vehicles of a customer, or a plate lookup.                                                                                                                               |
| Get Vehicle                | Service advisor, Administrator           | Customer Management | Detail of one vehicle.                                                                                                                                                   |
| List Services              | Service advisor, Mechanic, Administrator | Workshop Catalog    | Pick services to add to a work order.                                                                                                                                    |
| Get Service                | Administrator                            | Workshop Catalog    | Detail of one catalog service.                                                                                                                                           |
| List Inventory Items       | Mechanic, Administrator                  | Inventory           | Pick parts to plan, and see what is left. Filterable by kind.                                                                                                            |
| Get Inventory Item         | Administrator                            | Inventory           | One part or supply with its unit count.                                                                                                                                  |
| Get Item Movement History  | Administrator                            | Inventory           | Every movement of one item, its work order, its status, its actor, and every change it went through.                                                                     |
| List Stock Shortages       | Administrator, Service advisor, Mechanic | Inventory           | Items whose pending withdrawals across work orders in execution exceed what is on hand, with the work orders waiting. This is how a shortage reaches the administration. |
| List Work Orders           | Service advisor, Mechanic, Administrator | Workshop Operations | Operational board, filtered by status.                                                                                                                                   |
| Get Work Order             | Service advisor, Mechanic, Administrator | Workshop Operations | Full detail: customer, vehicle, items, budget total, charged total, discount, status, timestamps, withdrawals, budget rounds.                                            |
| Get Work Order Trail       | Administrator                            | Workshop Operations | Who did each step of one work order, and when.                                                                                                                           |
| Get My Vehicles            | Customer                                 | Customer Management | The vehicles the customer owns, resolved from the authenticated user.                                                                                                    |
| Get My Work Orders         | Customer                                 | Workshop Operations | The customer's own work orders.                                                                                                                                          |
| Get My Work Order          | Customer                                 | Workshop Operations | Progress of one of the customer's own work orders, with the budget when it is waiting on them.                                                                           |
| Get Average Execution Time | Administrator, Service advisor           | Workshop Operations | Average elapsed time between Execution Started and Work Order Completed, overall or filtered by service.                                                                 |

Read models never travel through the aggregates. They use dedicated query ports backed by
TypeORM adapters returning DTOs, the pattern already in `SessionQueryPort` and `RbacQueryPort`.

`Get My Work Order` resolves the customer from `principal.userId` and compares it with the work
order owner. A work order that belongs to somebody else answers 404, never 200 and never 403,
which is the behaviour `RevokeSessionHandler` already applies to sessions.

## 14. Decisions, assumptions and remaining questions

Answers given by the product owner between 2026-08-29 and 2026-08-30. Items marked DECIDED are
settled and already reflected in the model above.

**H1. Can a vehicle have more than one open work order?**
DECIDED: no. One active work order per vehicle.

**H2. Can items be added after the budget is approved?**
DECIDED: no. Work the budget does not cover means cancelling and opening a new work order, which
names its predecessor.

**H3. What happens to a rejected budget?**
DECIDED: the work order returns to IN_DIAGNOSIS and the workshop produces a new budget.

**H4. Can a work order be cancelled?**
DECIDED: yes. CANCELED is terminal and reachable from RECEIVED, IN_DIAGNOSIS, AWAITING_APPROVAL
and IN_EXECUTION.

**H5. Stock reservation or direct consumption?**
DECIDED: no reservation. The mechanic withdraws the part when it is used, during execution.

**H6. How does a Customer relate to a User?**
DECIDED: a user can be anybody, and a customer is always a user. Superseded in shape by H25, which
gives Customer its own aggregate over that identity.

**H7. Who links the user account to the customer record?**
DECIDED: the counter registers both in one act, or the person signs up and the counter completes
the customer record with the address.

**H8. Sending the budget to the customer.**
DECIDED: no real dispatch. "Sent" means the budget is available to be read.

**H9. Can a mechanic swap a requested part for another one?**
DECIDED, adjusted in revision 8: yes, through a supplementary round. The unwanted part is simply
never withdrawn, so it is never charged, and the replacement goes into a new round the customer
authorises. While the work order is in diagnosis and no round has been decided, the item list is
a free draft.

**H10. How is the average execution time attributed to a service?**
DECIDED: per work order, between Execution Started and Work Order Completed, with an optional
filter by service.

**H11. Quantities of supplies.**
DECIDED: whole units per SKU. Parts and supplies share one stock model.

**H12 and H22. Which price is charged at withdrawal?**
DECIDED: always the price the budget froze, whichever way the catalog moved. A complaint about a
drop is answered with a discount, which keeps the decision with a person and leaves a reason.

**H13. Where does personal data live?**
DECIDED: on the user record. Name, email and document identify a person. Workshop data lives on
the customer record, see H25.

**H14. Where does Money live?**
DECIDED: `Money` in the shared kernel, integer BRL cents across the backend.

**H15. Can the service advisor decide on the budget for the customer?**
DECIDED: yes, through `work-orders:decide`.

**H16. Can a mechanic be reassigned?**
DECIDED: yes, while the work order is not terminal.

**H17. Identifiers.**
DECIDED: internal sequential primary key plus an external UUID. A work order also carries a human
readable number, as in `A1B090-2026`.

**H18. What happens to the parts already withdrawn when a work order is cancelled?**
DECIDED: the units never return to stock. They are written off as a loss, and the write off stays
visible in the movement history with its actor and reason. Since revision 8 there is no successor
work order, because extra work is authorised on the same one, so the transfer case disappeared.

**H19. How does a staff created account get its password?**
DECIDED: a temporary password, which the user must change on first access.

**H20. Should the internal sequential key be retrofitted onto the existing tables?**
DECIDED: yes, on every table a route can address.

**H21. Must every budgeted part be withdrawn before completion?**
DECIDED: no. Parts never withdrawn are not charged, whichever round they belong to, and a
discount covers negotiated reductions.

**H23. Do the join tables get an external identifier too?**
DECIDED: no. A table no route can address keeps a composite key of the two internal ids.

**H24. From which state can a discount be applied?**
DECIDED: IN_EXECUTION and COMPLETED.

**H25. Is there a Customer aggregate?**
DECIDED: yes. It exists so that the identity module does not grow with data from other domains.
`User` keeps what identifies a person, the document included, because a mechanic and an
administrator have one too. `Customer` keeps what the workshop records about the relationship:
the address, the vehicles, the work orders. Its invariant is its own: a customer exists only over
exactly one user identity, and that identity backs at most one customer.

**H26. What does logout end?**
DECIDED: every active session of that user, on every device. Revoking one specific session by id
stays available to staff holding `sessions:revoke-any`.

**H27. Is a postal address in scope?**
DECIDED: yes, on the `Customer` aggregate as an `Address` value object, one per customer. An
employee address is not in scope, and if it ever is, it belongs to an `Employee` aggregate rather
than to a column on the user record.

**H28. Do Mechanic, Service advisor and Administrator get aggregates?**
DECIDED: no, while they have no state, behaviour or invariant beyond their access.
Linking a work order to a mechanic needs a user reference and a role check, not an aggregate.
Recording which service advisor opened a work order needs an actor column, not an aggregate. Tracking what
an administrator did needs a trail, not an aggregate.
Triggers to revisit, one per profile: a `Mechanic` aggregate the day the workshop needs a
specialty, an hourly cost, a shift or a capacity; a `Service advisor` aggregate the day a sale exists as a
concept, which today it does not because there is no cash register and no invoicing; an
`Employee` aggregate the day staff records carry data of their own.
Consequence: the work order points at `customer_id` and at `assigned_mechanic_user_id`. The
asymmetry is deliberate and reflects what is modelled and what is not.

**H29. How are actions traced?**
DECIDED: with a trail, not with an aggregate per actor. `work_order_events` is append only and
records every work order transition with its type, the acting user, the state it moved from and
to, and the timestamp. It is written by a subscriber over the domain events the aggregate already
publishes, which is the same shape as `stock_movement_transitions` in Inventory. The work order also
carries the actor of the steps that matter commercially: who created it, who decided the budget,
who applied the discount, who delivered and who cancelled.

**H30. Is there a super administrator?**
DECIDED: yes. `SUPER_ADMIN` is a system role created by the seed script or by a direct database
insert, never through the API. It holds `roles:manage`, which the operational
`ADMIN` does not, and it is the only profile that can grant `ADMIN`. The rule lives in the
existing `AssignRoleToUserCommand`: never assign `SUPER_ADMIN`, and assign `ADMIN` only when the
actor holds `SUPER_ADMIN`.

**H31. Does the mechanic replenish stock?**
DECIDED: no. The mechanic signals that a part is missing and the administration replenishes it.
The signal is not a notification: a refused withdrawal returns 422 to the mechanic, and the
`List Stock Shortages` read model shows the administration every item blocking a work order in
execution. `inventory:replenish` therefore disappears as a separate permission and folds into
`inventory:manage`, since only the administrator holds both.

**H32. Can a withdrawn part go back to stock?**
DECIDED: yes. A part taken from the shelf that turns out unnecessary is returned while the work
order is still in execution. The return appends a RETURN movement pointing at the consumption it
undoes, rather than editing it, because movements are append only. The withdrawn quantity on the
item becomes the net of withdrawals and returns, which is what the charged total uses, so the
customer is never billed for a part that went back.
After completion the charged total is closed, and a part discovered later is handled with a
stock adjustment by the administrator plus a discount, which are tools that already exist.

**H33. Are groups kept?**
DECIDED: no. `groups`, `user_groups`, `group_roles` and `group_permissions` are removed, together
with the Group aggregate, its commands, queries, controller and the `groups:read` and
`groups:manage` permissions. Roles already give a named bundle of permissions to a set of users,
which is what the workshop needs. Groups add a second grouping level above roles, useful when a
second axis exists such as a branch, a shift or a team, and this workshop has none. The removal
rides along with the identifier retrofit, which rewrites the initial migration anyway, so the
database cost is not creating four tables rather than dropping them.

**H34. Is the service advisor a seller?**
DECIDED: no, and the role is renamed. `SELLER` becomes `SERVICE_ADVISOR`. The role never sold
anything: it receives the customer, opens the work order, negotiates the budget and delivers the
vehicle. There is no counter sale in the system, because a part only leaves stock against a work
order. The rename is cheap now because `MECHANIC`, `SERVICE_ADVISOR` and `CUSTOMER` hold no
permission in the database yet and no code reads that enum member.

**H35. Is there a phone number?**
DECIDED: yes, on the `Customer` aggregate as a `PhoneNumber` value object, next to the address.
The workshop calls the customer to say the vehicle is ready, and that act happens outside the
system, so the number has to live somewhere. E-mail stays on the user record, because it is the
login identity.

**H36. Who can cancel a work order that already consumed parts?**
DECIDED: cancelling from RECEIVED, IN_DIAGNOSIS and AWAITING_APPROVAL needs `work-orders:cancel`,
which the service advisor holds, because nothing has left the shelf yet. Cancelling from
IN_EXECUTION additionally needs `work-orders:cancel-in-execution`, which only an administrator
holds, because parts already withdrawn are written off as a loss.
The check runs inside the handler after the work order is loaded, because the state is only known
then, mirroring how `RevokeSessionHandler` checks `sessions:revoke-any`. The refusal is explicit:
code `WORK_ORDER_CANCEL_IN_EXECUTION_FORBIDDEN`, kind `Forbidden`, HTTP 403, with a message
naming why, so that the person at the counter knows to call the administrator instead of
guessing that the button is broken.

**H37. Can the customer browse the service catalog?**
DECIDED: no. The challenge document places the service CRUD under administrative management, and
the only customer facing requirement is consulting the progress of their own work order.
`services:read` stays with staff. It is a one line grant if the workshop ever wants a public
catalog.

**H38. How are additional repairs authorised?**
DECIDED: on the same work order, through numbered budget rounds. Round one comes from the
diagnosis. Every later round comes from extra work found during execution: the mechanic adds
items to a draft, submits the supplementary budget, and the work order returns to
AWAITING_APPROVAL. Approving it widens the scope and sends the work order back to execution.
Refusing it sends the work order back to execution with the scope approved so far, and the items
of the refused round stay attached to it, never withdrawn and never charged. A part can only be
withdrawn once its own round was approved.
What this added: budget rounds as a numbered collection instead of one snapshot, the round each
item belongs to, one transition out of IN_EXECUTION that used to be forbidden, one command, and
the rule for a refused round.
What this removed: the successor work order, the transfer of stock movements between work orders,
the `TRANSFERRED` movement status, and the whole reason a cancellation had to name another work
order. Extra work no longer cancels anything, so cancellation became a single simple case.

**H39. Where is the work order trail written?**
DECIDED: inside `WorkOrderRepository.save`, in the same transaction that persists the aggregate,
reading the recorded domain events without draining them. The handler keeps publishing those same
events on the bus afterwards, so the budget notification subscriber and the access cache
invalidation keep working untouched.
The trail was a subscriber until revision 9. A subscriber runs after the commit, so a failure
there lost an entry while the fact it described was already saved. Writing it with the aggregate
removes that window without adding a single line to any handler.
Two consequences. `AggregateRoot` gains a read-only `domainEvents` getter next to the existing
`pullDomainEvents`, which keeps draining for the publisher. And every work order domain event has
to carry the acting user, which the trail needed either way.

### Still open

Nothing blocking. One note is worth watching when the code reaches it.

**N1. The trail and the movement history overlap on part withdrawal and on part return.**
Those two acts are the only ones recorded on both sides: a row in `work_order_events` and a row in
`stock_movements`. Everything else is disjoint, since a diagnosis touches only the trail and a
supplier replenishment touches only the movements.

The duplication is intentional, because the two answer different questions from different starting
points. From the work order: what happened here, in order, and who did each step. From the part:
where did the units that left the shelf go. Deriving either from the other would make one module
read the other's tables.

Neither drives a calculation. The amount charged comes from `work_order_parts.withdrawn_quantity`
and the stock count comes from `inventory_items.quantity_on_hand`. Both records are evidence, never
state, so an incomplete one produces an incomplete audit and never a wrong bill or a wrong count.

Since revision 9 both sides are written inside the transaction of their own aggregate, so the way
they used to diverge is closed. What remains is that an administrator's stock adjustment moves the
count with no work order and no trail entry, which is legitimate rather than a divergence. A
reconciliation query comparing `withdrawn_quantity` against the net of consumptions and returns
makes any real mismatch visible with a single read, and is available to add whenever the
administration wants it.

## 15. Architectural implications

**Modules.** Five new modules under `src/modules`, following the existing four-layer folder
layout: `customers`, `vehicles`, `services`, `inventory`, `work-orders`. Three existing modules
are extended: `users` gains the document and the administration endpoints, `authorization` gains
the super administrator role and the escalation rule and loses the whole group feature, and
`authentication` gains the pending password flag in the token and a global logout.

**Aggregates.** Five new aggregate roots following the existing shape: private constructor, a
static creation method recording a domain event, a static `restore` for the mapper, a props
interface, read-only getters, `record()` and `pullDomainEvents()`. `WorkOrder` and
`InventoryItem` have child entities, one of which is append only in each.

**Profiles.** Only Customer becomes an aggregate. The others stay as roles, and the machinery for
roles is already built. Nothing in the plan creates a table whose only content is a foreign key
and a status.

**Identifiers.** The internal key plus external identifier rule applies to every addressable
table, including the ones that already exist. Join tables keep a composite key of internal ids.
The domain carries external identifiers and the foreign keys carry internal ones, so repositories
resolve one into the other at their boundary. The JWT keeps carrying the user's external
identifier, so tokens survive the change.

**Money.** Integer cents in the domain, `bigint` columns in PostgreSQL, cents in the API
payloads. TypeORM returns `bigint` as a string, so every mapper converts explicitly.

**Append only history.** `stock_movements`, `stock_movement_transitions` and `work_order_events` are
never updated in place beyond a movement status, and never deleted. That is what makes the
traceability requirement real rather than a claim.

**Domain events.** Extend `DomainEvent`, recorded by the aggregate, published by the handler with
`eventBus.publishAll(aggregate.pullDomainEvents())`. Subscribers stay in
`application/subscribers`. The work order trail is one of those subscribers, so recording it adds
no new write path to the handlers.

**Policies.** Two shapes appear. The budget notification and the trail are event subscribers,
matching `RefreshTokenReuseSubscriber`. The stock consumption, settlement, transfer and write off
are synchronous cross-context commands, matching `RegisterUserHandler` calling
`AssignRoleToUserCommand`, because they must be able to fail the caller.

**Guards.** One new global guard enforces the pending password flag, registered after
`JwtAuthGuard`, with a decorator marking the two routes it lets through. It is the only new
guard, and it exists because the rule applies to every route rather than to a permission.

**Authorization.** The new capabilities extend the existing permission catalog (`AppPermission`
plus a seed migration) and the existing `@RequirePermissions` decorator. The escalation rule for
`ADMIN` and `SUPER_ADMIN` lives in the existing assignment handler. The customer's own work order
access needs a permission plus an ownership check inside the handler, since a permission alone
cannot express ownership.

**Persistence.** New tables come from hand written SQL migrations, with `CHECK` constraints for
status columns and partial unique indexes filtered by `deleted_at IS NULL`, which is what the
identity schema already does.

**Errors.** Each new rule gets a `DomainError` subclass with a `code` prefixed by its module and a
`kind` from `ErrorKind`. Transition violations and insufficient stock map to `RuleViolation`
(422), duplicated document, email or plate to `Conflict` (409), a request from an account with a
pending password and an attempt to grant a role above one's level to `Forbidden` (403).
