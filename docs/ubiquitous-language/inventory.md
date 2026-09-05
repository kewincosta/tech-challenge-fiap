# Ubiquitous language: Inventory

> Part of the [ubiquitous language set](README.md). The terms here apply to the Inventory context,
> implemented in the `inventory` module.

## 1. Context

**Bounded context:** Inventory

**Description.** Covers what the workshop keeps on the shelf, how much of each thing is left, and
the traceable history of every unit that came in or went out. It owns the count: no other context
writes a quantity.

**What is out of scope.** Supplier purchasing, inbound invoices and average costing. A
replenishment records that units arrived, without knowing where from or against which order.

**Who is involved:**

- Administrator (catalog, replenishment, adjustment)
- Mechanic (withdrawal and return, always through a work order)
- Service advisor (availability lookups)

## 2. Domain concepts

| Term                        | Definition                                                                                  | Example                      | Notes                                                     |
| --------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------- | --------------------------------------------------------- |
| **Inventory item**          | A part or supply the workshop keeps, with a list price and a count of its own               | Oil filter, SKU `FLT-OL-001` | Covers both kinds; "part" alone is narrower               |
| **Part**                    | An item fitted to the vehicle, counted by unit                                              | Brake pad                    | Kind `PART`                                               |
| **Supply**                  | A consumable used during the service, counted by unit of measure                            | 5W30 oil, shop rags          | Kind `SUPPLY`                                             |
| **SKU**                     | The code by which the workshop identifies the item on the shelf                             | `PST-FR-001`                 | Unique among active items. Freed again on deactivation    |
| **Quantity on hand**        | How much physically sits on the shelf right now                                             | 26 units                     | Never negative. Only a movement changes it                |
| **Movement**                | The record of a unit that came in or went out, and why                                      | Inbound of 30 filters        | Append-only: never erased, never rewritten                |
| **Inbound**                 | A movement that raises the count because units arrived                                      | Receipt against invoice 4471 | Kind `INBOUND`                                            |
| **Consumption**             | A movement that lowers the count because units went to a work order                         | 2 filters for order A1B090   | Kind `CONSUMPTION`. Starts out pending                    |
| **Return**                  | A movement that raises the count because units came back from a work order                  | 1 filter returned            | Kind `RETURN`. Points at the consumption it undoes        |
| **Adjustment**              | A movement that lowers the count for loss, damage or a stocktake correction                 | 4 units damaged              | Kind `ADJUSTMENT`. A reason is mandatory                  |
| **Pending consumption**     | A consumption whose work order has not finished; the unit left, but its fate is not settled | -                            | Status `PENDING`                                          |
| **Settled consumption**     | A consumption on a delivered order: the unit was used and the case is closed                | -                            | Status `SETTLED`                                          |
| **Written off consumption** | A consumption on a cancelled order: the unit left and is not coming back                    | -                            | Status `WRITTEN_OFF`                                      |
| **Shortage**                | The state where demand from orders in execution exceeds what is on the shelf                | Needs 8, has 5               | A read-time calculation, not a stored state               |
| **Deactivated item**        | An item taken out of the catalog, whose record and history remain                           | -                            | Disappears from the listing, still readable by identifier |

### Inventory item

**Definition.** A part or supply the workshop keeps, with a SKU, a list price and a count of its
own.

**Characteristics:**

- Starts with a quantity on hand of zero. Having stock requires an inbound
- The list price can be changed at any time and applies to later planning
- The count is never written directly: only a movement changes it
- The count never goes negative; the attempt is refused rather than clamped
- Being deactivated neither zeroes nor hides the count

**Relationships:**

- Inventory item holds Movements
- Inventory item is referenced by Planned part (Work Order context)

**Example:**

> "Register the filter in the catalog and take in thirty."

### Movement

**Definition.** The record of a unit that entered or left the shelf, with the reason, the actor
and the moment.

**Characteristics:**

