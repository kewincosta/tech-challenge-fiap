import {
  StockLedger,
  StockLine,
} from '../../../src/modules/work-orders/application/ports/stock-ledger.port';

export interface RecordedStockMovement {
  workOrderId: string;
  lines: StockLine[];
  actorUserId: string;
}

export interface RecordedWorkOrderClosing {
  workOrderId: string;
  actorUserId: string;
}

/** Records what the work-orders handlers ask of stock, and refuses on demand like inventory does. */
export class FakeStockLedger implements StockLedger {
  readonly consumed: RecordedStockMovement[] = [];
  readonly restored: RecordedStockMovement[] = [];
  readonly settled: RecordedWorkOrderClosing[] = [];
  readonly writtenOff: RecordedWorkOrderClosing[] = [];
  private refusal: Error | null = null;

  /** Makes every later call reject with `error` and record nothing. */
  refuseWith(error: Error): this {
    this.refusal = error;
    return this;
  }

  async consume(workOrderId: string, lines: StockLine[], actorUserId: string): Promise<void> {
    this.throwIfRefusing();
    this.consumed.push({ workOrderId, lines, actorUserId });
    return Promise.resolve();
  }

  async restore(workOrderId: string, lines: StockLine[], actorUserId: string): Promise<void> {
    this.throwIfRefusing();
    this.restored.push({ workOrderId, lines, actorUserId });
    return Promise.resolve();
  }

  async settle(workOrderId: string, actorUserId: string): Promise<void> {
    this.throwIfRefusing();
    this.settled.push({ workOrderId, actorUserId });
    return Promise.resolve();
  }

  async writeOff(workOrderId: string, actorUserId: string): Promise<void> {
    this.throwIfRefusing();
    this.writtenOff.push({ workOrderId, actorUserId });
    return Promise.resolve();
  }

  private throwIfRefusing(): void {
    if (this.refusal) {
      throw this.refusal;
    }
  }
}
