import { describe, expect, it } from 'vitest';
import {
  ConsumeStockBatchCommand,
  ConsumeStockBatchUseCase,
  RestoreStockBatchCommand,
  RestoreStockBatchUseCase,
  SettleStockMovementsCommand,
  SettleStockMovementsUseCase,
  WriteOffStockMovementsCommand,
  WriteOffStockMovementsUseCase,
} from '../../../inventory';
import { StockLedgerGateway } from './stock-ledger.gateway';

const WORK_ORDER_ID = '11111111-1111-4111-8111-111111111111';
const ITEM_ID = '77777777-7777-4777-8777-777777777777';
const ACTOR_ID = '55555555-5555-4555-8555-555555555555';
const LINES = [{ inventoryItemId: ITEM_ID, quantity: 2 }];

interface Received {
  consume: unknown[];
  restore: unknown[];
  settle: unknown[];
  writeOff: unknown[];
}

// The gateway uses only `execute` of the inventory module's four stock use cases. Each stand-in
// keeps what it was handed, so a gateway that sends a command to the wrong use case shows up as
// state, and `failure` makes every one of them reject like inventory does when stock falls short.
function gatewayOver(failure?: Error): { gateway: StockLedgerGateway; received: Received } {
  const received: Received = { consume: [], restore: [], settle: [], writeOff: [] };
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
  );
  return { gateway, received };
}

describe('StockLedgerGateway', () => {
  it('should hand the lines, the work order and the actor of a withdrawal to the consume use case alone', async () => {
    const { gateway, received } = gatewayOver();

    await gateway.consume(WORK_ORDER_ID, LINES, ACTOR_ID);

    expect(received).toStrictEqual({
      consume: [new ConsumeStockBatchCommand(LINES, WORK_ORDER_ID, ACTOR_ID)],
      restore: [],
      settle: [],
      writeOff: [],
    });
  });

  it('should hand the lines, the work order and the actor of a return to the restore use case alone', async () => {
    const { gateway, received } = gatewayOver();

    await gateway.restore(WORK_ORDER_ID, LINES, ACTOR_ID);

    expect(received).toStrictEqual({
      consume: [],
      restore: [new RestoreStockBatchCommand(LINES, WORK_ORDER_ID, ACTOR_ID)],
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
      settle: [],
      writeOff: [new WriteOffStockMovementsCommand(WORK_ORDER_ID, ACTOR_ID)],
    });
  });

  it.each([
    ['consume', (gateway: StockLedgerGateway) => gateway.consume(WORK_ORDER_ID, LINES, ACTOR_ID)],
    ['restore', (gateway: StockLedgerGateway) => gateway.restore(WORK_ORDER_ID, LINES, ACTOR_ID)],
    ['settle', (gateway: StockLedgerGateway) => gateway.settle(WORK_ORDER_ID, ACTOR_ID)],
    ['writeOff', (gateway: StockLedgerGateway) => gateway.writeOff(WORK_ORDER_ID, ACTOR_ID)],
  ])('should let the error of the inventory module through on %s', async (_operation, call) => {
    const failure = new Error('not enough stock');
    const { gateway } = gatewayOver(failure);

    await expect(call(gateway)).rejects.toBe(failure);
  });
});