- Four kinds: inbound, consumption, return and adjustment
- Append-only: no movement is erased, and none is rewritten beyond a consumption's status
- Consumption and return carry the work order that caused them; inbound and adjustment do not
- A return points explicitly at the consumption it undoes

**Relationships:**

- Movement belongs to an Inventory item
- Consumption and Return refer to a Work order
- Return undoes a Consumption

**Example:**

> "Look at the filter's history: inbound of thirty, consumption of two by order A1B090, return of one."

## 3. Actors

| Actor             | Who they are                           | Responsibility in the domain                                         |
| ----------------- | -------------------------------------- | -------------------------------------------------------------------- |
| **Administrator** | Answers for the catalog and the buying | Registers and updates items, takes stock in, adjusts, deactivates    |
| **Mechanic**      | Does the work                          | Withdraws and returns parts, always through a work order             |
| **Advisor**       | Serves the customer                    | Looks up availability and shortages                                  |
| **System**        | What the application does on its own   | Settles consumptions on delivery and writes them off on cancellation |

## 4. Commands

| Command                    | Actor                     | What it means                                                | Expected outcome                                         |
| -------------------------- | ------------------------- | ------------------------------------------------------------ | -------------------------------------------------------- |
| **Register item**          | Administrator             | Put a part or supply in the catalog                          | Active item, with a quantity on hand of zero             |
| **Update item**            | Administrator             | Correct the name, description or list price                  | Fields changed; the count does not move                  |
| **Take stock in**          | Administrator             | Record the arrival of units                                  | Count goes up, inbound movement recorded                 |
| **Adjust down**            | Administrator             | Record loss, damage or a stocktake correction                | Count goes down, adjustment movement with a reason       |
| **Deactivate item**        | Administrator             | Take the item out of the catalog, keeping record and history | Item inactive; refused if an open order plans it         |
| **Consume batch**          | System (through an order) | Take down the parts a work order withdrew                    | Count goes down, one pending consumption per part        |
| **Restore batch**          | System (through an order) | Put back the parts a work order returned                     | Count goes up, a return pointing at the consumption      |
| **Settle consumptions**    | System (on delivery)      | Close the pending consumptions of a delivered order          | Consumptions become settled; the count does not move     |
| **Write off consumptions** | System (on cancellation)  | Close as loss the consumptions of a cancelled order          | Consumptions become written off; the count does not move |

### Deactivate item

**Intent.** The administrator wants to take an item the workshop stopped carrying out of the
catalog.

**Actor.** Administrator.

**Preconditions:**

- The item exists
- No work order that planned this item is still open, meaning neither delivered nor cancelled

**Outcome:**

- The item becomes inactive and disappears from the catalog listing
- The record, the count and the whole movement history remain
- The SKU becomes available again for a new item
- Event: Item deactivated

**Note.** Deactivating is not erasing, and it does not move the count: the units are still on the
shelf. From then on the item cannot be planned on an order.

### Adjust down

**Intent.** The system count does not match the shelf, or units were lost.

**Actor.** Administrator.

**Preconditions:**

- A reason is given
- The quantity to adjust does not exceed the quantity on hand

**Outcome:**

- The count goes down
- An adjustment movement is recorded with the reason
- Event: Stock adjusted

## 5. Domain events

| Event                 | What it means                               | When it happens         |
| --------------------- | ------------------------------------------- | ----------------------- |
| **Item registered**   | A part or supply entered the catalog        | On registering an item  |
| **Item updated**      | Name, description or list price changed     | On updating an item     |
| **Item deactivated**  | An item left the catalog, its record kept   | On deactivating an item |
| **Stock replenished** | Units arrived and the count went up         | On taking stock in      |
| **Stock adjusted**    | Units left for loss, damage or a correction | On adjusting down       |

## 6. Policies and business rules

