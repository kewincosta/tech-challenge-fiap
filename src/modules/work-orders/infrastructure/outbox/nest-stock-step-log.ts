import { Injectable, Logger } from '@nestjs/common';
import { StockStep } from '../../application/ports/pending-stock-steps.port';
import { StockStepLog } from '../../application/ports/stock-step-log.port';

@Injectable()
export class NestStockStepLog implements StockStepLog {
  private readonly logger = new Logger('StockStepOutbox');

  failed(step: StockStep, lastError: string): void {
    this.logger.error(
      `Stock step ${step.kind} ${step.operationId} for work order ${step.workOrderId} failed for good: ${lastError}`,
    );
  }
}
