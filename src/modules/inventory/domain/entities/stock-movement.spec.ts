import { describe, expect, it } from 'vitest';
import { Money } from '../../../../shared/domain/value-objects/money';
import { InvalidMovementQuantityError } from '../errors/invalid-movement-quantity.error';
import { StockMovementKind } from '../stock-movement-kind';
import { StockMovementStatus } from '../stock-movement-status';
import { StockMovementId } from '../value-objects/stock-movement-id';
import { StockMovement, StockMovementProps } from './stock-movement';

const MOVEMENT_ID = StockMovementId.create('11111111-1111-4111-8111-111111111111');
const ACTOR_ID = '22222222-2222-4222-8222-222222222222';
const NOW = new Date('2026-08-31T12:00:00.000Z');

describe('StockMovement', () => {
  it('should build an INBOUND movement carrying quantity, unit price, acting user, note and moment', () => {
    const movement = StockMovement.record({
      id: MOVEMENT_ID,
      kind: StockMovementKind.Inbound,
      quantity: 10,
      unitPrice: Money.fromCents(2500),
      actorUserId: ACTOR_ID,
      note: 'Reposicao mensal',
      now: NOW,
    });

    expect(movement.kind).toBe(StockMovementKind.Inbound);
    expect(movement.quantity).toBe(10);
    expect(movement.unitPrice.cents).toBe(2500);
    expect(movement.actorUserId).toBe(ACTOR_ID);
    expect(movement.note).toBe('Reposicao mensal');
    expect(movement.occurredAt).toBe(NOW);
  });

  it('should build an ADJUSTMENT movement with the given kind', () => {
    const movement = StockMovement.record({
      id: MOVEMENT_ID,
      kind: StockMovementKind.Adjustment,
      quantity: 3,
      unitPrice: Money.fromCents(2500),
      actorUserId: ACTOR_ID,
      note: 'Contagem divergente',
      now: NOW,
    });

    expect(movement.kind).toBe(StockMovementKind.Adjustment);
  });

  it('should reject a zero quantity', () => {
    expect(() =>
      StockMovement.record({
        id: MOVEMENT_ID,
        kind: StockMovementKind.Inbound,
        quantity: 0,
        unitPrice: Money.fromCents(2500),
        actorUserId: ACTOR_ID,
        now: NOW,
      }),
    ).toThrow(InvalidMovementQuantityError);
  });

  it('should reject a negative quantity', () => {
    expect(() =>
      StockMovement.record({
        id: MOVEMENT_ID,
        kind: StockMovementKind.Adjustment,
        quantity: -1,
        unitPrice: Money.fromCents(2500),
        actorUserId: ACTOR_ID,
        note: 'nota',
        now: NOW,
      }),
    ).toThrow(InvalidMovementQuantityError);
  });

  it('should reject a fractional quantity', () => {
    expect(() =>
      StockMovement.record({
        id: MOVEMENT_ID,
        kind: StockMovementKind.Inbound,
        quantity: 1.5,
        unitPrice: Money.fromCents(2500),
        actorUserId: ACTOR_ID,
        now: NOW,
      }),
    ).toThrow(InvalidMovementQuantityError);
  });

  it('should record an INBOUND or ADJUSTMENT with status null and workOrderId null', () => {
    const inbound = StockMovement.record({
      id: MOVEMENT_ID,
      kind: StockMovementKind.Inbound,
      quantity: 5,
      unitPrice: Money.fromCents(2500),
      actorUserId: ACTOR_ID,
      now: NOW,
    });
    const adjustment = StockMovement.record({
      id: MOVEMENT_ID,
      kind: StockMovementKind.Adjustment,
      quantity: 5,
      unitPrice: Money.fromCents(2500),
      actorUserId: ACTOR_ID,
      note: 'nota',
      now: NOW,
    });

    expect(inbound.status).toBeNull();
    expect(inbound.workOrderId).toBeNull();
    expect(adjustment.status).toBeNull();
    expect(adjustment.workOrderId).toBeNull();
  });

  it('should rebuild a movement from persisted props via restore', () => {
    const props: StockMovementProps = {
      id: MOVEMENT_ID,
      kind: StockMovementKind.Consumption,
      quantity: 2,
      unitPrice: Money.fromCents(1000),
      actorUserId: ACTOR_ID,
      note: 'nota',
      occurredAt: NOW,
      status: StockMovementStatus.Pending,
      workOrderId: '33333333-3333-4333-8333-333333333333',
      undoesMovementId: null,
    };

    const movement = StockMovement.restore(props);

    expect(movement.id).toBe(MOVEMENT_ID);
    expect(movement.kind).toBe(StockMovementKind.Consumption);
    expect(movement.status).toBe(StockMovementStatus.Pending);
    expect(movement.workOrderId).toBe(props.workOrderId);
  });
});
