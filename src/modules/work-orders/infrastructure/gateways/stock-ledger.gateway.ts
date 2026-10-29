import { Injectable } from '@nestjs/common';
import {
  ConsumeStockBatchCommand,
  ConsumeStockBatchHandler,
  RestoreStockBatchCommand,
  RestoreStockBatchHandler,
  SettleStockMovementsCommand,
  SettleStockMovementsHandler,
  WriteOffStockMovementsCommand,
  WriteOffStockMovementsHandler,
} from '../../../inventory';
import { StockLedger, StockLine } from '../../application/ports/stock-ledger.port';

/**
 * Moves stock through the public API of the inventory module. The caller opens the transaction and
 * the inventory repository joins it (AD-008), so the gateway adds nothing around the calls and
 * lets every error from inventory, such as `INVENTORY_INSUFFICIENT_STOCK`, travel out untouched.
 */
@Injectable()
export class StockLedgerGateway implements StockLedger {
  constructor(
    private readonly consumeStock: ConsumeStockBatchHandler,
    private readonly restoreStock: RestoreStockBatchHandler,
    private readonly settleMovements: SettleStockMovementsHandler,
    private readonly writeOffMovements: WriteOffStockMovementsHandler,
  ) {}

  async consume(workOrderId: string, lines: StockLine[], actorUserId: string): Promise<void> {
    await this.consumeStock.execute(new ConsumeStockBatchCommand(lines, workOrderId, actorUserId));
  }

  async restore(workOrderId: string, lines: StockLine[], actorUserId: string): Promise<void> {
    await this.restoreStock.execute(new RestoreStockBatchCommand(lines, workOrderId, actorUserId));
  }

  async settle(workOrderId: string, actorUserId: string): Promise<void> {
    await this.settleMovements.execute(new SettleStockMovementsCommand(workOrderId, actorUserId));
  }

  async writeOff(workOrderId: string, actorUserId: string): Promise<void> {
    await this.writeOffMovements.execute(
      new WriteOffStockMovementsCommand(workOrderId, actorUserId),
    );
  }
}
