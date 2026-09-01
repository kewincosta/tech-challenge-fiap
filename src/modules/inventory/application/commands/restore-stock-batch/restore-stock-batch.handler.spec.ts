import { describe, expect, it } from 'vitest';
import { stubEventBus } from '../../../../../../test/support/fakes/bus.stubs';
import { FakeClock } from '../../../../../../test/support/fakes/fake-clock';
import { FakeIdGenerator } from '../../../../../../test/support/fakes/fake-id-generator';
import { InMemoryInventoryItemRepository } from '../../../../../../test/support/fakes/in-memory-inventory-item.repository';
import { Money } from '../../../../../shared/domain/value-objects/money';
import { InventoryItem } from '../../../domain/entities/inventory-item';
import { InventoryItemNotFoundError } from '../../../domain/errors/inventory-item-not-found.error';
import { InventoryItemKind } from '../../../domain/inventory-item-kind';
import { StockMovementKind } from '../../../domain/stock-movement-kind';
import { InventoryItemId } from '../../../domain/value-objects/inventory-item-id';
import { Sku } from '../../../domain/value-objects/sku';
import { StockMovementId } from '../../../domain/value-objects/stock-movement-id';
import { RestoreStockBatchCommand } from './restore-stock-batch.command';
import { RestoreStockBatchHandler } from './restore-stock-batch.handler';

const ITEM_A_ID = '11111111-1111-4111-8111-111111111111';
const ITEM_B_ID = '22222222-2222-4222-8222-222222222222';
const ACTOR_ID = '33333333-3333-4333-8333-333333333333';
const WORK_ORDER_ID = '44444444-4444-4444-8444-444444444444';
const CONSUMPTION_A_ID = '55555555-5555-4555-8555-555555555555';
const CONSUMPTION_B_ID = '66666666-6666-4666-8666-666666666666';

function buildItemWithConsumption(id: string, consumedMovementId: string): InventoryItem {
  const item = InventoryItem.create({
    id: InventoryItemId.create(id),
    sku: Sku.create('FLT-001'),
    name: 'Filtro de oleo',
    kind: InventoryItemKind.Part,
    unitPrice: Money.fromCents(2500),
    now: new Date(),
  });
  item.replenish({
    quantity: 5,
    unitPrice: Money.fromCents(2500),
    actorUserId: ACTOR_ID,
    movementId: StockMovementId.create('77777777-7777-4777-8777-777777777777'),
    now: new Date(),
  });
  item.consume({
    quantity: 2,
    workOrderId: WORK_ORDER_ID,
    actorUserId: ACTOR_ID,
    movementId: StockMovementId.create(consumedMovementId),
    now: new Date(),
  });
  item.pullDomainEvents();
  return item;
}

function makeHandler() {
  const items = new InMemoryInventoryItemRepository();
  const eventBus = stubEventBus();
  const handler = new RestoreStockBatchHandler(
    items,
    new FakeIdGenerator(),
    new FakeClock(),
    eventBus.bus,
  );
  return { handler, items, eventBus };
}

describe('RestoreStockBatchHandler', () => {
  it('applies one restoration per line, each naming the consumption it undoes', async () => {
    const { handler, items } = makeHandler();
    await items.save(buildItemWithConsumption(ITEM_A_ID, CONSUMPTION_A_ID));
    await items.save(buildItemWithConsumption(ITEM_B_ID, CONSUMPTION_B_ID));

    await handler.execute(
      new RestoreStockBatchCommand(
        [
          { inventoryItemId: ITEM_A_ID, quantity: 1, undoesMovementId: CONSUMPTION_A_ID },
          { inventoryItemId: ITEM_B_ID, quantity: 2, undoesMovementId: CONSUMPTION_B_ID },
        ],
        WORK_ORDER_ID,
        ACTOR_ID,
      ),
    );

    const updatedA = items.items.find((item) => item.id.value === ITEM_A_ID);
    const updatedB = items.items.find((item) => item.id.value === ITEM_B_ID);
    expect(updatedA?.quantityOnHand.units).toBe(4);
    expect(updatedB?.quantityOnHand.units).toBe(5);
    const returnA = updatedA?.newMovements.find((movement) => movement.kind === StockMovementKind.Return);
    const returnB = updatedB?.newMovements.find((movement) => movement.kind === StockMovementKind.Return);
    expect(returnA?.undoesMovementId).toBe(CONSUMPTION_A_ID);
    expect(returnB?.undoesMovementId).toBe(CONSUMPTION_B_ID);
  });

  it("never edits the original consumption - restoreUnits only ever appends a RETURN, never touches a prior movement's own props", async () => {
    const { handler, items } = makeHandler();
    const original = buildItemWithConsumption(ITEM_A_ID, CONSUMPTION_A_ID);
    const originalConsumption = original.newMovements.find(
      (movement) => movement.id.value === CONSUMPTION_A_ID,
    );
    await items.save(original);

    await handler.execute(
      new RestoreStockBatchCommand(
        [{ inventoryItemId: ITEM_A_ID, quantity: 1, undoesMovementId: CONSUMPTION_A_ID }],
        WORK_ORDER_ID,
        ACTOR_ID,
      ),
    );

    // The handler loads a fresh item that carries no movements at all (they are a read model,
    // never part of this aggregate) - so the strongest unit-level proof is that the very object
    // this test captured before the handler ran is still exactly as it was.
    expect(originalConsumption?.quantity).toBe(2);
    expect(originalConsumption?.status).toBe('PENDING');
    const updated = items.items.find((item) => item.id.value === ITEM_A_ID);
    const returnMovement = updated?.newMovements.find(
      (movement) => movement.kind === StockMovementKind.Return,
    );
    expect(returnMovement?.id.value).not.toBe(CONSUMPTION_A_ID);
  });

  it('refuses with InventoryItemNotFoundError when an addressed id matches no item', async () => {
    const { handler, items } = makeHandler();
    await items.save(buildItemWithConsumption(ITEM_A_ID, CONSUMPTION_A_ID));

    await expect(
      handler.execute(
        new RestoreStockBatchCommand(
          [{ inventoryItemId: ITEM_B_ID, quantity: 1, undoesMovementId: CONSUMPTION_A_ID }],
          WORK_ORDER_ID,
          ACTOR_ID,
        ),
      ),
    ).rejects.toThrow(InventoryItemNotFoundError);
  });

  it('saves nothing when a later line in the batch is refused', async () => {
    const { handler, items } = makeHandler();
    await items.save(buildItemWithConsumption(ITEM_A_ID, CONSUMPTION_A_ID));

    await expect(
      handler.execute(
        new RestoreStockBatchCommand(
          [
            { inventoryItemId: ITEM_A_ID, quantity: 1, undoesMovementId: CONSUMPTION_A_ID },
            { inventoryItemId: ITEM_B_ID, quantity: 1, undoesMovementId: CONSUMPTION_B_ID },
          ],
          WORK_ORDER_ID,
          ACTOR_ID,
        ),
      ),
    ).rejects.toThrow(InventoryItemNotFoundError);

    const untouchedA = items.items.find((item) => item.id.value === ITEM_A_ID);
    expect(untouchedA?.quantityOnHand.units).toBe(3);
  });
});
