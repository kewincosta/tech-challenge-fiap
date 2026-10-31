import { INestApplication } from '@nestjs/common';
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