| Rule                                 | Description                                                                |
| ------------------------------------ | -------------------------------------------------------------------------- |
| Only a movement moves the count      | No operation writes the quantity on hand directly                          |
| The count never goes negative        | An operation that would take it below zero is refused                      |
| A SKU is unique among active items   | Two active items do not share a SKU; a deactivated one frees its own       |
| An adjustment requires a reason      | Unlike an inbound, an adjustment has a mandatory reason                    |
| The history is append-only           | No movement is erased; only a consumption's status evolves                 |
| The write-down happens at withdrawal | Stock goes down when the part leaves for the order, not when it is planned |
| A planned item cannot be deactivated | While an open order plans the item, it does not leave the catalog          |
| A deactivated item cannot be planned | An item out of the catalog does not go onto a new order                    |
| A batch is all or nothing            | If one line of the batch fails, no unit moves                              |

### The write-down happens at withdrawal

**When:** the mechanic withdraws a planned and approved part.

**Then:** the count goes down at that moment and a pending consumption is recorded.

**Example:**

> "He planned two filters yesterday, but they stayed on the shelf. They only left when he went to
> assemble this morning."

**Why it works that way.** Planning holds no unit. If the count went down at planning, an order
awaiting approval for three days would take parts out of circulation without having been
authorised.

### A planned item cannot be deactivated

**When:** the administrator tries to deactivate an item that some order, neither delivered nor
cancelled, has planned.

**Then:** the operation is refused, and the refusal names the orders holding the item.

**Example:**

> "You cannot take the brake pad out of the catalog: order C7D410 is still going to use it.
> Deliver or cancel that one first."

## 7. Movement statuses

Only a consumption carries a status. Inbound, return and adjustment come into being as plain facts
and stay that way.

| Status          | What it means                                                  | Entered by                | Left by                               |
| --------------- | -------------------------------------------------------------- | ------------------------- | ------------------------------------- |
| **Pending**     | The unit left for an order that has not finished               | Part withdrawal           | Delivery or cancellation of the order |
| **Settled**     | The order was delivered: the unit was used, the case is closed | Delivery of the order     | Terminal                              |
| **Written off** | The order was cancelled: the unit left and is not coming back  | Cancellation of the order | Terminal                              |

```text
Consumption recorded
       │
       ▼
    Pending
     │     │
     │     │ order delivered
     │     ▼
     │  Settled  (terminal)
     │
     │ order cancelled, with a balance still outstanding
     ▼
  Written off  (terminal)
```

Neither settling nor writing off touches the quantity on hand: the units already left at
withdrawal. What changes is what the history says about them.

## 8. Aggregate

### Aggregate: Inventory item

**Responsibility.** Be the single source of the count for a part or supply, and guarantee that
every change goes through a recorded movement.

**Root.** Inventory item.

**Internal entity.** Movement.

**Behaviours:**

- Register, update and deactivate
- Replenish, adjust down, consume and restore units

**Invariants:**

- The quantity on hand is never negative
- Every change to the count has a corresponding movement
- An adjustment carries a reason
- A SKU is unique among active items

**A modelling detail.** When loaded, the item does not bring its earlier movements: the full
history is a read model, not part of the aggregate. What the item carries are the movements
created in the current operation, which the repository writes alongside it.

## 9. How the concepts relate

```text
Inventory item
    │
    ├── holds ──> Movement
    │                 │
    │                 ├── Inbound        (raises the count)
    │                 ├── Consumption ───> refers to ──> Work order
    │                 ├── Return ────────> undoes ──> Consumption
    │                 └── Adjustment     (lowers the count)
    │
    └── is referenced by ──> Planned part   (Work Order context)
```

| From           | Relation  | To             | Description                                                    |
| -------------- | --------- | -------------- | -------------------------------------------------------------- |
| Inventory item | holds     | Movement       | Append-only history, in chronological order                    |
| Consumption    | refers to | Work order     | Records which order took the units                             |
| Return         | undoes    | Consumption    | Points at the specific consumption being reversed              |
| Planned part   | refers to | Inventory item | Copies the SKU, name and price; the count stays with Inventory |

