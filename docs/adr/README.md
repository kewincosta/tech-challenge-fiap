# Architecture decision records

One decision per file, numbered in the order the decisions were taken rather than by importance.
Each record carries its context, the decision, the alternatives considered and the consequences.

This index lists what exists and where. It holds no decision text of its own: to know why
something was decided, open the record.

## Status

| Status               | Meaning                                                                                    |
| -------------------- | ------------------------------------------------------------------------------------------ |
| `Accepted`           | In force. The code implements it.                                                          |
| `Amended by NNNN`    | In force, except the part NNNN replaces. The record stays as it was decided.               |
| `Superseded by NNNN` | No longer in force. The record stays as it was decided, and NNNN carries what replaced it. |
| `Deprecated`         | No longer in force and not replaced.                                                       |

A superseded record is never edited to read as though it were current, and never deleted. The
reasoning behind a reversal is the part worth keeping, and rewriting the record destroys it.

## Where a decision also lives

`.specs/STATE.md` carries a `## Decisions` log of `AD-NNN` entries, which is the working memory
read at the start of a session. A record that corresponds to one names it in a `Source` line, and
the log entry stays in place. Neither stands alone: `AD-010` in that log is the rule that a
decision from here on gets both.

## The records

| #                                                                  | Decision                                                                         | Status                                                                                                        |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| [0001](0001-modular-monolith-with-cqrs.md)                         | Modular monolith in layers, with CQRS through `@nestjs/cqrs`                     | Amended by [0026](0026-use-cases-are-plain-classes.md) and [0033](0033-writes-across-modules-run-as-steps.md) |
| [0002](0002-postgresql-as-the-relational-database.md)              | PostgreSQL as the relational database                                            | Accepted                                                                                                      |
| [0003](0003-redis-for-cache-revocation-and-rate-limiting.md)       | Redis for the effective access cache, the revoked session list and rate limiting | Accepted                                                                                                      |
| [0004](0004-jwt-with-refresh-token-rotation.md)                    | JWT access tokens with refresh token rotation and reuse detection                | Accepted                                                                                                      |
| [0005](0005-argon2id-for-password-hashing.md)                      | Argon2id for password hashing                                                    | Accepted                                                                                                      |
| [0006](0006-internal-key-plus-external-uuid.md)                    | Internal sequential key plus external UUID on every addressable table            | Accepted                                                                                                      |
| [0007](0007-money-in-integer-brl-cents.md)                         | Money in the shared kernel, integer BRL cents across the backend                 | Accepted                                                                                                      |
| [0008](0008-cross-context-calls-through-the-buses.md)              | Cross context communication through the CommandBus and the QueryBus              | Superseded by [0027](0027-ports-between-modules.md)                                                           |
| [0009](0009-customer-as-its-own-aggregate.md)                      | Customer as its own aggregate, over a user identity                              | Accepted                                                                                                      |
| [0010](0010-no-aggregate-for-the-staff-profiles.md)                | No aggregate for Mechanic, Service advisor and Administrator                     | Accepted                                                                                                      |
| [0011](0011-groups-removed-from-the-authorization-model.md)        | Groups removed from the authorization model                                      | Accepted                                                                                                      |
| [0012](0012-super-administrator-created-outside-the-api.md)        | Super administrator created outside the API, with the escalation rule            | Accepted                                                                                                      |
| [0013](0013-one-inventory-item-aggregate.md)                       | One InventoryItem aggregate covering parts and supplies                          | Accepted                                                                                                      |
| [0014](0014-stock-consumed-at-withdrawal.md)                       | Stock consumed at withdrawal, with no reservation phase                          | Accepted                                                                                                      |
| [0015](0015-stock-movements-append-only.md)                        | Stock movements append only, with transitions for the consumption status         | Accepted                                                                                                      |
| [0016](0016-cancellation-writes-movements-off.md)                  | Cancellation writes movements off instead of returning units to stock            | Accepted                                                                                                      |
| [0017](0017-budget-as-an-entity-inside-the-work-order.md)          | Budget as an entity inside the WorkOrder aggregate                               | Accepted                                                                                                      |
| [0018](0018-numbered-budget-rounds.md)                             | Numbered budget rounds, so additional repairs are authorised in place            | Accepted                                                                                                      |
| [0019](0019-withdrawal-charged-at-the-budgeted-price.md)           | A withdrawal is charged at the price its budget round froze                      | Accepted                                                                                                      |
| [0020](0020-budget-total-and-charged-total-kept-apart.md)          | Budget total and charged total kept as two separate values                       | Accepted                                                                                                      |
| [0021](0021-the-trail-written-inside-the-aggregate-transaction.md) | The work order trail written by the repository in the same transaction           | Accepted                                                                                                      |
| [0022](0022-a-logout-ends-every-active-session.md)                 | A logout ends every active session of the user                                   | Accepted                                                                                                      |
| [0023](0023-repositories-honour-an-ambient-transaction.md)         | A repository reachable from a cross-module write honours an ambient transaction  | Superseded by [0033](0033-writes-across-modules-run-as-steps.md)                                              |
| [0024](0024-optimistic-version-guard-on-the-work-order.md)         | Optimistic version guard on the work order repository                            | Accepted                                                                                                      |
| [0025](0025-deviation-from-the-budget-cancels-the-work-order.md)   | Any deviation from an approved budget cancels the work order and opens a new one | Superseded by [0018](0018-numbered-budget-rounds.md)                                                          |
| [0026](0026-use-cases-are-plain-classes.md)                        | Use cases are plain classes that the controllers call directly                   | Accepted                                                                                                      |
| [0027](0027-ports-between-modules.md)                              | Modules meet through consumer-owned ports and public APIs, with no cycle         | Amended by [0033](0033-writes-across-modules-run-as-steps.md)                                                 |
| [0028](0028-each-module-queries-only-its-own-tables.md)            | Each module queries only its own tables                                          | Accepted                                                                                                      |
| [0029](0029-one-identity-module.md)                                | Users, authentication and authorization form one identity module                 | Accepted                                                                                                      |
| [0030](0030-route-permissions-stay-in-the-http-guard.md)           | Route permissions stay in the guard, and each entry point checks its own caller  | Accepted                                                                                                      |
| [0031](0031-patterns-kept-beyond-the-dependency-rule.md)           | Four patterns kept beyond the dependency rule, each with its own justification   | Accepted                                                                                                      |
| [0032](0032-a-repository-own-transaction-is-the-ambient-one.md)    | A repository's own transaction is the ambient one                                | Accepted                                                                                                      |
| [0033](0033-writes-across-modules-run-as-steps.md)                 | Writes across modules run as steps that an outbox completes                      | Accepted                                                                                                      |
| [0034](0034-parts-can-be-planned-at-reception.md)                  | Parts can be planned at reception, before any diagnosis                          | Accepted                                                                                                      |
| [0035](0035-paginated-listings-answer-a-page-envelope.md)          | Paginated listings answer a page envelope with the totals                        | Accepted                                                                                                      |
| [0036](0036-email-goes-through-a-mailer-port-over-smtp.md)         | E-mail goes through a Mailer port over SMTP                                      | Accepted                                                                                                      |
| [0037](0037-how-the-phase-2-briefs-api-items-are-read.md)          | How the Phase 2 brief's API items are read                                       | Accepted                                                                                                      |
| [0038](0038-infrastructure-on-aws-provisioned-by-terraform.md)     | Infrastructure on AWS in us-east-1, provisioned by Terraform                     | Accepted                                                                                                      |
| [0039](0039-database-and-redis-reached-by-configuration.md)        | The database and Redis are reached by configuration, with no cloud SDK           | Accepted                                                                                                      |
| [0040](0040-the-application-runs-in-kubernetes-as-a-helm-chart.md) | The application runs in Kubernetes as a Helm chart                               | Accepted                                                                                                      |
| [0041](0041-ci-and-cd-run-on-github-actions.md)                    | CI and CD run on GitHub Actions                                                  | Amended by [0042](0042-the-ci-runs-on-pull-requests-into-main.md)                                             |
| [0042](0042-the-ci-runs-on-pull-requests-into-main.md)             | The CI runs on pull requests into main and on pushes to main                     | Accepted                                                                                                      |
