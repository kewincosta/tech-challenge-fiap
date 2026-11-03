import { describe, expect, it } from 'vitest';
import {
  ConfirmConsumptionCommand,
  ConfirmConsumptionUseCase,
  ConsumeStockBatchCommand,
  ConsumeStockBatchUseCase,
  RestoreStockBatchCommand,
  RestoreStockBatchUseCase,
  SettleStockMovementsCommand,
  SettleStockMovementsUseCase,
  UndoConsumptionCommand,
  UndoConsumptionUseCase,
  WriteOffStockMovementsCommand,
  WriteOffStockMovementsUseCase,
} from '../../../inventory';
import { StockLedgerGateway } from './stock-ledger.gateway';

const WORK_ORDER_ID = '11111111-1111-4111-8111-111111111111';
const ITEM_ID = '77777777-7777-4777-8777-777777777777';
const ACTOR_ID = '55555555-5555-4555-8555-555555555555';
const OPERATION_ID = '88888888-8888-4888-8888-888888888888';
const LINES = [{ inventoryItemId: ITEM_ID, quantity: 2 }];

interface Received {
  consume: unknown[];
  restore: unknown[];
  undo: unknown[];
  confirm: unknown[];
  settle: unknown[];
  writeOff: unknown[];
}

// The gateway uses only `execute` of the inventory module's six stock use cases. Each stand-in
// keeps what it was handed, so a gateway that sends a command to the wrong use case shows up as
// state, and `failure` makes every one of them reject like inventory does when stock falls short.
function gatewayOver(failure?: Error): { gateway: StockLedgerGateway; received: Received } {
  const received: Received = {
    consume: [],
    restore: [],
    undo: [],
    confirm: [],
    settle: [],
    writeOff: [],
  };
  const standIn = (into: unknown[]) => ({
    execute: (command: unknown) => {
      into.push(command);
      return failure ? Promise.reject(failure) : Promise.resolve();
    },
  });
  const gateway = new StockLedgerGateway(
    standIn(received.consume) as unknown as ConsumeStockBatchUseCase,
    standIn(received.restore) as unknown as RestoreStockBatchUseCase,
    standIn(received.settle) as unknown as SettleStockMovementsUseCase,
    standIn(received.writeOff) as unknown as WriteOffStockMovementsUseCase,
    standIn(received.undo) as unknown as UndoConsumptionUseCase,
    standIn(received.confirm) as unknown as ConfirmConsumptionUseCase,
  );
  return { gateway, received };
}

describe('StockLedgerGateway', () => {
  it('should hand the lines, the work order, the actor and the operation id of a withdrawal to the consume use case alone', async () => {
    const { gateway, received } = gatewayOver();

    await gateway.consume(WORK_ORDER_ID, LINES, ACTOR_ID, OPERATION_ID);

    expect(received).toStrictEqual({
      consume: [new ConsumeStockBatchCommand(LINES, WORK_ORDER_ID, ACTOR_ID, OPERATION_ID)],
      restore: [],
      undo: [],
      confirm: [],
      settle: [],
      writeOff: [],
    });
  });

  it('should hand the lines, the work order, the actor and the operation id of a return to the restore use case alone', async () => {
    const { gateway, received } = gatewayOver();

    await gateway.restore(WORK_ORDER_ID, LINES, ACTOR_ID, OPERATION_ID);

    expect(received).toStrictEqual({
      consume: [],
      restore: [new RestoreStockBatchCommand(LINES, WORK_ORDER_ID, ACTOR_ID, OPERATION_ID)],
      undo: [],
      confirm: [],
      settle: [],
      writeOff: [],
    });
  });

  it('should hand the operation id and the actor of an undo to the undo use case alone', async () => {
    const { gateway, received } = gatewayOver();

    await gateway.undoConsumption(OPERATION_ID, ACTOR_ID);

    expect(received).toStrictEqual({
      consume: [],
      restore: [],
      undo: [new UndoConsumptionCommand(OPERATION_ID, ACTOR_ID)],
      confirm: [],
      settle: [],
      writeOff: [],
    });
  });

  it('should hand the operation id and the actor of a confirmation to the confirm use case alone', async () => {
    const { gateway, received } = gatewayOver();

    await gateway.confirmConsumption(OPERATION_ID, ACTOR_ID);

    expect(received).toStrictEqual({
      consume: [],
      restore: [],
      undo: [],
      confirm: [new ConfirmConsumptionCommand(OPERATION_ID, ACTOR_ID)],
      settle: [],
      writeOff: [],
    });
  });

  it('should hand the work order and the actor of a delivery to the settle use case alone', async () => {
    const { gateway, received } = gatewayOver();

    await gateway.settle(WORK_ORDER_ID, ACTOR_ID);

    expect(received).toStrictEqual({
      consume: [],
      restore: [],
      undo: [],
      confirm: [],
      settle: [new SettleStockMovementsCommand(WORK_ORDER_ID, ACTOR_ID)],
      writeOff: [],
    });
  });

  it('should hand the work order and the actor of a cancellation to the write-off use case alone', async () => {
    const { gateway, received } = gatewayOver();

    await gateway.writeOff(WORK_ORDER_ID, ACTOR_ID);

    expect(received).toStrictEqual({
      consume: [],
      restore: [],
      undo: [],
      confirm: [],
      settle: [],
      writeOff: [new WriteOffStockMovementsCommand(WORK_ORDER_ID, ACTOR_ID)],
    });
  });

  it.each([
    [
      'consume',
      (gateway: StockLedgerGateway) =>
        gateway.consume(WORK_ORDER_ID, LINES, ACTOR_ID, OPERATION_ID),
    ],
    [
      'restore',
      (gateway: StockLedgerGateway) =>
        gateway.restore(WORK_ORDER_ID, LINES, ACTOR_ID, OPERATION_ID),
    ],
    [
      'undoConsumption',
      (gateway: StockLedgerGateway) => gateway.undoConsumption(OPERATION_ID, ACTOR_ID),
    ],
    [
      'confirmConsumption',
      (gateway: StockLedgerGateway) => gateway.confirmConsumption(OPERATION_ID, ACTOR_ID),
    ],
    ['settle', (gateway: StockLedgerGateway) => gateway.settle(WORK_ORDER_ID, ACTOR_ID)],
    ['writeOff', (gateway: StockLedgerGateway) => gateway.writeOff(WORK_ORDER_ID, ACTOR_ID)],
  ])('should let the error of the inventory module through on %s', async (_operation, call) => {
    const failure = new Error('not enough stock');
    const { gateway } = gatewayOver(failure);

    await expect(call(gateway)).rejects.toBe(failure);
  });
});
