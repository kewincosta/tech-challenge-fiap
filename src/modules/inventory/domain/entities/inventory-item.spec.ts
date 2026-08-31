import { describe, expect, it } from 'vitest';
import { Money } from '../../../../shared/domain/value-objects/money';
import { AdjustmentNoteRequiredError } from '../errors/adjustment-note-required.error';
import { InsufficientStockError } from '../errors/insufficient-stock.error';
import { InventoryItemNotFoundError } from '../errors/inventory-item-not-found.error';
import { InvalidMovementQuantityError } from '../errors/invalid-movement-quantity.error';
import { InvalidSkuError } from '../errors/invalid-sku.error';
import { SkuAlreadyInUseError } from '../errors/sku-already-in-use.error';
import { InventoryItemCreated } from '../events/inventory-item-created.event';
import { InventoryItemUpdated } from '../events/inventory-item-updated.event';
import { StockAdjusted } from '../events/stock-adjusted.event';
import { StockReplenished } from '../events/stock-replenished.event';
import { InventoryItemKind } from '../inventory-item-kind';
import { InventoryItemStatus } from '../inventory-item-status';
import { ErrorKind } from '../../../../shared/domain/errors/error-kind';
import { InventoryItemId } from '../value-objects/inventory-item-id';
import { Sku } from '../value-objects/sku';
import { StockMovementId } from '../value-objects/stock-movement-id';
import { StockQuantity } from '../value-objects/stock-quantity';
import { InventoryItem } from './inventory-item';

const ITEM_ID = InventoryItemId.create('11111111-1111-4111-8111-111111111111');
const ACTOR_ID = '22222222-2222-4222-8222-222222222222';
const NOW = new Date('2026-08-31T12:00:00.000Z');

function movementId(suffix: string): StockMovementId {
  return StockMovementId.create(`33333333-3333-4333-8333-33333333333${suffix}`);
}

function buildItem(): InventoryItem {
  return InventoryItem.create({
    id: ITEM_ID,
    sku: Sku.create('FLT-001'),
    name: 'Filtro de oleo',
    description: 'Filtro padrao',
    kind: InventoryItemKind.Part,
    unitPrice: Money.fromCents(2500),
    now: NOW,
  });
}

