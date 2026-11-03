import { Clock } from '../../../src/shared/application/ports/clock.port';
import {
  ClaimedStockStep,
  PendingStockSteps,
  StockStep,
} from '../../../src/modules/work-orders/application/ports/pending-stock-steps.port';

export type FakeStepStatus = 'ARMED' | 'PENDING' | 'DONE' | 'FAILED';

export interface StoredStockStep {
  step: StockStep;
  status: FakeStepStatus;
  attempts: number;
  dueAt: Date;
  lastError: string | null;
}

/**
 * Keeps the outbox in memory with the states and the claims the database adapter has: a claim
 * counts the attempt and pushes the due time to the end of the lease, and a step is claimed only
 * while it is armed or pending and due.
 */
export class FakePendingStockSteps implements PendingStockSteps {
  /** Every step, by operation id. */
  readonly stored = new Map<string, StoredStockStep>();

  constructor(private readonly clock: Clock) {}

  /** Puts a step in the outbox as it would be after earlier attempts. Due now and pending by default. */
  seed(step: StockStep, state: Partial<Omit<StoredStockStep, 'step'>> = {}): this {
    this.stored.set(step.operationId, {
      step,
      status: 'PENDING',
      attempts: 0,
      dueAt: this.clock.now(),
      lastError: null,
      ...state,
    });
    return this;
  }

  stateOf(operationId: string): StoredStockStep {
    const stored = this.stored.get(operationId);
    if (!stored) {
      throw new Error(`No step with operation id ${operationId}`);
    }
    return stored;
  }

  async arm(step: StockStep, dueAt: Date): Promise<void> {
    this.seed(step, { status: 'ARMED', dueAt });
    return Promise.resolve();
  }

  async enqueue(step: StockStep): Promise<void> {
    this.seed(step);
    return Promise.resolve();
  }

  async disarm(operationId: string): Promise<boolean> {
    const stored = this.stored.get(operationId);
    if (stored?.status !== 'ARMED') {
      return Promise.resolve(false);
    }
    stored.status = 'DONE';
    return Promise.resolve(true);
  }

  async complete(operationId: string): Promise<void> {
    const stored = this.stored.get(operationId);
    if (stored && (stored.status === 'ARMED' || stored.status === 'PENDING')) {
      stored.status = 'DONE';
    }
    return Promise.resolve();
  }

  async release(operationId: string): Promise<void> {
    const stored = this.stored.get(operationId);
    if (stored?.status === 'ARMED') {
      stored.status = 'PENDING';
      stored.dueAt = this.clock.now();
    }
    return Promise.resolve();
  }

  async claimDue(
    now: Date,
    limit: number,
    leaseUntil: Date,
    operationIds?: string[],
  ): Promise<ClaimedStockStep[]> {
    const claimed = [...this.stored.values()]
      .filter(
        (stored) =>
          (stored.status === 'ARMED' || stored.status === 'PENDING') &&
          stored.dueAt.getTime() <= now.getTime() &&
          (operationIds === undefined || operationIds.includes(stored.step.operationId)),
      )
      .sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime())
      .slice(0, limit);
    for (const stored of claimed) {
      stored.status = 'PENDING';
      stored.attempts += 1;
      stored.dueAt = leaseUntil;
    }
    return Promise.resolve(
      claimed.map((stored) => ({ ...stored.step, attempts: stored.attempts })),
    );
  }

  async recordFailure(operationId: string, error: string, nextDueAt: Date): Promise<void> {
    const stored = this.stored.get(operationId);
    if (stored && (stored.status === 'ARMED' || stored.status === 'PENDING')) {
      stored.lastError = error;
      stored.dueAt = nextDueAt;
    }
    return Promise.resolve();
  }

  async markFailed(operationId: string, error: string): Promise<void> {
    const stored = this.stored.get(operationId);
    if (stored && (stored.status === 'ARMED' || stored.status === 'PENDING')) {
      stored.status = 'FAILED';
      stored.lastError = error;
    }
    return Promise.resolve();
  }
}
