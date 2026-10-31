# 0033. Writes across modules run as steps that an outbox completes

**Status**: Accepted
**Supersedes**: [0023](0023-repositories-honour-an-ambient-transaction.md)
**Source**: AD-017 in `.specs/STATE.md`
**Recorded**: 2026-10-31, from AD-017, taken during the `clean-architecture` feature

## Context

Five flows wrote the tables of two modules inside one request. Four of them moved stock while they saved the work order: a withdrawal, a return, a delivery and a cancellation. The fifth was the registration of a customer, which opened an account in `identity` and saved the customer in `customers`.

The four stock flows ran in one shared transaction. `TransactionRunner` put its `EntityManager` in an `AsyncLocalStorage`, and every repository reachable from the write joined it (ADR 0023). That tied two modules together through the database connection and the transaction context. Every module a write could reach had to carry the branch on the ambient manager, and the pool starvation that ADR 0032 describes came from the same tie: a repository that opened its own transaction and then called a resolver in another module took a second connection, and two concurrent saves exhausted a pool of two.

The registration did not have the guarantee at all. `TypeOrmTransactionRunner.run` always takes a new connection, so the account that `RegisterUserUseCase` opened committed in an `identity` transaction nested in the customers one, and committed first. A customer save that failed afterwards left the user behind, and the same email and document could not register again. A check on 2026-10-31 confirmed it: the user row stayed after the failed save. The comment on the accounts gateway, which said the account joined the registration's transaction, was wrong.

## Decision

No transaction writes the tables of two modules. `TransactionRunner.run` wraps the tables of the calling module only, and it rejects a call made inside a transaction that is already open. Each of the five flows runs as steps, and each module commits its own.

Three reasons support the rule. It avoids coupling between modules, because a module no longer depends on the database connection or the transaction context of another. It keeps each module responsible for its own data, because a module writes its tables in its own transaction and reaches another module only through that module's public API. It removes the pool starvation that a shared transaction caused.

The orchestrating module records each pending step in an outbox table that it owns: `work_order_stock_steps` in `work-orders` and `customer_account_steps` in `customers`. A processor in each module runs at application bootstrap and every `OUTBOX_POLL_INTERVAL_MS` (5000 by default, and 0 turns it off). It claims the steps that are due with `FOR UPDATE SKIP LOCKED`, applies each through the module's applier and records the outcome. A failed attempt keeps the step pending, and the next attempt comes after 1 second, 5 seconds, 30 seconds, 2 minutes, 10 minutes, then 1 hour. At `OUTBOX_MAX_ATTEMPTS` (10) the processor marks the step failed and logs it at error level with its kind, its operation id, the work order or the user, and the last error. A failed step stays in its table for an operator.

The withdrawal and the registration compensate their first step when a later one fails. A withdrawal arms an undo step that falls due after `OUTBOX_GRACE_SECONDS` (300), consumes the stock in an `inventory` transaction, and then disarms the step and saves the work order in one `work-orders` transaction. A registration with a new account chooses the user id, arms a discard step, opens the account in an `identity` transaction, and then disarms the step and saves the customer in one `customers` transaction. When the consumption, the opening or the last transaction fails, the request applies the undo or the discard at once through the ledger or the accounts port, without claiming the step, completes the step and answers the first error. A compensation that fails leaves the step to the processor. If the process stops between the steps, the armed step stays behind and the processor compensates once the grace period has passed. If the processor claimed the step before the request reached its last transaction, the disarm finds the step taken. The request then answers 409 `CONCURRENT_MODIFICATION`, saves nothing and applies its own compensation, which is safe to repeat while the processor holds the step.

The return, the delivery and the cancellation retry their inventory step. Each saves the work order and records a restore, settle or write-off step in one `work-orders` transaction, and applies the step after the commit. A failure of that attempt, the claim included, never fails the request, and the processor retries the step.

The steps of a work order apply in the order they were recorded. A claim takes a step only while no older step of the same work order is armed, pending or failed, so it takes at most one step per work order, the oldest that is not done. The order matters because a restore draws from pending consumptions only. A settlement or a write-off that applied first would close them, and the restore that failed earlier would fail on every later attempt. In the recorded order the restore applies first, and the write-off or the settlement closes only what stayed outstanding. A failed step holds the later steps of its work order. An operator releases it by setting the step back to pending once the cause is fixed. The steps of other work orders go on. The request's own attempt follows the same rule: while an older step waits it claims nothing, the request still succeeds with the work order it saved, and the processor applies the step later.

