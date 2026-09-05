# Ubiquitous language: Work Order

> Part of the [ubiquitous language set](README.md). The terms here apply to the Workshop
> Operations context, implemented in the `work-orders` module.

## 1. Context

**Bounded context:** Work Order (Workshop Operations)

**Description.** Covers the life of one visit of a vehicle to the workshop, from reception to
delivery or cancellation: what was asked for, what was diagnosed, what it costs, who approved it,
which parts left the shelf, what was charged and who did each step. It is the central context of
the system; the other four exist to serve it.

**What is out of scope.** Who the customer is and whose the vehicle is (Customer Registry), the
list price of a service (Service Catalog), the stock count (Inventory) and who may do what
(Identity and Access). A work order keeps a frozen copy of what it needs from those contexts and
never asks them again.

**Who is involved:**

- Service advisor (reception and counter)
- Mechanic (the shop floor)
- Administrator (management)
- Customer (approval and tracking)

## 2. Domain concepts

| Term                  | Definition                                                                                               | Example                              | Notes                                                                          |
| --------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------ |
| **Work order**        | The record of one visit of a vehicle, of what was done and of what was charged                           | The work order for Joana's Corolla   | A vehicle has at most one open work order                                      |
| **Work order number** | The identifier the customer receives and uses to follow along                                            | `A1B090-2026`                        | Drawn, not sequential: it does not reveal the shop's volume                    |
| **Requested service** | A catalog service added to this work order, with the price copied at the moment it was added             | Oil change, R$ 150.99                | The price does not change later, even if the catalog does                      |
| **Planned part**      | A part or supply the mechanic expects to use, with the expected quantity                                 | 2 oil filters                        | Planning takes nothing off the shelf                                           |
| **Budget round**      | A set of items quoted at once, with one total and one customer decision                                  | Round 1, R$ 320.00, approved         | Numbered in sequence. Round one comes out of the diagnosis                     |
| **Draft item**        | A service or part already on the order but not yet attached to a round                                   | A part added during the work         | Counts toward no total until it is quoted                                      |
| **Budgeted total**    | The sum of a round's items, the figure the customer approves                                             | R$ 320.00                            | A service counts once; a part counts price times planned qty                   |
| **Charged total**     | What the customer pays: approved services plus withdrawn parts, at the budgeted price, less the discount | R$ 285.00                            | Frozen at completion. Diverges from the budgeted total when a part goes unused |
| **Discount**          | A reduction of the charged total, with a mandatory reason                                                | R$ 10.00, "courtesy for the delay"   | Never exceeds the charged total                                                |
| **Withdrawal**        | Taking a planned part off the shelf, at the moment it is about to be used                                | Withdraw the 2 filters               | This is where stock goes down, not at planning                                 |
| **Return**            | Putting a withdrawn and unused part back on the shelf                                                    | Return 1 filter                      | Never exceeds what was withdrawn                                               |
| **Assigned mechanic** | The mechanic responsible for executing this work order                                                   | Marcos                               | Can be changed while the order is neither delivered nor cancelled              |
| **Trail**             | The chronological, immutable record of everything that happened to the order                             | 12 entries, from opening to delivery | Written in the same transaction that changes the order                         |

### Work order

**Definition.** The record of one visit: which vehicle, whose, what was asked for, what was
diagnosed, what it costs, what was charged.

**Characteristics:**

- Always opens in **Received**. There is no way to create an order already in another stage
- Keeps a frozen copy of the customer's name and the vehicle's details as of the opening
- Moves between stages only as a consequence of an action; no operation writes a stage
- A vehicle cannot have two open work orders at once

**Relationships:**

- Work order belongs to a Customer
- Work order refers to a Vehicle
- Work order holds Requested services and Planned parts
- Work order holds Budget rounds
- Work order produces Stock movements when parts are withdrawn

**Example:**

> "Open a work order for Joana's Corolla, she is dropping it off today."

### Budget round

**Definition.** A set of items quoted at once, with one total and one customer decision on that
total.

**Characteristics:**

- Numbered in sequence from 1
- Round one comes out of completing the diagnosis and covers everything found there
- A later round covers only the extra work discovered during execution
- Each round carries its own state: pending, approved or rejected
- An approved round stays in force when a later round is rejected

**Relationships:**

- Round belongs to a Work order
- Round groups Requested services and Planned parts
- Round raises Budget generated and, on the decision, Budget approved or Budget rejected

**Example:**

> "He opened the engine and found more. Send round 2 for her to approve."

### Planned part

**Definition.** A part or supply the mechanic expects to use on this order, with the expected
quantity and the price copied from inventory at the moment of planning.

