import { INestApplication } from '@nestjs/common';
import { StockStepApplier } from '../../src/modules/work-orders/application/services/stock-step-applier';

/**
 * Applies the stock steps of these operations that are due, the way the processor would. The
 * processor is off in the test suites (`OUTBOX_POLL_INTERVAL_MS=0`), and a test never applies every
 * due step of the shared database, which holds steps older runs left behind, so it names the
 * operations it made. A test also removes or completes its steps, so none stays due for a later run.
 */
export function drainStockSteps(app: INestApplication, operationIds: string[]): Promise<void> {
  return app.get(StockStepApplier).applyOperations(operationIds);
}
