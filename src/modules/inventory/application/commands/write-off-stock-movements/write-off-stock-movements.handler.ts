import { Clock } from '../../../../../shared/application/ports/clock.port';
import { InventoryItemRepository } from '../../ports/inventory-item.repository';
import { WriteOffStockMovementsCommand } from './write-off-stock-movements.command';

/**
 * The inventory side of a cancellation. Reached only from inside `CancelWorkOrderHandler`'s
 * `transactionRunner.run` (AD-008), so the write-off lands in the same transaction as the
 * cancellation it accompanies. A work order with nothing outstanding writes off nothing and does
 * not throw - cancelling a work order that withdrew no part, or that had every withdrawal already
 * returned, is ordinary, not an error (spec.md's edge cases).
 */
export class WriteOffStockMovementsHandler {
  constructor(
    private readonly items: InventoryItemRepository,
    private readonly clock: Clock,
  ) {}

  async execute(command: WriteOffStockMovementsCommand): Promise<void> {
    await this.items.writeOffWorkOrderConsumptions({
      workOrderId: command.workOrderId,
      actorUserId: command.actorUserId,
      now: this.clock.now(),
    });
  }
}
