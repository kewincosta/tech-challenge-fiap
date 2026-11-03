import { isDeepStrictEqual } from 'node:util';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AccountStepApplier } from '../../src/modules/customers/application/services/account-step-applier';
import {
  ACCOUNT_STEP_LOG,
  CUSTOMER_ACCOUNTS,
  OUTBOX_SETTINGS as CUSTOMERS_OUTBOX_SETTINGS,
  PENDING_ACCOUNT_STEPS,
} from '../../src/modules/customers/customers.tokens';
import { StockStepApplier } from '../../src/modules/work-orders/application/services/stock-step-applier';
import {
  OUTBOX_SETTINGS,
  PENDING_STOCK_STEPS,
  STOCK_LEDGER,
  STOCK_STEP_LOG,
} from '../../src/modules/work-orders/work-orders.tokens';
import { FakeClock } from './fakes/fake-clock';

/**
 * Applies the stock steps of these operations that are due, the way the processor would. The
 * processor is off in the test suites (`OUTBOX_POLL_INTERVAL_MS=0`), and a test never applies every
 * due step of the shared database, which holds steps older runs left behind, so it names the
 * operations it made. A test also removes or completes its steps, so none stays due for a later run.
 *
 * `now` moves the clock of the run, to apply an armed step once its grace period has passed.
 */
export function drainStockSteps(
  app: INestApplication,
  operationIds: string[],
  now?: Date,
): Promise<void> {
  const applier = now
    ? new StockStepApplier(
        app.get(PENDING_STOCK_STEPS),
        app.get(STOCK_LEDGER),
        new FakeClock(now),
        app.get(STOCK_STEP_LOG),
        app.get(OUTBOX_SETTINGS),
      )
    : app.get(StockStepApplier);
  return applier.applyOperations(operationIds);
}

interface WaitingStep {
  operation_id: string;
  attempts: number;
}

async function waitingStepsOf(dataSource: DataSource, workOrderId: string): Promise<WaitingStep[]> {
  return dataSource.query(
    `SELECT s.operation_id, s.attempts
       FROM work_order_stock_steps s
       JOIN work_orders wo ON wo.id = s.work_order_id
      WHERE wo.external_id = $1 AND s.status IN ('ARMED', 'PENDING')
      ORDER BY s.id`,
    [workOrderId],
  );
}

/**
 * Applies the stock steps of one work order, the way the processor would over several runs. A claim
 * takes at most one step per work order besides its undo steps, which are outside the order, and a
 * step waits for the older ones, so draining a list of operations leaves a step behind when an
 * older blocker is missing from the list. This names the work order and loops until a round claims
 * nothing of it. A step that is not due yet, a step a failed step holds back and a step another
 * claim leases stay as they are. The steps of another work order are never claimed, which
 * `applyDue()` over the table would do to steps that suites running in parallel own. A test whose
 * request leaves a step waiting drains its work order with this, so that no armed or pending step
 * is left behind.
 */
export async function drainStockStepsOfWorkOrder(
  app: INestApplication,
  workOrderId: string,
  now?: Date,
): Promise<void> {
  const dataSource = app.get(DataSource);
  for (;;) {
    const before = await waitingStepsOf(dataSource, workOrderId);
    if (before.length === 0) {
      return;
    }
    await drainStockSteps(
      app,
      before.map((step) => step.operation_id),
      now,
    );
    // A claim counts an attempt and a step it applied leaves the list, so an unchanged list means
    // that nothing was claimable.
    if (isDeepStrictEqual(await waitingStepsOf(dataSource, workOrderId), before)) {
      return;
    }
  }
}

/**
 * Applies the account steps of these operations that are due, the way the processor would, for the
 * same reasons as `drainStockSteps`: the processor is off in the test suites, and a test names the
 * operations it made. `now` moves the clock of the run past the grace period of an armed step.
 */
export function drainAccountSteps(
  app: INestApplication,
  operationIds: string[],
  now?: Date,
): Promise<void> {
  const applier = now
    ? new AccountStepApplier(
        app.get(PENDING_ACCOUNT_STEPS),
        app.get(CUSTOMER_ACCOUNTS),
        new FakeClock(now),
        app.get(ACCOUNT_STEP_LOG),
        app.get(CUSTOMERS_OUTBOX_SETTINGS),
      )
    : app.get(AccountStepApplier);
  return applier.applyOperations(operationIds);
}
