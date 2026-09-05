# Ubiquitous language

The shared vocabulary between the business, product, development, QA and everyone else working on
the workshop domain.

> **Rule:** the terms defined here are the ones to use in the domain model, the code, the APIs,
> the events, the commands, the documentation and the conversation.

## One document per bounded context

| Context                                       | What it bounds                                                             |
| --------------------------------------------- | -------------------------------------------------------------------------- |
| [Identity and Access](identity-and-access.md) | Who exists as a person, how they prove it, and what they may do            |
| [Customer Registry](customer-registry.md)     | Who the workshop serves, and which vehicles belong to whom                 |
| [Service Catalog](service-catalog.md)         | What the workshop sells as labour, at which price and estimated duration   |
| [Inventory](inventory.md)                     | What sits on the shelf, and the traceable history of every unit that moved |
| [Work Order](work-order.md)                   | The life of a work order, from reception to delivery or cancellation       |

Contexts and code modules are not one for one. Identity and Access spans three modules (`users`,
`authentication`, `authorization`) and Customer Registry spans two (`customers`, `vehicles`). The
full mapping is in [the high level design](../architecture/high-level-design.md).

## Terms that shift meaning between contexts

None of these is forbidden. What is forbidden is using one without saying which context you mean.

| Term        | In one context                                                          | In another                                                                       |
| ----------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| **Service** | Catalog: the sellable service, with a list price and estimated duration | Work Order: the service requested on one work order, with the price frozen       |
| **Item**    | Inventory: a part or supply in the catalog                              | Work Order: a line on the order, which may be a service or a part                |
| **Status**  | Inventory: the state of a movement (pending, settled, written off)      | Work Order: the stage of the order (received, in execution, delivered)           |
| **User**    | Identity: the account that signs in                                     | Registry: the customer, which is an account plus workshop data                   |
| **Price**   | Catalog and Inventory: the list price, changed whenever the shop wants  | Work Order: the budgeted price, frozen at generation and immutable from then on  |
| **Cancel**  | Work Order: end the order without delivering                            | Inventory: write off what left and never came back (the right term is write off) |

## Terms rejected everywhere

| Rejected term           | Use instead                         | Why                                                                                                                 |
| ----------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Budget (for the number) | Budgeted total / Charged total      | A budget is the whole round, not the figure. The two totals are different quantities.                               |
| Delete / Erase / Remove | Deactivate                          | Nothing is erased. Every deletion is logical and the record stays for the audit trail.                              |
| Close the work order    | Complete / Deliver                  | "Close" conflates two distinct states: the work is done, and the car left.                                          |
| Stock write-down        | Withdrawal / Adjustment / Write off | Three different operations with different effects; see [Inventory](inventory.md).                                   |
| Part reservation        | Part planning                       | Planning holds no unit. A part only leaves the shelf at withdrawal.                                                 |
| Order / Purchase order  | Work order                          | This system buys nothing from a supplier. The order is for service, not for purchase.                               |
| Login (as a noun)       | Session                             | What exists and lasts is the session; the login is the act that creates it.                                         |
| User group              | Role                                | Groups were removed from the access model ([ADR 0011](../adr/0011-groups-removed-from-the-authorization-model.md)). |

## Language decisions

### 2026-08-30: "Customer" is an aggregate, "mechanic" is not

**Context.** The business has four actors: customer, service advisor, mechanic and administrator.
The question was whether each becomes a concept of its own in the model.

**Decision.** Only Customer becomes an aggregate. Service advisor, mechanic and administrator are
roles on a user account.

**Alternatives considered.** One aggregate per actor; a generic "Staff member" aggregate.

**Why.** Customer carries workshop data of its own (address, phone) and an invariant of its own:
one identity per customer. The other three have no state, behaviour or invariant beyond the access
they hold. Recorded in [ADR 0010](../adr/0010-no-aggregate-for-the-staff-profiles.md).

**Consequence in the language.** A work order points at a `customerId` and at an
`assignedMechanicUserId`. The asymmetry in those names is deliberate and reflects what is modelled
as an aggregate and what is not.

### 2026-08-31: "Budget round", not "revised budget"

**Context.** When the mechanic finds extra work during execution, the agreed figure changes. The
business called it "redoing the budget".

**Decision.** The term is **round**, numbered in sequence. Round one comes out of the diagnosis;
each piece of extra work opens the next round.

**Alternatives considered.** "Revised budget", "addendum", "budget version".

**Why.** "Revise" suggests replacement, which is the opposite of what happens: the approved round
stays in force and the new one covers only what was added. Each round holds its own decision and
its own total. Recorded in [ADR 0018](../adr/0018-numbered-budget-rounds.md).

### 2026-09-01: "Budgeted total" and "charged total" are distinct terms

**Context.** The business said "the value of the work order" for both, and they diverge whenever a
planned part goes unused.

**Decision.** Two terms, never interchangeable. **Budgeted total** is what the customer approved.
**Charged total** is what they pay: approved services plus the parts actually withdrawn, at the
budgeted price, minus the discount.

**Why.** A part that was planned and never withdrawn counts toward the budgeted total and not
toward the charged total. Without two names, that difference turns into an argument at the
counter. Recorded in [ADR 0020](../adr/0020-budget-total-and-charged-total-kept-apart.md).

### 2026-09-04: "Deactivate", never "delete"

**Context.** The removal routes use the HTTP verb `DELETE`, which led the team to say "delete the
customer".

**Decision.** The business term is **deactivate**. `DELETE` stays as the HTTP verb because it is
the correct REST semantics for the intent, but no row is erased.

**Why.** The record stays for the audit trail and for the history of the work orders that
reference it. What changes is the status, and the partial unique indexes free the email, the plate
or the SKU for reuse.

## How the language has evolved

| Date       | Change                                                   | Why                                                        | Impact                                              |
| ---------- | -------------------------------------------------------- | ---------------------------------------------------------- | --------------------------------------------------- |
| 2026-08-30 | "Group" removed from the access vocabulary               | Roles already give the grouping a single workshop needs    | Four tables and one aggregate removed               |
| 2026-08-31 | "Budget round" replaces "revised budget"                 | Rounds add up, revisions replace                           | `budgets` gained a `round` column                   |
| 2026-09-01 | "Charged total" split from "budgeted total"              | The two quantities diverge by construction                 | Two distinct columns on the work order              |
| 2026-09-04 | "Deactivated item" became a reachable state in Inventory | The catalog needed the same lifecycle services already had | New route, new event, new rule when planning a part |

## Consistency checklist

Before a new term counts as part of the ubiquitous language:

- [ ] Does the business use this term?
- [ ] Is the meaning clearly defined?
- [ ] Is another term being used as a synonym?
- [ ] Does the term mean something else in another bounded context?
- [ ] Is the term reflected in the domain model?
- [ ] Is the term reflected in the code?
- [ ] Do the commands use the right term?
- [ ] Do the events use the right term?
- [ ] Do the policies use the right term?
- [ ] Do the APIs and contracts use the right term where it applies?
- [ ] Have the old or ambiguous terms been recorded as rejected?

## The general rule

> **If the business calls it X, the model calls it X.**

The language has to hold across the whole chain:

```text
Business
   ↓
Event storming
   ↓
Domain model
   ↓
Commands
   ↓
Events
   ↓
Policies
   ↓
Code
   ↓
API
   ↓
Documentation
```

Any divergence has to be deliberate and written down.
