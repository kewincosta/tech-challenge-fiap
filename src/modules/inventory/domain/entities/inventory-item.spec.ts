import { describe, expect, it } from 'vitest';
import { Money } from '../../../../shared/domain/value-objects/money';
import { AdjustmentNoteRequiredError } from '../errors/adjustment-note-required.error';
import { InsufficientStockError } from '../errors/insufficient-stock.error';
import { InventoryItemInUseError } from '../errors/inventory-item-in-use.error';
import { InventoryItemNotFoundError } from '../errors/inventory-item-not-found.error';
import { InvalidMovementQuantityError } from '../errors/invalid-movement-quantity.error';
import { InvalidSkuError } from '../errors/invalid-sku.error';
import { SkuAlreadyInUseError } from '../errors/sku-already-in-use.error';
import { InventoryItemCreated } from '../events/inventory-item-created.event';
import { InventoryItemDeactivated } from '../events/inventory-item-deactivated.event';
import { InventoryItemUpdated } from '../events/inventory-item-updated.event';
import { StockAdjusted } from '../events/stock-adjusted.event';
import { StockReplenished } from '../events/stock-replenished.event';
import { InventoryItemKind } from '../inventory-item-kind';
import { InventoryItemStatus } from '../inventory-item-status';
import { ErrorKind } from '../../../../shared/domain/errors/error-kind';
import { StockMovementKind } from '../stock-movement-kind';
import { StockMovementStatus } from '../stock-movement-status';
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

const WORK_ORDER_ID = '44444444-4444-4444-8444-444444444444';

function buildStockedItem(unitPriceCents = 2500): InventoryItem {
  const item = InventoryItem.create({
    id: ITEM_ID,
    sku: Sku.create('FLT-001'),
    name: 'Filtro de oleo',
    description: 'Filtro padrao',
    kind: InventoryItemKind.Part,
    unitPrice: Money.fromCents(unitPriceCents),
    now: NOW,
  });
  item.replenish({
    quantity: 10,
    unitPrice: Money.fromCents(unitPriceCents),
    actorUserId: ACTOR_ID,
    note: 'Estoque inicial',
    movementId: movementId('1'),
    now: NOW,
  });
  return item;
}

describe('InventoryItem.deactivate', () => {
  it('should flip the status to INACTIVE and record InventoryItemDeactivated', () => {
    const item = buildItem();
    item.pullDomainEvents();

    item.deactivate(NOW);

    expect(item.status).toBe(InventoryItemStatus.Inactive);
    const events = item.pullDomainEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toBeInstanceOf(InventoryItemDeactivated);
  });

  it('should record nothing on a second call, the record staying INACTIVE', () => {
    const item = buildItem();
    item.deactivate(NOW);
    item.pullDomainEvents();

    item.deactivate(new Date('2026-09-01T12:00:00.000Z'));

    expect(item.status).toBe(InventoryItemStatus.Inactive);
    expect(item.pullDomainEvents()).toHaveLength(0);
  });

  it('should leave the quantity on hand and the movements alone - only a movement moves the count', () => {
    const item = buildItem();
    item.replenish({
      quantity: 10,
      unitPrice: Money.fromCents(2500),
      actorUserId: ACTOR_ID,
      movementId: movementId('1'),
      now: NOW,
    });

    item.deactivate(NOW);

    expect(item.quantityOnHand.units).toBe(10);
    expect(item.newMovements).toHaveLength(1);
  });

  it('should define InventoryItemInUseError as a CONFLICT carrying the blocking work orders', () => {
    const error = new InventoryItemInUseError(['A1B090-2026']);

    expect(error.kind).toBe(ErrorKind.Conflict);
    expect(error.code).toBe('INVENTORY_ITEM_IN_USE');
    expect(error.workOrderNumbers).toEqual(['A1B090-2026']);
  });
});