**Characteristics:**

- Planning **neither holds nor removes** a single unit from the shelf
- Carries two quantities: the **planned** one and the **withdrawn** one, which start out different
- Only the part actually withdrawn counts toward the charged total
- A deactivated catalog item cannot be planned

**Example:**

> "Plan two filters on the order; we withdraw them when we assemble."

## 3. Actors

| Actor               | Who they are                                        | Responsibility in the domain                                                                            |
| ------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| **Service advisor** | Works the counter and bridges to the customer       | Opens the order, adds requested services, assigns the mechanic, delivers the vehicle, cancels the order |
| **Mechanic**        | Does the work on the shop floor                     | Starts and completes the diagnosis, plans parts, withdraws and returns parts, completes the order       |
| **Customer**        | The owner of the vehicle                            | Approves or rejects the budget round, follows their own orders                                          |
| **Administrator**   | Answers for the operation                           | Applies discounts, cancels an order in execution, reads metrics and trails                              |
| **System**          | What the application does on its own, with no human | Draws the order number, sums the budget, applies the stage transition, writes the trail                 |

## 4. Commands

| Command                         | Actor                             | What it means                                        | Expected outcome                                        |
| ------------------------------- | --------------------------------- | ---------------------------------------------------- | ------------------------------------------------------- |
| **Open work order**             | Advisor                           | Register the arrival of a vehicle for service        | Order created in Received, with a number of its own     |
| **Start diagnosis**             | Mechanic                          | Begin assessing what the vehicle needs               | Order moves to In diagnosis                             |
| **Add requested service**       | Advisor / Mechanic                | Put a catalog service on the order                   | Draft service item, with the price frozen               |
| **Plan part**                   | Mechanic                          | Anticipate the use of a part, without withdrawing it | Draft part item, with a planned quantity                |
| **Remove item**                 | Advisor / Mechanic                | Take an unquoted service or part off the order       | Item removed; an already quoted item is refused         |
| **Assign mechanic**             | Advisor                           | Say who answers for the execution                    | Assigned mechanic recorded on the order                 |
| **Complete diagnosis**          | Mechanic                          | Close the assessment and generate the budget         | Round 1 generated, order moves to Awaiting approval     |
| **Approve budget**              | Customer / Advisor                | Authorise the work at the figure presented           | Round approved, order moves to In execution             |
| **Reject budget**               | Customer / Advisor                | Refuse the figure presented                          | Round rejected, order returns to the previous stage     |
| **Withdraw parts**              | Mechanic                          | Take the approved parts off the shelf, to use them   | Stock decreased, movement recorded, withdrawn qty added |
| **Return parts**                | Mechanic                          | Put back what was withdrawn and not used             | Stock restored, return movement recorded                |
| **Submit supplementary budget** | Mechanic                          | Quote the extra work found during execution          | New round generated, order returns to Awaiting approval |
| **Complete work order**         | Assigned mechanic / Administrator | Declare the work finished                            | Charged total frozen, order moves to Completed          |
| **Apply discount**              | Administrator                     | Reduce the charged total, with a reason              | Charged total reduced, reason recorded                  |
| **Deliver vehicle**             | Advisor                           | Hand the car back to the customer                    | Order moves to Delivered, stock consumptions settled    |
| **Cancel work order**           | Advisor / Administrator           | End the order without delivering, with a reason      | Order moves to Cancelled, withdrawn parts written off   |

### Complete diagnosis

**Intent.** The mechanic has finished assessing the vehicle and wants to present the cost to the
customer.

**Actor.** Mechanic.

**Preconditions:**

- The order is In diagnosis
- There is at least one item on the order, whether a service or a part

**Outcome:**

- Round 1 is generated, summing every draft item
- The price of each item is frozen into the round
- The order moves to Awaiting approval
- Events: Diagnosis completed, Budget generated, Budget sent

**Note.** The system sums; no part of the command accepts a total. That is what guarantees the
budget is generated automatically from the services and the parts.

### Withdraw parts

**Intent.** The mechanic is about to assemble and needs the parts in hand.

**Actor.** Mechanic.

**Preconditions:**

- The order is In execution
- Every part in the batch belongs to an approved round
- The quantity asked for does not exceed what is left to withdraw of that part
- There is enough stock on the shelf
- No part appears twice in the same batch

**Outcome:**

- Stock decreases by the quantity of each part
- A pending consumption movement is recorded for each part
- The withdrawn quantity of the part on the order goes up
- Event: Part withdrawn

