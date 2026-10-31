import {
  StockLedger,
  StockLine,
} from '../../../src/modules/work-orders/application/ports/stock-ledger.port';

export interface RecordedStockMovement {
  workOrderId: string;
  lines: StockLine[];
  actorUserId: string;
  /** The operation id the call carried. */
  operationId: string;
  /** Whether the transaction was open when the call arrived. */
  insideTransaction: boolean;
}

export interface RecordedUndo {
  operationId: string;
  actorUserId: string;
  /** Whether the transaction was open when the call arrived. */
  insideTransaction: boolean;
}

export interface RecordedWorkOrderClosing {
  workOrderId: string;
  actorUserId: string;
  /** Whether the transaction was open when the call arrived. */
  insideTransaction: boolean;
}

/**
 * Records what the work-orders use cases ask of stock, and refuses on demand like inventory does.
 */
export class FakeStockLedger implements StockLedger {
  readonly consumed: RecordedStockMovement[] = [];
  readonly restored: RecordedStockMovement[] = [];
  readonly undone: RecordedUndo[] = [];
  readonly settled: RecordedWorkOrderClosing[] = [];
  readonly writtenOff: RecordedWorkOrderClosing[] = [];
  private refusal: Error | null = null;

  /** `insideTransaction` tells whether the transaction is open at the moment of a call. */
  constructor(private readonly insideTransaction: () => boolean = () => false) {}

  /** Makes every later call reject with `error` and record nothing. */
  refuseWith(error: Error): this {
    this.refusal = error;
    return this;
  }

  async consume(
    workOrderId: string,
    lines: StockLine[],
    actorUserId: string,
    operationId: string,
  ): Promise<void> {
    this.throwIfRefusing();
    this.consumed.push({
      workOrderId,
      lines,
      actorUserId,
      operationId,
      insideTransaction: this.insideTransaction(),
    });
    return Promise.resolve();
  }

  async restore(
    workOrderId: string,
    lines: StockLine[],
    actorUserId: string,
    operationId: string,
  ): Promise<void> {
    this.throwIfRefusing();
    this.restored.push({
      workOrderId,
      lines,
      actorUserId,
      operationId,
      insideTransaction: this.insideTransaction(),
    });
    return Promise.resolve();
  }

  async undoConsumption(operationId: string, actorUserId: string): Promise<void> {
    this.throwIfRefusing();
    this.undone.push({ operationId, actorUserId, insideTransaction: this.insideTransaction() });
    return Promise.resolve();
  }

  async settle(workOrderId: string, actorUserId: string): Promise<void> {
    this.throwIfRefusing();
    this.settled.push({ workOrderId, actorUserId, insideTransaction: this.insideTransaction() });
    return Promise.resolve();
  }

  async writeOff(workOrderId: string, actorUserId: string): Promise<void> {
    this.throwIfRefusing();
    this.writtenOff.push({ workOrderId, actorUserId, insideTransaction: this.insideTransaction() });
    return Promise.resolve();
  }

  private throwIfRefusing(): void {
    if (this.refusal) {
      throw this.refusal;
    }
  }
}
