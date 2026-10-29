import { Clock } from '../../../../../shared/application/ports/clock.port';
import { InventoryItemRepository } from '../../ports/inventory-item.repository';
import { SettleStockMovementsCommand } from './settle-stock-movements.command';

/**
 * The inventory side of a delivery. Reached only from inside `DeliverVehicleUseCase`'s
 * `transactionRunner.run` (AD-008), so the settlement lands in the same transaction as the
 * delivery it accompanies. A work order with nothing pending settles nothing and does not throw -
 * delivering a work order that withdrew no part is ordinary, not an error.
 */
export class SettleStockMovementsUseCase {
  constructor(
    private readonly items: InventoryItemRepository,
    private readonly clock: Clock,
  ) {}

  async execute(command: SettleStockMovementsCommand): Promise<void> {
    await this.items.settleWorkOrderConsumptions({
      workOrderId: command.workOrderId,
      actorUserId: command.actorUserId,
      now: this.clock.now(),
    });
  }
}