Every receiving step is idempotent by operation id. An undo returns the net remaining units of every consumption the operation tagged, whatever its status, and tags its returns with the same id. A restore whose operation id already tags a return does nothing. Settle and write-off act on pending consumptions only, and the write-off updates only the rows still pending and records one transition for each row it updated, so two runs at once record each transition once. A discard of a missing user does nothing, and a discard of a user with a session or a customer is refused. Each inventory stock use case (consume, restore, undo, settle and write off) opens its own transaction through `TransactionRunner`.

ADR 0023 is superseded for writes across modules. Within one module its rule holds, and ADR 0032 keeps its refinement: a repository joins the ambient transaction, and opens its own through `runInNewTransaction` when there is none.

## Alternatives

Keeping the shared transaction was rejected. It commits both writes at once, which no compensation can match, but it ties two modules together through the connection and the transaction context, every module reachable from a write has to carry the branch on the ambient manager, and it caused the starvation of ADR 0032. The registration also showed that the guarantee failed wherever a use case of another module opened a transaction of its own.

Compensation without an outbox was rejected. The request would undo its first step when the second one fails, and a process that stops between the two leaves the first step applied with nothing to undo it: units consumed for a withdrawal that was never saved, or an account without a customer. The outbox keeps the guarantee of the shared transaction across a crash.

One outbox table and one processor in `src/shared` were also rejected. They would add files to `src/shared` and leave the table without one owning module. Each module keeps its own, at the cost of about 60 similar lines in the two processors.

## Consequences

The code gains two step tables, two processors, an applier for each, and idempotent operations in `inventory` and `identity`. Three settings configure them: `OUTBOX_POLL_INTERVAL_MS`, `OUTBOX_GRACE_SECONDS` and `OUTBOX_MAX_ATTEMPTS`. After a return, a delivery or a cancellation commits, the stock side lands when its step is applied, which is at once on the usual path and after a delay when inventory failed. A step that keeps failing needs an operator, and no screen or endpoint lists failed steps.

The order of the steps makes a step hold the later steps of its work order. While a step is retrying or failed, the later steps wait in the outbox behind it. The requests that recorded them succeed, and their stock side lands after the step ahead is done, one step per processor run. A failed step holds them until an operator sets it back to pending. An armed step holds them in the same way until the request disarms it or compensates, or until the processor undoes it once the grace period has passed. The steps of other work orders go on.

A compensation shows in the movement history as what happened: a consumption followed by its return.

A cancellation or a delivery can race a withdrawal on the same work order. When the cancellation wins the version race, the consumption of the losing withdrawal has already committed. Either the write-off or the settlement closed that consumption first, or the consumption came after it and stays pending. In both cases the undo returns the units, so the history shows the consumption closed, then returned, or pending beside its return, and the stock ends where it was before the withdrawal. The e2e case of that race, in `test/e2e/work-order-concurrency.e2e.spec.ts`, used to assert that no movement stays pending on a canceled work order. A returned consumption stays pending beside its return (ADR 0015), so the user amended the assertion on 2026-10-31: no consumption keeps units outstanding, and the stock is back at 20. It is the one e2e assertion this feature changed.

Two cases are left to an operator. The first is the withdrawal's. A request that stalls past the grace period between arming its step and consuming, and whose own undo then fails, leaves no step to retry. The processor claimed the armed step, its undo found nothing to return because the consumption had not committed yet, and it completed the step. When the consumption commits later, the request answers 409 and applies its own undo. If that undo fails, no step remains to retry it, and the units stay consumed until an operator returns them.

The second is the registration's. A request that stalls past the grace period between arming its step and opening the account, and whose own discard then fails, leaves no step to retry. The processor claimed the armed step, its discard found no user to remove, and it completed the step. When the account opens later, the request answers 409 and applies its own discard. If that discard fails, no step remains to retry it, and the account stays open without a customer until an operator discards it.

Code that opens a transaction inside another one fails at its first call, because `TypeOrmTransactionRunner.run` rejects a nested run. An integration spec in `test/integration/` covers the rejection, so the rule needs no file in `src/shared`.