## 10. Domain vocabulary and technical vocabulary

| Domain (business) | Technical (code)                                                    | Note                                               |
| ----------------- | ------------------------------------------------------------------- | -------------------------------------------------- |
| Inventory item    | `InventoryItem`, `/inventory-items`                                 | -                                                  |
| Part              | `InventoryItemKind.Part` (`PART`)                                   | -                                                  |
| Supply            | `InventoryItemKind.Supply` (`SUPPLY`)                               | -                                                  |
| SKU               | `Sku`, `sku`                                                        | -                                                  |
| Quantity on hand  | `StockQuantity`, `quantityOnHand`                                   | -                                                  |
| Movement          | `StockMovement`, `GET /inventory-items/:id/movements`               | -                                                  |
| Inbound           | `StockMovementKind.Inbound` (`INBOUND`)                             | -                                                  |
| Consumption       | `StockMovementKind.Consumption`                                     | -                                                  |
| Return            | `StockMovementKind.Return`                                          | -                                                  |
| Adjustment        | `StockMovementKind.Adjustment`                                      | -                                                  |
| Pending           | `StockMovementStatus.Pending`                                       | -                                                  |
| Settled           | `StockMovementStatus.Settled`                                       | -                                                  |
| Written off       | `StockMovementStatus.WrittenOff`                                    | -                                                  |
| Take stock in     | `ReplenishStockCommand`, `POST /inventory-items/:id/replenishments` | -                                                  |
| Adjust down       | `AdjustStockCommand`, `POST /inventory-items/:id/adjustments`       | -                                                  |
| Shortage          | `StockShortage`, `GET /inventory-items/shortages`                   | A read-time calculation, with no column of its own |
| Deactivate item   | `DeactivateInventoryItemCommand`, `DELETE`                          | The HTTP verb is `DELETE`; nothing is erased       |

## 11. Terms rejected in this context

| Rejected term        | Use instead                         | Why                                                                      |
| -------------------- | ----------------------------------- | ------------------------------------------------------------------------ |
| Reserve a part       | Plan a part                         | Planning holds no unit; the part stays available to another order        |
| Write-down (generic) | Withdrawal, Adjustment or Write off | Three operations with distinct effects; the generic word says which none |
| Balance              | Quantity on hand                    | "Balance" suggests a financial figure; this is a physical count          |
| Reverse              | Return                              | Reversal is financial vocabulary; here the unit physically comes back    |
| Delete item          | Deactivate item                     | Nothing is erased; the history has to stay readable                      |

## 12. Phrases from the domain

> "Take in thirty filters, the invoice arrived."

> "Adjust four down, they came in damaged."

> "That item is short: the orders in execution ask for eight and the shelf has five."

> "The part left the shelf when he went to assemble, not when he planned it."

> "The consumption is pending because the order has not been delivered."

> "The order was cancelled and the part had already left. Write it off as a loss."

## 13. Example flow

### Flow: from receipt to settlement

```text
AT: Administrator | CMD: Register item      | EV: Item registered   | POL: starts with a count of zero
AT: Administrator | CMD: Take stock in      | EV: Stock replenished | POL: only a movement moves the count
AT: Mechanic      | CMD: Withdraw parts (order) | EV: Part withdrawn | POL: the write-down happens at withdrawal
                                            | Pending consumption recorded
AT: Mechanic      | CMD: Return parts (order)   | EV: Part returned  | POL: never exceeds the withdrawal
                                            | Return points at the consumption
AT: Advisor       | CMD: Deliver vehicle    | EV: Vehicle delivered
                    System: settle consumptions                     | POL: the count does not move
```

**Rules of the flow:**

1. The count only moves at the inbound, withdrawal, return and adjustment steps
2. Settlement and write-off close the history without touching the count
3. Every movement records who caused it and when
4. Nothing that was recorded is erased afterwards
