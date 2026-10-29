import { Clock } from '../../../../../shared/application/ports/clock.port';
import { DomainEventPublisher } from '../../../../../shared/application/ports/domain-event-publisher.port';
import { IdGenerator } from '../../../../../shared/application/ports/id-generator.port';
import { Money } from '../../../../../shared/domain/value-objects/money';
import { InventoryItem } from '../../../domain/entities/inventory-item';
import { SkuAlreadyInUseError } from '../../../domain/errors/sku-already-in-use.error';
import { InventoryItemKind } from '../../../domain/inventory-item-kind';
import { InventoryItemId } from '../../../domain/value-objects/inventory-item-id';
import { Sku } from '../../../domain/value-objects/sku';
import { InventoryItemRepository } from '../../ports/inventory-item.repository';
import {
  CreatedInventoryItemDto,
  CreateInventoryItemCommand,
} from './create-inventory-item.command';

export class CreateInventoryItemUseCase {
  constructor(
    private readonly items: InventoryItemRepository,
    private readonly idGenerator: IdGenerator,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
  ) {}

  async execute(command: CreateInventoryItemCommand): Promise<CreatedInventoryItemDto> {
    // A negative price is refused by the shared kernel's Money, so this module defines no price
    // error of its own (design.md's reuse table).
    const sku = Sku.create(command.sku);
    const unitPrice = Money.fromCents(command.unitPriceCents);

    // Application-layer pre-check for the friendly 409, with the unique index as the race
    // backstop - the same two-layer shape CreateServiceUseCase uses.
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
    this.events.publish(item.pullDomainEvents());

    return { id: item.id.value };
  }
}
