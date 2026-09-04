import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { CLOCK, Clock } from '../../../../../shared/application/ports/clock.port';
import {
  INVENTORY_ITEM_REPOSITORY,
  InventoryItemRepository,
} from '../../../domain/repositories/inventory-item.repository';
import { SettleStockMovementsCommand } from './settle-stock-movements.command';

/**
 * The inventory side of a delivery. Reached only from inside `DeliverVehicleHandler`'s
 * `transactionRunner.run` (AD-008), so the settlement lands in the same transaction as the
 * delivery it accompanies. A work order with nothing pending settles nothing and does not throw -
 * delivering a work order that withdrew no part is ordinary, not an error.
 */
@CommandHandler(SettleStockMovementsCommand)
export class SettleStockMovementsHandler implements ICommandHandler<
  SettleStockMovementsCommand,
  void
> {
  constructor(
    @Inject(INVENTORY_ITEM_REPOSITORY) private readonly items: InventoryItemRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: SettleStockMovementsCommand): Promise<void> {
    await this.items.settleWorkOrderConsumptions({
      workOrderId: command.workOrderId,
      actorUserId: command.actorUserId,
      now: this.clock.now(),
    });
  }
}