**Note.** The whole batch is validated before anything is taken. If one line fails, no part
leaves. The three writes happen in the same transaction.

## 5. Domain events

| Event                              | What it means                                          | When it happens                                        |
| ---------------------------------- | ------------------------------------------------------ | ------------------------------------------------------ |
| **Work order opened**              | A visit was registered                                 | On opening the order                                   |
| **Diagnosis started**              | The assessment of the vehicle began                    | On starting the diagnosis                              |
| **Service added to work order**    | A catalog service went onto the order                  | On adding a requested service                          |
| **Part planned for work order**    | The use of a part was anticipated                      | On planning a part                                     |
| **Item removed from work order**   | A service or part left the order before being quoted   | On removing an item                                    |
| **Mechanic assigned**              | Responsibility for the execution was assigned          | On assigning the mechanic                              |
| **Diagnosis completed**            | The assessment finished                                | On completing the diagnosis                            |
| **Budget generated**               | A round was summed and closed                          | On completing the diagnosis or submitting a supplement |
| **Budget sent**                    | The round became available for the customer's decision | Together with Budget generated                         |
| **Budget approved**                | The customer authorised the work at the round's figure | On approving the budget                                |
| **Budget rejected**                | The customer refused the round's figure                | On rejecting the budget                                |
| **Supplementary budget generated** | Extra work was quoted in a new round                   | On submitting a supplementary budget                   |
| **Execution started**              | The authorised work began                              | On the first budget approval                           |
| **Part withdrawn**                 | Parts left the shelf for this order                    | On withdrawing parts                                   |
| **Part returned**                  | Parts went back on the shelf                           | On returning parts                                     |
| **Discount applied**               | A reduction was granted on the charged total           | On applying a discount                                 |
| **Work order completed**           | The work finished and the charged total was frozen     | On completing the order                                |
| **Vehicle delivered**              | The car went back to the customer                      | On delivering the vehicle                              |
| **Work order cancelled**           | The order ended without a delivery                     | On cancelling the order                                |

### Budget sent

**Definition.** The budget round became available for the customer's decision.

**When it happens.** Always alongside Budget generated, whether at the completion of the diagnosis
or at the submission of a supplementary budget.

**Relevant data:**

- Work order identifier
- Actor who generated the round
- Moment it was sent

**An important caveat.** "Sent" describes the budget becoming available to the customer, who reads
it and decides through the API. No outbound channel starts here: there is no email, push or
webhook in this system. When a channel is added, it consumes this event, which is already
recorded.

## 6. Policies and business rules

| Rule                                             | Description                                                                               |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| One vehicle, one open order                      | A vehicle cannot have two orders in flight at the same time                               |
| An inactive customer opens no order              | A deactivated customer gets no new order, though the old ones stay valid                  |
| The diagnosis does not complete empty            | Completing the diagnosis requires at least one item on the order                          |
| The system sums, nobody supplies the total       | No command accepts a budget figure; the total is summed inside the aggregate              |
| The budgeted price is frozen                     | An item's price enters the round and never changes, even if the catalog or the shelf does |
| A quoted item cannot be removed                  | Once attached to a round, the item stays on the order                                     |
| A withdrawal never exceeds the plan              | The sum of withdrawals of a part never exceeds the planned quantity                       |
| A return never exceeds the withdrawal            | The sum of returns never exceeds what was withdrawn                                       |
| Only a part on an approved round is withdrawable | A draft part, or one on a rejected round, does not leave the shelf                        |
| What is charged is what was withdrawn            | A part planned and never withdrawn does not count toward the charged total                |
| A discount requires a reason                     | The discount has a mandatory reason and never exceeds the charged total                   |
| Cancelling in execution is elevated              | Cancelling an order that already withdrew parts requires a permission of its own          |
| Delivery and cancellation are terminal           | There is no way out of Delivered or Cancelled                                             |
| The trail is immutable                           | No trail entry is altered or erased                                                       |

### The system sums, nobody supplies the total

**When:** the diagnosis is completed or a supplementary budget is submitted.

**Then:** the round's total is computed inside the work order, summing each service's price once
and each part's price times the planned quantity.

**Example:**

> "Oil change at R$ 150.99 plus two filters at R$ 45.00 makes R$ 240.99. Nobody typed that number;
> it is the sum of the items."

### What is charged is what was withdrawn

**When:** the work order is completed.

**Then:** the charged total sums the services of the approved rounds and, for each part, the
budgeted price times the quantity actually withdrawn.

**Example:**

> "Planned two filters, used one and returned the other. The budget said R$ 240.99; the invoice
> comes out at R$ 195.99."

