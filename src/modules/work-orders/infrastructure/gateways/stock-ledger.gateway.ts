import { Injectable } from '@nestjs/common';
import {
  ConfirmConsumptionCommand,
  ConfirmConsumptionUseCase,
  ConsumeStockBatchCommand,
  ConsumeStockBatchUseCase,
  RestoreStockBatchCommand,
  RestoreStockBatchUseCase,
  SettleStockMovementsCommand,
  SettleStockMovementsUseCase,
  UndoConsumptionCommand,
  UndoConsumptionUseCase,
  WriteOffStockMovementsCommand,
  WriteOffStockMovementsUseCase,
} from '../../../inventory';
import { StockLedger, StockLine } from '../../application/ports/stock-ledger.port';

/**
 * Moves stock through the public API of the inventory module. The gateway adds nothing around the
 * calls and lets every error from inventory, such as `INVENTORY_INSUFFICIENT_STOCK`, travel out
 * untouched.
 */
@Injectable()
export class StockLedgerGateway implements StockLedger {
  constructor(
    private readonly consumeStock: ConsumeStockBatchUseCase,
    private readonly restoreStock: RestoreStockBatchUseCase,
    private readonly settleMovements: SettleStockMovementsUseCase,
    private readonly writeOffMovements: WriteOffStockMovementsUseCase,
    private readonly undoStock: UndoConsumptionUseCase,
    private readonly confirmStock: ConfirmConsumptionUseCase,
  ) {}

  async consume(
    workOrderId: string,
    lines: StockLine[],
    actorUserId: string,
    operationId: string,
  ): Promise<void> {
    await this.consumeStock.execute(
      new ConsumeStockBatchCommand(lines, workOrderId, actorUserId, operationId),
    );
  }

  async restore(
    workOrderId: string,
    lines: StockLine[],
    actorUserId: string,
    operationId: string,
  ): Promise<void> {
    await this.restoreStock.execute(
      new RestoreStockBatchCommand(lines, workOrderId, actorUserId, operationId),
    );
  }

  async undoConsumption(operationId: string, actorUserId: string): Promise<void> {
    await this.undoStock.execute(new UndoConsumptionCommand(operationId, actorUserId));
  }

  async confirmConsumption(operationId: string, actorUserId: string): Promise<void> {
    await this.confirmStock.execute(new ConfirmConsumptionCommand(operationId, actorUserId));
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
