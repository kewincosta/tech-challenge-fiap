import { Clock } from '../../../../../shared/application/ports/clock.port';
import { TransactionRunner } from '../../../../../shared/application/ports/transaction-runner.port';
import { InventoryItemRepository } from '../../ports/inventory-item.repository';
import { SettleStockMovementsCommand } from './settle-stock-movements.command';

/**
 * The inventory side of a delivery. The settlement moves every confirmed pending consumption of the
 * work order and records one transition for each, so it runs in a transaction of its own and
 * commits both together. A consumption its work order has not confirmed stays as it is. A work
 * order with nothing pending settles nothing and does not throw, because delivering a work order
 * that withdrew no part is ordinary. A repeat finds nothing pending, so it changes nothing.
 */
export class SettleStockMovementsUseCase {
  constructor(
    private readonly items: InventoryItemRepository,
    private readonly transactionRunner: TransactionRunner,
    private readonly clock: Clock,
  ) {}

  async execute(command: SettleStockMovementsCommand): Promise<void> {
    await this.transactionRunner.run(() =>
      this.items.settleWorkOrderConsumptions({
        workOrderId: command.workOrderId,
        actorUserId: command.actorUserId,
        now: this.clock.now(),
      }),
    );
  }
}
