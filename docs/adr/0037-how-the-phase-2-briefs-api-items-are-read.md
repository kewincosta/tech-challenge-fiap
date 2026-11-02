# 0037. How the Phase 2 brief's API items are read

**Status**: Accepted
**Source**: AD-021 in `.specs/STATE.md`
**Recorded**: 2026-11-01, from AD-021, taken during the `work-order-phase-2-api` feature

## Context

Page 3 of the Phase 2 brief, "Alterar/criar as seguintes APIs", lists five changes. Three of them
name something the code did not match word for word:

- The opening of a work order should "receber os dados do cliente, veículo, serviços e peças". The
  route took the ids of a customer and a vehicle already registered, and no services or parts.
- The status lookup should "informar a situação atual da OS (Recebida, Diagnóstico, Aguardando
  Aprovação, Execução, Finalizada, Entregue)". The work order routes answered the status as a code
  such as `IN_DIAGNOSIS`.
- The approval of a budget should be an "endpoint para receber notificações externas de aprovação ou
  recusa do orçamento do cliente". The approval and rejection routes were calls from a signed-in
  user, and nothing told the customer that a budget waited.

The user answered on 2026-11-01: "Basta que seja informado os ids dos clientes"; "Podemos apenas
documentar isso [...] e retornar um label em pt/br além do código ou enum"; "Podemos seguir por
enquanto com a lógica de email + link que exige autenticação mesmo que não tenhamos um portal ou
tela".

## Decision

The opening takes the ids of a registered customer and vehicle, plus optional `services` and
`parts`. The routes that register customers and vehicles already take their data, so the opening
does not repeat them. Each service and part becomes a draft item, and one item that cannot be added
refuses the whole opening ([ADR 0034](0034-parts-can-be-planned-at-reception.md)).

The status lookup is the existing work order routes. Every answer that carries a work order
gains `statusLabel` beside `status`, from one map: `Recebida`, `Diagnóstico`, `Aguardando Aprovação`,
`Execução`, `Finalizada`, `Entregue` and `Cancelada`. The brief names six statuses, and `Cancelada`
follows their wording. The domain, the database and the `status` filter of the board keep the code.

The external approval is a pair of links. Every work order answer carries `approvalUrl` and
`rejectionUrl` on the pending budget of a work order that awaits approval, and null on every other
budget:

```
${APP_PUBLIC_URL}/api/v1/work-orders/${number}/budgets/${budgetId}/approval
${APP_PUBLIC_URL}/api/v1/work-orders/${number}/budgets/${budgetId}/rejection
```

The e-mail of a budget awaiting approval carries the same two addresses
([ADR 0036](0036-email-goes-through-a-mailer-port-over-smtp.md)). The customer calls one with `POST`
and their own bearer token. `BudgetDecisionAuthorizer` decides as it does for the round-less routes:
the owning customer or a holder of `work-orders:decide` may use the link, and anyone else gets 404
`WORK_ORDER_NOT_FOUND`. A budget the work order does not hold answers 404
`WORK_ORDER_BUDGET_NOT_FOUND`, and a budget that is no longer pending answers 422
`BUDGET_INVALID_STATE`, whatever the status of the work order. The person who used the link is
recorded as the decider. `APP_PUBLIC_URL` is a required setting, `http://localhost:13000` in
`.env.example`.

`POST /work-orders/:number/budget/approval` and `/rejection` stay as they are. They decide whichever
round is pending.

## Alternatives

A webhook with credentials of its own, such as a shared secret, a signature or a one-time token in
the e-mail, was rejected. The user chose links that need the customer's authentication, so the
customer is the one who decides and the trail records them.

Links to the round-less routes were rejected. They decide whichever round is pending, so an old
e-mail could decide a round the customer never saw. A link that names its budget refuses with 422
once that budget is decided.

Receiving the customer's and the vehicle's data in the opening was rejected. It would duplicate the
registration routes, and the user considers the ids enough.

A page behind the links, and a route that only answers the status, were left out. No front end
exists, and the work order routes already answer the status.

## Consequences

The three readings differ from the brief's wording, and the plan lists each one under "Differences
from the source". The README and the Postman collection say so.

The links are API calls. A mail client that opens one sends GET and gets 404, so the e-mail says to
call the address with POST and the bearer token. A front end that shows the budget and calls the
links is the way to improve this.

A work order canceled while it awaits approval keeps its budget `PENDING`, because the cancellation
leaves the budgets as they are. `approvalUrl` and `rejectionUrl` are null once the work order no
longer awaits approval, a canceled one included, so no answer carries a link that cannot work. An
e-mail sent earlier still holds the links, and calling one answers 422 `WORK_ORDER_INVALID_STATE`.