## 7. Work order stages

| Stage                 | What it means                                           | Entered by                            | Left by                             |
| --------------------- | ------------------------------------------------------- | ------------------------------------- | ----------------------------------- |
| **Received**          | The vehicle arrived and the visit was registered        | Open work order                       | Start diagnosis, Cancel             |
| **In diagnosis**      | The mechanic is assessing what the vehicle needs        | Start diagnosis, Reject round 1       | Complete diagnosis, Cancel          |
| **Awaiting approval** | The budget is with the customer, waiting for a decision | Complete diagnosis, Submit supplement | Approve, Reject, Cancel             |
| **In execution**      | The authorised work is under way                        | Approve budget                        | Complete, Submit supplement, Cancel |
| **Completed**         | The work finished and the figure is settled             | Complete work order                   | Deliver                             |
| **Delivered**         | The car went back to the customer. Terminal             | Deliver vehicle                       | -                                   |
| **Cancelled**         | The order ended without a delivery. Terminal            | Cancel work order                     | -                                   |

### Stage flow

```text
Received
   │
   │ start diagnosis
   ▼
In diagnosis ◄───────────────┐
   │                         │
   │ complete diagnosis      │ customer rejects round 1
   ▼                         │
Awaiting approval ───────────┘
   │        ▲
   │        │ submit supplementary budget
   │        │ (and if the customer rejects the later round:
   │        │  back to In execution, not to here)
   │        │
   │ customer approves
   ▼        │
In execution┘
   │
   │ complete
   ▼
Completed
   │
   │ deliver
   ▼
Delivered  (terminal)

From Received, In diagnosis, Awaiting approval or In execution:
   │
   │ cancel (in execution requires an elevated permission)
   ▼
Cancelled  (terminal)
```

**The detail that catches people.** A rejection does not always land in the same place. Rejecting
round 1 returns the order to In diagnosis, because nothing has been authorised yet. Rejecting a
later round returns it to In execution, because the previous round is still approved and its work
still stands.

## 8. Aggregate

### Aggregate: Work order

**Responsibility.** Hold everything a visit produces, and guarantee that no transition, sum or
withdrawal happens outside the rules.

**Root.** Work order.

**Internal entities.** Requested service, Planned part, Budget round. None exists outside the
order that created it, and none is addressable on its own.

**Behaviours:**

- Open, start and complete the diagnosis
- Add and remove requested services and planned parts
- Generate budget rounds and take the customer's decision
- Record part withdrawals and returns
- Complete, apply a discount, deliver, cancel
- Assign the responsible mechanic

**Invariants:**

- The stage changes only through the transitions the flow allows
- A round's total is always the sum of the items it groups
- The withdrawn quantity of a part never exceeds the planned one
- The returned quantity never exceeds the withdrawn one
- The discount never exceeds the charged total
- An item already attached to a round cannot be removed
- A vehicle does not have two open orders

**What stays outside the aggregate.** The stock count, which belongs to the Inventory item.
Withdrawing a part is an operation that crosses both aggregates in one transaction: the order
records the withdrawal, Inventory decreases the count, and if either side fails both fail.

## 9. How the concepts relate

```text
Work order
    │
    ├── belongs to ──> Customer          (Customer Registry context)
    ├── refers to ───> Vehicle           (Customer Registry context)
    ├── assigns ─────> Mechanic          (a role, Identity and Access context)
    │
    ├── holds ──> Requested service ──> copy of ──> Catalog service
    ├── holds ──> Planned part ───────> refers to ──> Inventory item
    ├── holds ──> Budget round ───────> groups ──> Requested service and Planned part
    ├── holds ──> Trail
    │
    └── produces ──> Stock movement      (Inventory context, on withdrawal and return)
```

| From              | Relation   | To              | Description                                                               |
| ----------------- | ---------- | --------------- | ------------------------------------------------------------------------- |
| Work order        | belongs to | Customer        | Holds the identifier and a copy of the name as of the opening             |
| Work order        | refers to  | Vehicle         | Holds a copy of the plate, make, model and year                           |
| Requested service | copy of    | Catalog service | Copies the name and price; the copy does not change when the catalog does |
| Planned part      | refers to  | Inventory item  | Copies the SKU, name and price; the count stays with Inventory            |
| Budget round      | groups     | Order items     | An item belongs to at most one round                                      |
| Work order        | produces   | Stock movement  | One consumption per part withdrawn, one return per part returned          |

## 10. Domain vocabulary and technical vocabulary

