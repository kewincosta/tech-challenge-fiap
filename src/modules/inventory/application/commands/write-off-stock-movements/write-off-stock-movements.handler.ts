import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { CLOCK, Clock } from '../../../../../shared/application/ports/clock.port';
import {
  INVENTORY_ITEM_REPOSITORY,
  InventoryItemRepository,
} from '../../../domain/repositories/inventory-item.repository';
import { WriteOffStockMovementsCommand } from './write-off-stock-movements.command';

/**
 * The inventory side of a cancellation. Reached only from inside `CancelWorkOrderHandler`'s
 * `transactionRunner.run` (AD-008), so the write-off lands in the same transaction as the
 * cancellation it accompanies. A work order with nothing outstanding writes off nothing and does
 * not throw - cancelling a work order that withdrew no part, or that had every withdrawal already
 * returned, is ordinary, not an error (spec.md's edge cases).
 */
@CommandHandler(WriteOffStockMovementsCommand)
export class WriteOffStockMovementsHandler implements ICommandHandler<
  WriteOffStockMovementsCommand,
  void
> {
  constructor(
    @Inject(INVENTORY_ITEM_REPOSITORY) private readonly items: InventoryItemRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: WriteOffStockMovementsCommand): Promise<void> {
    await this.items.writeOffWorkOrderConsumptions({
      workOrderId: command.workOrderId,
      actorUserId: command.actorUserId,
      now: this.clock.now(),
    });
  }
}
