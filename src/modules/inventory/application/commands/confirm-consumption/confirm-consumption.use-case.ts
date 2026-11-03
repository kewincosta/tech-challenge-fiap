import { Clock } from '../../../../../shared/application/ports/clock.port';
import { InventoryItemRepository } from '../../ports/inventory-item.repository';
import { ConfirmConsumptionCommand } from './confirm-consumption.command';

/**
 * The inventory side of a withdrawal that reached its work order: it records when the work order
 * confirmed the consumptions that the operation wrote. One statement sets the time on the
 * consumptions that have none, so a repeat changes nothing, as does an operation that consumed
 * nothing. The statement commits on its own, so the use case opens no transaction.
 */
export class ConfirmConsumptionUseCase {
  constructor(
    private readonly items: InventoryItemRepository,
    private readonly clock: Clock,
  ) {}

  async execute(command: ConfirmConsumptionCommand): Promise<void> {
    await this.items.confirmConsumptionsOfOperation(command.operationId, this.clock.now());
  }
}
