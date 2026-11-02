# 0037. How the Phase 2 brief's API items are read

**Status**: Accepted
**Source**: AD-021 in `.specs/STATE.md`
**Recorded**: 2026-11-01, from AD-021, taken during the `work-order-phase-2-api` feature. The link
hash and the listing were added on 2026-11-02, after the feature's verification

## Context

Page 3 of the Phase 2 brief, "Alterar/criar as seguintes APIs", lists five changes. Four of them
name something the code did not match word for word:

- The opening of a work order should "receber os dados do cliente, veículo, serviços e peças". The
  route took the ids of a customer and a vehicle already registered, and no services or parts.
- The status lookup should "informar a situação atual da OS (Recebida, Diagnóstico, Aguardando
  Aprovação, Execução, Finalizada, Entregue)". The work order routes answered the status as a code
  such as `IN_DIAGNOSIS`.
- The approval of a budget should be an "endpoint para receber notificações externas de aprovação ou
  recusa do orçamento do cliente". The approval and rejection routes were calls from a signed-in
  user, and nothing told the customer that a budget waited.
- The listing should "Excluir (lógica não física) da listagem as OS finalizadas e entregues". The
  board listed every work order, the completed, delivered and canceled ones among the work in
  progress.

The user answered on 2026-11-01: "Basta que seja informado os ids dos clientes"; "Podemos apenas
documentar isso [...] e retornar um label em pt/br além do código ou enum"; "Podemos seguir por
enquanto com a lógica de email + link que exige autenticação mesmo que não tenhamos um portal ou
tela"; "permitir que o usuário utlize filtros para mudar o comportamento". On 2026-11-02 the
verification showed that the link in an old e-mail could approve a round 1 generated again with a
new total, and the user answered "O link pode ser unico com algum hash".

## Decision

The opening takes the ids of a registered customer and vehicle, plus optional `services` and
`parts`. The routes that register customers and vehicles already take their data, so the opening
does not repeat them. Each service and part becomes a draft item, and one item that cannot be added
refuses the whole opening ([ADR 0034](0034-parts-can-be-planned-at-reception.md)).

The status lookup is the existing work order routes. Every answer that carries a work order
gains `statusLabel` beside `status`, from one map: `Recebida`, `Diagnóstico`, `Aguardando Aprovação`,
`Execução`, `Finalizada`, `Entregue` and `Cancelada`. The brief names six statuses, and `Cancelada`
follows their wording. The domain, the database and the `status` filter of the board keep the code.

The listing is `GET /work-orders` ([ADR 0035](0035-paginated-listings-answer-a-page-envelope.md)).
With no `status` it leaves the completed, delivered and canceled work orders out, as the brief asks,
and lists the work still open. A `status` filter still lists them on request, in the same order with
those three after the open ones.

The external approval is a pair of links. Every work order answer carries `approvalUrl` and
`rejectionUrl` on the pending budget of a work order that awaits approval, and null on every other
budget:

```
${APP_PUBLIC_URL}/api/v1/work-orders/${number}/budgets/${budgetId}/approval?link=${linkHash}
${APP_PUBLIC_URL}/api/v1/work-orders/${number}/budgets/${budgetId}/rejection?link=${linkHash}
```

`linkHash` is the first 32 hexadecimal characters of the SHA-256 of
`${budgetId}:${generatedAt in epoch milliseconds}`. A rejected round 1 is generated again under the
same id with a new `generatedAt`, so the hash changes with every generation of a round. `link` is a
required query parameter, and a call without it answers 400 `VALIDATION_ERROR`.
`HttpBudgetDecisionLinks` computes the hash in one place, for the work order answer and for the
e-mail, and compares it for the use cases through the `BudgetLinkVerifier` port.

The e-mail of a budget awaiting approval carries the same two addresses
([ADR 0036](0036-email-goes-through-a-mailer-port-over-smtp.md)). The customer calls one with `POST`
and their own bearer token. `BudgetDecisionAuthorizer` decides as it does for the round-less routes:
the owning customer or a holder of `work-orders:decide` may use the link, and anyone else gets 404
`WORK_ORDER_NOT_FOUND`. A budget the work order does not hold answers 404
`WORK_ORDER_BUDGET_NOT_FOUND`. The approval and rejection use cases then recompute the hash from the
budget's current `generatedAt` and compare it with the request's in constant time. When the two
differ they answer 422 `WORK_ORDER_BUDGET_LINK_OUTDATED` and change nothing. A budget that is no
longer pending answers 422 `BUDGET_INVALID_STATE`, whatever the status of the work order. The person
who used the link is recorded as the decider. `APP_PUBLIC_URL` is a required setting,
`http://localhost:13000` in `.env.example`.

`POST /work-orders/:number/budget/approval` and `/rejection` stay as they are. They decide whichever
round is pending.

## Alternatives

A webhook with credentials of its own, such as a shared secret, a signature or a one-time token in
the e-mail, was rejected. The user chose links that need the customer's authentication, so the
customer is the one who decides and the trail records them.

Links to the round-less routes were rejected. They decide whichever round is pending, so an old
e-mail could decide a round the customer never saw. A link that names its budget refuses with 422
once that budget is decided.

The budget id alone was rejected. A rejected round 1 is generated again in place, under the same id,
so the link in an older e-mail would approve the new total, which that e-mail never showed. An HMAC
with a server secret was rejected too: the customer's bearer token already authenticates the call,
so the hash only has to tell one generation of a round from the next.

Receiving the customer's and the vehicle's data in the opening was rejected. It would duplicate the
registration routes, and the user considers the ids enough.

A page behind the links, and a route that only answers the status, were left out. No front end
exists, and the work order routes already answer the status.

## Consequences

The four readings differ from the brief's wording, and the plan lists each one under "Differences
from the source". The README and the Postman collection say so.

The links of an e-mail stop working when its round is generated again, and calling one answers 422
`WORK_ORDER_BUDGET_LINK_OUTDATED`. The e-mail the new generation sends carries the working links, and
so does every work order answer.

The links are API calls. A mail client that opens one sends GET and gets 404, so the e-mail says to
call the address with POST and the bearer token. A front end that shows the budget and calls the
links is the way to improve this.

A work order canceled while it awaits approval keeps its budget `PENDING`, because the cancellation
leaves the budgets as they are. `approvalUrl` and `rejectionUrl` are null once the work order no
longer awaits approval, a canceled one included, so no answer carries a link that cannot work. An
e-mail sent earlier still holds the links, and calling one answers 422 `WORK_ORDER_INVALID_STATE`.
