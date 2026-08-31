import { Inject } from '@nestjs/common';
import { CommandHandler, EventBus, ICommandHandler } from '@nestjs/cqrs';
import { CLOCK, Clock } from '../../../../../shared/application/ports/clock.port';
import { ID_GENERATOR, IdGenerator } from '../../../../../shared/application/ports/id-generator.port';
import { Money } from '../../../../../shared/domain/value-objects/money';
import { InventoryItem } from '../../../domain/entities/inventory-item';
import { SkuAlreadyInUseError } from '../../../domain/errors/sku-already-in-use.error';
import { InventoryItemKind } from '../../../domain/inventory-item-kind';
import {
  INVENTORY_ITEM_REPOSITORY,
  InventoryItemRepository,
} from '../../../domain/repositories/inventory-item.repository';
import { InventoryItemId } from '../../../domain/value-objects/inventory-item-id';
import { Sku } from '../../../domain/value-objects/sku';
import { CreatedInventoryItemDto, CreateInventoryItemCommand } from './create-inventory-item.command';

@CommandHandler(CreateInventoryItemCommand)
export class CreateInventoryItemHandler
  implements ICommandHandler<CreateInventoryItemCommand, CreatedInventoryItemDto>
{
  constructor(
    @Inject(INVENTORY_ITEM_REPOSITORY) private readonly items: InventoryItemRepository,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: CreateInventoryItemCommand): Promise<CreatedInventoryItemDto> {
    // A negative price is refused by the shared kernel's Money, so this module defines no price
    // error of its own (design.md's reuse table).
    const sku = Sku.create(command.sku);
    const unitPrice = Money.fromCents(command.unitPriceCents);

    // Application-layer pre-check for the friendly 409, with the unique index as the race
    // backstop - the same two-layer shape CreateServiceHandler uses.
    if (await this.items.existsActiveBySku(sku)) {
      throw new SkuAlreadyInUseError();
    }

    const item = InventoryItem.create({
      id: InventoryItemId.create(this.idGenerator.generate()),
      sku,
      name: command.name,
      description: command.description,
      kind: command.kind as InventoryItemKind,
      unitPrice,
      now: this.clock.now(),
    });
    await this.items.save(item);
    this.eventBus.publishAll(item.pullDomainEvents());

    return { id: item.id.value };
  }
}
