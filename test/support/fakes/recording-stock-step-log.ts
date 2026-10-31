import { StockStep } from '../../../src/modules/work-orders/application/ports/pending-stock-steps.port';
import { StockStepLog } from '../../../src/modules/work-orders/application/ports/stock-step-log.port';

/** Records the steps that reached their attempt limit, with the error each one ended on. */
export class RecordingStockStepLog implements StockStepLog {
  readonly failures: Array<{ step: StockStep; lastError: string }> = [];

  failed(step: StockStep, lastError: string): void {
    this.failures.push({ step, lastError });
  }
}
