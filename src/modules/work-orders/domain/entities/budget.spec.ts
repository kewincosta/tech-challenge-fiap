import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { Money } from '../../../../shared/domain/value-objects/money';
import { BudgetStatus } from '../budget-status';
import { BudgetStateError } from '../errors/budget-state.error';
import { BudgetId } from '../value-objects/budget-id';
import { Budget, BudgetProps } from './budget';

function generate(overrides: Partial<Parameters<typeof Budget.generate>[0]> = {}): Budget {
  return Budget.generate({
    id: BudgetId.create(randomUUID()),
    round: 1,
    total: Money.fromCents(20099),
    generatedAt: new Date('2026-08-31T10:00:00Z'),
    ...overrides,
  });
}

describe('BudgetId', () => {
  it('refuses a non-uuid value', () => {
    expect(() => BudgetId.create('not-a-uuid')).toThrow();
  });

  it('equals compares by value', () => {
    const value = randomUUID();

    expect(BudgetId.create(value).equals(BudgetId.create(value))).toBe(true);
  });
});

describe('Budget', () => {
  it('generates a pending round with the given number, total and moment', () => {
    const id = BudgetId.create(randomUUID());
    const budget = Budget.generate({
      id,
      round: 1,
      total: Money.fromCents(20099),
      generatedAt: new Date('2026-08-31T10:00:00Z'),
    });

    expect(budget.id.equals(id)).toBe(true);
    expect(budget.round).toBe(1);
    expect(budget.total.cents).toBe(20099);
    expect(budget.status).toBe(BudgetStatus.Pending);
    expect(budget.generatedAt).toEqual(new Date('2026-08-31T10:00:00Z'));
  });

  it('carries no decision when generated', () => {
    const budget = generate();

    expect(budget.decidedAt).toBeNull();
    expect(budget.decidedByUserId).toBeNull();
  });

  it('approve marks the round approved with the decider and moment', () => {
    const budget = generate();
    const decidedAt = new Date('2026-08-31T11:00:00Z');

    budget.approve({ actorUserId: 'customer-1', at: decidedAt });

    expect(budget.status).toBe(BudgetStatus.Approved);
    expect(budget.decidedByUserId).toBe('customer-1');
    expect(budget.decidedAt).toEqual(decidedAt);
  });

  it('reject marks the round rejected with the decider and moment', () => {
    const budget = generate();
    const decidedAt = new Date('2026-08-31T11:00:00Z');

    budget.reject({ actorUserId: 'customer-1', at: decidedAt });

    expect(budget.status).toBe(BudgetStatus.Rejected);
    expect(budget.decidedByUserId).toBe('customer-1');
    expect(budget.decidedAt).toEqual(decidedAt);
  });

  it('refuses to approve a round that is not pending', () => {
    const budget = generate();
    budget.approve({ actorUserId: 'customer-1', at: new Date() });

    expect(() => budget.approve({ actorUserId: 'customer-1', at: new Date() })).toThrow(
      BudgetStateError,
    );
  });

  it('refuses to reject a round that is not pending', () => {
    const budget = generate();
    budget.reject({ actorUserId: 'customer-1', at: new Date() });

    expect(() => budget.reject({ actorUserId: 'customer-1', at: new Date() })).toThrow(
      BudgetStateError,
    );
  });

  it('regenerate resets a rejected round to pending with a new total and moment', () => {
    const budget = generate();
    budget.reject({ actorUserId: 'customer-1', at: new Date('2026-08-31T11:00:00Z') });

    budget.regenerate({
      total: Money.fromCents(30000),
      generatedAt: new Date('2026-09-01T09:00:00Z'),
    });

    expect(budget.status).toBe(BudgetStatus.Pending);
    expect(budget.total.cents).toBe(30000);
    expect(budget.generatedAt).toEqual(new Date('2026-09-01T09:00:00Z'));
  });

  it('regenerate clears the previous decision', () => {
    const budget = generate();
    budget.reject({ actorUserId: 'customer-1', at: new Date() });

    budget.regenerate({ total: Money.fromCents(30000), generatedAt: new Date() });

    expect(budget.decidedAt).toBeNull();
    expect(budget.decidedByUserId).toBeNull();
  });

  it('refuses to regenerate a round that is not rejected', () => {
    const budget = generate();

    expect(() =>
      budget.regenerate({ total: Money.fromCents(30000), generatedAt: new Date() }),
    ).toThrow(BudgetStateError);
  });

  it('refuses to regenerate an already approved round', () => {
    const budget = generate();
    budget.approve({ actorUserId: 'customer-1', at: new Date() });

    expect(() =>
      budget.regenerate({ total: Money.fromCents(30000), generatedAt: new Date() }),
    ).toThrow(BudgetStateError);
  });

  it('restore round-trips every field', () => {
    const props: BudgetProps = {
      id: BudgetId.create(randomUUID()),
      round: 2,
      total: Money.fromCents(15000),
      status: BudgetStatus.Approved,
      generatedAt: new Date('2026-08-31T10:00:00Z'),
      decidedAt: new Date('2026-08-31T12:00:00Z'),
      decidedByUserId: 'advisor-1',
    };

    const budget = Budget.restore(props);

    expect(budget.id.equals(props.id)).toBe(true);
    expect(budget.round).toBe(2);
    expect(budget.total.cents).toBe(15000);
    expect(budget.status).toBe(BudgetStatus.Approved);
    expect(budget.generatedAt).toEqual(props.generatedAt);
    expect(budget.decidedAt).toEqual(props.decidedAt);
    expect(budget.decidedByUserId).toBe('advisor-1');
  });

  it('restore round-trips a draft round with no decision', () => {
    const props: BudgetProps = {
      id: BudgetId.create(randomUUID()),
      round: 1,
      total: Money.fromCents(0),
      status: BudgetStatus.Pending,
      generatedAt: new Date(),
      decidedAt: null,
      decidedByUserId: null,
    };

    const budget = Budget.restore(props);

    expect(budget.status).toBe(BudgetStatus.Pending);
    expect(budget.decidedAt).toBeNull();
    expect(budget.decidedByUserId).toBeNull();
  });
});
