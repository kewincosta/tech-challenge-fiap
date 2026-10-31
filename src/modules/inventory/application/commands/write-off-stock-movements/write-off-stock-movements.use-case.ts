import { Clock } from '../../../../../shared/application/ports/clock.port';
import { TransactionRunner } from '../../../../../shared/application/ports/transaction-runner.port';
import { InventoryItemRepository } from '../../ports/inventory-item.repository';
import { WriteOffStockMovementsCommand } from './write-off-stock-movements.command';

/**
 * The inventory side of a cancellation. The write-off moves the outstanding consumptions of the
 * work order and records one transition for each, so it runs in a transaction of its own and
 * commits both together. A work order with nothing outstanding writes off nothing and does not
 * throw, because cancelling a work order that withdrew no part, or that had every withdrawal
 * already returned, is ordinary (spec.md's edge cases). Two runs at once record each transition
 * once, because the repository updates only the consumptions still pending.
 */
export class WriteOffStockMovementsUseCase {
  constructor(
    private readonly items: InventoryItemRepository,
    private readonly transactionRunner: TransactionRunner,
    private readonly clock: Clock,
  ) {}

  async execute(command: WriteOffStockMovementsCommand): Promise<void> {
    await this.transactionRunner.run(() =>
      this.items.writeOffWorkOrderConsumptions({
        workOrderId: command.workOrderId,
        actorUserId: command.actorUserId,
        now: this.clock.now(),
      }),
    );
  }
}