describe('InventoryItem.consume and restoreUnits', () => {
  it('should lower the count and append a CONSUMPTION movement in PENDING, carrying the work order', () => {
    const item = buildStockedItem();

    item.consume({
      quantity: 3,
      workOrderId: WORK_ORDER_ID,
      actorUserId: ACTOR_ID,
      movementId: movementId('2'),
      now: NOW,
    });

    expect(item.quantityOnHand.units).toBe(7);
    const movement = item.newMovements.find((candidate) => candidate.kind === StockMovementKind.Consumption);
    expect(movement?.status).toBe(StockMovementStatus.Pending);
    expect(movement?.workOrderId).toBe(WORK_ORDER_ID);
    expect(movement?.quantity).toBe(3);
  });

  it("should write the item's own catalog price on the consumption, not a price the caller supplies", () => {
    const item = buildStockedItem(2500);

    item.consume({
      quantity: 1,
      workOrderId: WORK_ORDER_ID,
      actorUserId: ACTOR_ID,
      movementId: movementId('2'),
      now: NOW,
    });

    const movement = item.newMovements.find((candidate) => candidate.kind === StockMovementKind.Consumption);
    expect(movement?.unitPrice.cents).toBe(2500);
  });

  it('should refuse a quantity larger than the count on hand with InsufficientStockError, leaving the count and newMovements unchanged', () => {
    const item = buildStockedItem();
    const before = item.newMovements.length;

    expect(() =>
      item.consume({
        quantity: 11,
        workOrderId: WORK_ORDER_ID,
        actorUserId: ACTOR_ID,
        movementId: movementId('2'),
        now: NOW,
      }),
    ).toThrow(InsufficientStockError);
    expect(item.quantityOnHand.units).toBe(10);
    expect(item.newMovements).toHaveLength(before);
  });

  it('should raise the count and append a RETURN movement pointing at the consumption it undoes', () => {
    const item = buildStockedItem();
    item.consume({
      quantity: 3,
      workOrderId: WORK_ORDER_ID,
      actorUserId: ACTOR_ID,
      movementId: movementId('2'),
      now: NOW,
    });
    const consumptionId = item.newMovements[1].id.value;

    item.restoreUnits({
      quantity: 1,
      workOrderId: WORK_ORDER_ID,
      actorUserId: ACTOR_ID,
      movementId: movementId('3'),
      undoesMovementId: consumptionId,
      now: NOW,
    });

    expect(item.quantityOnHand.units).toBe(8);
    const returnMovement = item.newMovements.find((candidate) => candidate.kind === StockMovementKind.Return);
    expect(returnMovement?.undoesMovementId).toBe(consumptionId);
    expect(returnMovement?.status).toBeNull();
  });

  it('should never edit the original consumption when a return is registered', () => {
    const item = buildStockedItem();
    item.consume({
      quantity: 3,
      workOrderId: WORK_ORDER_ID,
      actorUserId: ACTOR_ID,
      movementId: movementId('2'),
      now: NOW,
    });
    const consumption = item.newMovements[1];

    item.restoreUnits({
      quantity: 1,
      workOrderId: WORK_ORDER_ID,
      actorUserId: ACTOR_ID,
      movementId: movementId('3'),
      undoesMovementId: consumption.id.value,
      now: NOW,
    });

    const stillThere = item.newMovements.find((candidate) => candidate.id.equals(consumption.id));
    expect(stillThere?.status).toBe(StockMovementStatus.Pending);
    expect(stillThere?.quantity).toBe(3);
  });

  it('should end a withdraw-then-return-in-full round trip at the starting count, with three movements on the ledger', () => {
    const item = buildStockedItem();
    item.consume({
      quantity: 3,
      workOrderId: WORK_ORDER_ID,
      actorUserId: ACTOR_ID,
      movementId: movementId('2'),
      now: NOW,
    });
    const consumptionId = item.newMovements[1].id.value;

    item.restoreUnits({
      quantity: 3,
      workOrderId: WORK_ORDER_ID,
      actorUserId: ACTOR_ID,
      movementId: movementId('3'),
      undoesMovementId: consumptionId,
      now: NOW,
    });

    expect(item.quantityOnHand.units).toBe(10);
    expect(item.newMovements).toHaveLength(3);
  });
});
