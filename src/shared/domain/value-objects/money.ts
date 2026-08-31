import { InvalidMoneyAmountError } from '../errors/invalid-money-amount.error';

export class Money {
  private constructor(private readonly amountInCents: number) {}

  static fromCents(cents: number): Money {
    if (!Number.isInteger(cents) || cents < 0) {
      throw new InvalidMoneyAmountError(cents);
    }
    return new Money(cents);
  }

  static fromDatabase(raw: string): Money {
    return Money.fromCents(Number(raw));
  }

  add(other: Money): Money {
    return Money.fromCents(this.amountInCents + other.amountInCents);
  }

  subtract(other: Money): Money {
    return Money.fromCents(this.amountInCents - other.amountInCents);
  }

  multiply(quantity: number): Money {
    return Money.fromCents(this.amountInCents * quantity);
  }

  isGreaterThan(other: Money): boolean {
    return this.amountInCents > other.amountInCents;
  }

  equals(other?: Money): boolean {
    return other instanceof Money && other.amountInCents === this.amountInCents;
  }

  get cents(): number {
    return this.amountInCents;
  }
}