| Domain (business)  | Technical (code)                                                | Note                                                     |
| ------------------ | --------------------------------------------------------------- | -------------------------------------------------------- |
| Work order         | `WorkOrder`, `/work-orders`                                     | -                                                        |
| Work order number  | `WorkOrderNumber`, `number`                                     | Format `AAAAAA-YYYY`                                     |
| Stage              | `WorkOrderStatus`, `status`                                     | The business says stage; the code says status            |
| Received           | `RECEIVED`                                                      | -                                                        |
| In diagnosis       | `IN_DIAGNOSIS`                                                  | -                                                        |
| Awaiting approval  | `AWAITING_APPROVAL`                                             | -                                                        |
| In execution       | `IN_EXECUTION`                                                  | -                                                        |
| Completed          | `COMPLETED`                                                     | -                                                        |
| Delivered          | `DELIVERED`                                                     | -                                                        |
| Cancelled          | `CANCELED`                                                      | Spelled with one L in the code, matching the enum        |
| Requested service  | `WorkOrderServiceItem`, `serviceItems`                          | -                                                        |
| Planned part       | `WorkOrderPartItem`, `partItems`                                | -                                                        |
| Planned quantity   | `plannedQuantity`                                               | -                                                        |
| Withdrawn quantity | `withdrawnQuantity`                                             | -                                                        |
| Budget round       | `Budget`, `round`                                               | `Budget` is the round, not the total                     |
| Pending round      | `BudgetStatus.Pending`                                          | -                                                        |
| Budgeted total     | `Budget.totalCents`                                             | Integer cents                                            |
| Charged total      | `chargedTotalCents`                                             | Integer cents. Null before completion                    |
| Discount           | `discountCents`, `discountNote`                                 | -                                                        |
| Draft item         | `isDraft`, `budgetRound === null`                               | There is no "draft" column: it is the item with no round |
| Assigned mechanic  | `assignedMechanicUserId`                                        | Points at the user account, not at a Mechanic aggregate  |
| Trail              | `work_order_events`, `GET /work-orders/:number/trail`           | -                                                        |
| Withdraw parts     | `WithdrawPartsCommand`, `POST /work-orders/:number/withdrawals` | -                                                        |
| Return parts       | `ReturnPartsCommand`, `POST /work-orders/:number/returns`       | -                                                        |
| Complete           | `CompleteWorkOrderCommand`                                      | Not to be confused with deliver                          |
| Deliver            | `DeliverVehicleCommand`                                         | -                                                        |

## 11. Phrases from the domain

> "Open a work order for Joana's Corolla."

> "The order is awaiting approval, I already sent her the budget."

> "She rejected round 1, so it goes back to diagnosis and we redo it."

> "He found more inside the engine. Submit a supplement."

> "Planned two filters, withdrew one. Charge for one."

> "The budgeted total was R$ 320, the charged one came out at R$ 285 because a part went unused."

> "You cannot cancel that one: it is already in execution and parts have left. Call the administrator."

> "It was completed yesterday, but the customer only picks it up tomorrow. It is not delivered yet."

## 12. Example flow

### Flow: from reception to delivery

```text
AT: Advisor   | CMD: Open work order        | EV: Work order opened            | POL: one vehicle, one open order
AT: Mechanic  | CMD: Start diagnosis        | EV: Diagnosis started
AT: Advisor   | CMD: Add requested service  | EV: Service added to work order
AT: Mechanic  | CMD: Plan part              | EV: Part planned for work order  | POL: planning moves no stock
AT: Mechanic  | CMD: Complete diagnosis     | EV: Diagnosis completed,
                                                  Budget generated,
                                                  Budget sent                  | POL: the system sums the total
AT: Customer  | CMD: Approve budget         | EV: Budget approved,
                                                  Execution started
AT: Mechanic  | CMD: Withdraw parts         | EV: Part withdrawn               | POL: only a part on an approved round
AT: Mechanic  | CMD: Return parts           | EV: Part returned                | POL: never exceeds the withdrawal
AT: Mechanic  | CMD: Complete work order    | EV: Work order completed         | POL: charge what was withdrawn
AT: Admin     | CMD: Apply discount         | EV: Discount applied             | POL: a reason is mandatory
AT: Advisor   | CMD: Deliver vehicle        | EV: Vehicle delivered            | POL: settles the consumptions
```

**Rules of the flow:**

1. No stage is written directly; each one follows from the preceding command
2. The budget only exists once there is at least one item on the order
3. A part leaves the shelf between approval and completion, never before
4. The figure the customer approves and the figure they pay are distinct quantities
5. Every step above writes a trail entry, in the same transaction that changes the order