describe('InventoryItem', () => {
  it('should create an ACTIVE item with a quantity on hand of zero and record InventoryItemCreated', () => {
    const item = buildItem();

    expect(item.status).toBe(InventoryItemStatus.Active);
    expect(item.quantityOnHand.units).toBe(0);
    const events = item.pullDomainEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toBeInstanceOf(InventoryItemCreated);
  });

  it('should rebuild from persisted props via restore with no domain event and no movements attached', () => {
    const restored = InventoryItem.restore({
      id: ITEM_ID,
      sku: Sku.create('FLT-002'),
      name: 'Filtro de ar',
      description: null,
      kind: InventoryItemKind.Part,
      unitPrice: Money.fromCents(1800),
      quantityOnHand: StockQuantity.of(12),
      status: InventoryItemStatus.Active,
      createdAt: NOW,
      updatedAt: NOW,
    });

    expect(restored.pullDomainEvents()).toHaveLength(0);
    expect(restored.newMovements).toHaveLength(0);
  });

  it('should replace only the supplied fields on updateDetails and record InventoryItemUpdated', () => {
    const item = buildItem();
    item.pullDomainEvents();

    item.updateDetails({ unitPrice: Money.fromCents(3000) }, NOW);

    expect(item.unitPrice.cents).toBe(3000);
    expect(item.name).toBe('Filtro de oleo');
    expect(item.description).toBe('Filtro padrao');
    const events = item.pullDomainEvents();
    expect(events[0]).toBeInstanceOf(InventoryItemUpdated);
  });

  it('should raise the count and append one INBOUND movement on replenish, recording StockReplenished', () => {
    const item = buildItem();
    item.pullDomainEvents();

    item.replenish({
      quantity: 10,
      unitPrice: Money.fromCents(2500),
      actorUserId: ACTOR_ID,
      note: 'Reposicao mensal',
      movementId: movementId('1'),
      now: NOW,
    });

    expect(item.quantityOnHand.units).toBe(10);
    expect(item.newMovements).toHaveLength(1);
    expect(item.newMovements[0].quantity).toBe(10);
    const events = item.pullDomainEvents();
    expect(events[0]).toBeInstanceOf(StockReplenished);
  });

  it('should lower the count through StockQuantity.minus and append one ADJUSTMENT movement on adjustDown, recording StockAdjusted', () => {
    const item = buildItem();
    item.replenish({
      quantity: 10,
      unitPrice: Money.fromCents(2500),
      actorUserId: ACTOR_ID,
      movementId: movementId('1'),
      now: NOW,
    });
    item.pullDomainEvents();

    item.adjustDown({
      quantity: 3,
      actorUserId: ACTOR_ID,
      note: 'Contagem divergente',
      movementId: movementId('2'),
      now: NOW,
    });

    expect(item.quantityOnHand.units).toBe(7);
    expect(item.newMovements).toHaveLength(2);
    const events = item.pullDomainEvents();
    expect(events[0]).toBeInstanceOf(StockAdjusted);
  });

  it('should throw AdjustmentNoteRequiredError for a blank note', () => {
    const item = buildItem();

    expect(() =>
      item.adjustDown({
        quantity: 1,
        actorUserId: ACTOR_ID,
        note: '',
        movementId: movementId('3'),
        now: NOW,
      }),
    ).toThrow(AdjustmentNoteRequiredError);
  });

  it('should throw AdjustmentNoteRequiredError for a whitespace-only note', () => {
    const item = buildItem();

    expect(() =>
      item.adjustDown({
        quantity: 1,
        actorUserId: ACTOR_ID,
        note: '   ',
        movementId: movementId('4'),
        now: NOW,
      }),
    ).toThrow(AdjustmentNoteRequiredError);
  });

  it('should propagate InsufficientStockError when adjustDown would go below zero, leaving the count unchanged', () => {
    const item = buildItem();
    item.replenish({
      quantity: 5,
      unitPrice: Money.fromCents(2500),
      actorUserId: ACTOR_ID,
      movementId: movementId('1'),
      now: NOW,
    });

    expect(() =>
      item.adjustDown({
        quantity: 6,
        actorUserId: ACTOR_ID,
        note: 'nota',
        movementId: movementId('5'),
        now: NOW,
      }),
    ).toThrow(InsufficientStockError);
    expect(item.quantityOnHand.units).toBe(5);
  });

  it('should leave newMovements untouched when adjustDown would go below zero', () => {
    const item = buildItem();
    item.replenish({
      quantity: 5,
      unitPrice: Money.fromCents(2500),
      actorUserId: ACTOR_ID,
      movementId: movementId('1'),
      now: NOW,
    });

    expect(() =>
      item.adjustDown({
        quantity: 6,
        actorUserId: ACTOR_ID,
        note: 'nota',
        movementId: movementId('5'),
        now: NOW,
      }),
    ).toThrow(InsufficientStockError);
    expect(item.newMovements).toHaveLength(1);
  });

  it('should return the same movements when newMovements is read twice (non-draining)', () => {
    const item = buildItem();
    item.replenish({
      quantity: 5,
      unitPrice: Money.fromCents(2500),
      actorUserId: ACTOR_ID,
      movementId: movementId('1'),
      now: NOW,
    });

    const first = item.newMovements;
    const second = item.newMovements;

    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
    expect(second[0].id.equals(first[0].id)).toBe(true);
  });

  it('should define InvalidSkuError, SkuAlreadyInUseError, InventoryItemNotFoundError, InvalidMovementQuantityError, AdjustmentNoteRequiredError and InsufficientStockError with the right ErrorKind', () => {
    expect(new InvalidSkuError().kind).toBe(ErrorKind.Validation);
    expect(new SkuAlreadyInUseError().kind).toBe(ErrorKind.Conflict);
    expect(new InventoryItemNotFoundError().kind).toBe(ErrorKind.NotFound);
    expect(new InvalidMovementQuantityError().kind).toBe(ErrorKind.Validation);
    expect(new AdjustmentNoteRequiredError().kind).toBe(ErrorKind.Validation);
    expect(new InsufficientStockError().kind).toBe(ErrorKind.RuleViolation);
  });
});
