import { describe, expect, it } from 'vitest';
import { InvalidMoneyAmountError } from '../errors/invalid-money-amount.error';
import { Money } from './money';

describe('Money', () => {
  it('creates from cents and exposes the same integer value', () => {
    const money = Money.fromCents(15099);

    expect(money.cents).toBe(15099);
  });

  it('rejects a negative amount', () => {
    expect(() => Money.fromCents(-1)).toThrow(InvalidMoneyAmountError);
  });

  it('rejects a fractional amount', () => {
    expect(() => Money.fromCents(10.5)).toThrow(InvalidMoneyAmountError);
  });

  it('accepts zero', () => {
    const money = Money.fromCents(0);

    expect(money.cents).toBe(0);
  });

  it('converts a bigint string from the database into the amount that was written', () => {
    const money = Money.fromDatabase('123456');

    expect(money.cents).toBe(123456);
  });

  it('adds two amounts to an exact integer sum with no floating point drift', () => {
    const total = Money.fromCents(10).add(Money.fromCents(20));

    expect(total.cents).toBe(30);
  });

  it('subtracts one amount from another to an exact integer difference', () => {
    const remainder = Money.fromCents(500).subtract(Money.fromCents(150));

    expect(remainder.cents).toBe(350);
  });

  it('rejects a subtraction that would leave a negative amount', () => {
    expect(() => Money.fromCents(100).subtract(Money.fromCents(150))).toThrow(
      InvalidMoneyAmountError,
    );
  });

  it('multiplies an amount by a quantity to an exact integer product', () => {
    const total = Money.fromCents(250).multiply(3);

    expect(total.cents).toBe(750);
  });

  it('reports true when this amount is greater than another', () => {
    expect(Money.fromCents(200).isGreaterThan(Money.fromCents(100))).toBe(true);
  });

  it('reports false when this amount is not greater than another', () => {
    expect(Money.fromCents(100).isGreaterThan(Money.fromCents(100))).toBe(false);
    expect(Money.fromCents(50).isGreaterThan(Money.fromCents(100))).toBe(false);
  });

  it('reports equality only between amounts with the same cents value', () => {
    expect(Money.fromCents(100).equals(Money.fromCents(100))).toBe(true);
    expect(Money.fromCents(100).equals(Money.fromCents(200))).toBe(false);
    expect(Money.fromCents(100).equals(undefined)).toBe(false);
  });
});
