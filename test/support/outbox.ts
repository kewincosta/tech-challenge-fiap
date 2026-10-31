import { INestApplication } from '@nestjs/common';
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
