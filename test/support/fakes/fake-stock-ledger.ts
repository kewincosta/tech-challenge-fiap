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

export type LedgerCall = 'consume' | 'restore' | 'undoConsumption' | 'settle' | 'writeOff';

/**
 * Records what the work-orders use cases ask of stock, and refuses on demand like inventory does.
 */
export class FakeStockLedger implements StockLedger {
  readonly consumed: RecordedStockMovement[] = [];
  readonly restored: RecordedStockMovement[] = [];
  readonly undone: RecordedUndo[] = [];
  readonly settled: RecordedWorkOrderClosing[] = [];
  readonly writtenOff: RecordedWorkOrderClosing[] = [];
  private readonly refusals: Array<{ error: Error; calls: LedgerCall[] }> = [];

  /** `insideTransaction` tells whether the transaction is open at the moment of a call. */
  constructor(private readonly insideTransaction: () => boolean = () => false) {}

  /**
   * Makes every later call reject with `error` and record nothing, or only the named `calls`
   * when there are any. A call takes the first refusal that covers it.
   */
  refuseWith(error: Error, ...calls: LedgerCall[]): this {
    this.refusals.push({ error, calls });
    return this;
  }

  async consume(
    workOrderId: string,
    lines: StockLine[],
    actorUserId: string,
    operationId: string,
  ): Promise<void> {
    this.throwIfRefusing('consume');
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
    this.throwIfRefusing('restore');
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
    this.throwIfRefusing('undoConsumption');
    this.undone.push({ operationId, actorUserId, insideTransaction: this.insideTransaction() });
    return Promise.resolve();
  }

  async settle(workOrderId: string, actorUserId: string): Promise<void> {
    this.throwIfRefusing('settle');
    this.settled.push({ workOrderId, actorUserId, insideTransaction: this.insideTransaction() });
    return Promise.resolve();
  }

  async writeOff(workOrderId: string, actorUserId: string): Promise<void> {
    this.throwIfRefusing('writeOff');
    this.writtenOff.push({ workOrderId, actorUserId, insideTransaction: this.insideTransaction() });
    return Promise.resolve();
  }

  private throwIfRefusing(call: LedgerCall): void {
    const refusal = this.refusals.find(
      (candidate) => candidate.calls.length === 0 || candidate.calls.includes(call),
    );
    if (refusal) {
      throw refusal.error;
    }
  }
}
