# 0034. Parts can be planned at reception

**Status**: Accepted
**Source**: AD-018 in `.specs/STATE.md`
**Recorded**: 2026-11-01, from AD-018, taken during the `work-order-phase-2-api` feature

## Context

A work order took a part only in `IN_DIAGNOSIS` and `IN_EXECUTION`. `PART_PLANNABLE_STATES` in
`work-order.ts` held those two states, on the reasoning that the mechanic identifies the parts
during the diagnosis, the sequence [0014](0014-stock-consumed-at-withdrawal.md) describes. Services
were already open to `RECEIVED`.

A customer who arrives asking for a specific replacement, such as new brake pads, could not have the
request recorded at reception. The Phase 2 brief also asks the opening of a work order to receive
the services and the parts. On 2026-11-01 the user decided to relax the rule: "podemos flexibilizar
para permitir que o cliente opte por trocar peças mesmo sem diagnostico".

## Decision

`WorkOrder.planPart` accepts `RECEIVED` too. `PART_PLANNABLE_STATES` is now
`[RECEIVED, IN_DIAGNOSIS, IN_EXECUTION]`, the set `addService` and `removeItem` already allow.

A part planned at reception is a draft item like any other. It belongs to no budget round, moves no
stock and can be removed. The diagnosis keeps it, removes it or adds items around it, and the budget
generated when the diagnosis completes is what the customer approves. A part leaves the shelf only
from an approved round, as before.

`POST /work-orders/:number/parts` and the opening call, `POST /work-orders` with `services` and
`parts`, apply the same rule. The opening calls `addService` and `planPart` on the new aggregate
before saving it, so one item that cannot be added refuses the whole opening and creates no work
order.

## Alternatives

A separate kind of requested part, with a table of its own, was rejected. The customer's choice
belongs in the flow that already edits items, and the diagnosis already removes what it does not
confirm.

Keeping the rule and taking only services at the opening was rejected. A request for a specific part
would have nowhere to go until the diagnosis starts.

## Consequences

The three item rules share one set of states. The unit and end-to-end cases that expected a part
refused at `RECEIVED` now expect it planned, and the refusal stays covered for a state outside the
set, `COMPLETED`.

Inventory behaves as before. An item planned on a work order that is not closed already blocks the
item's deactivation, with or without a budget, and the shortage report counts only approved rounds of
work orders in execution.
