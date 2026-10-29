import { TransactionRunner } from '../../../src/shared/application/ports/transaction-runner.port';

export class FakeTransactionRunner implements TransactionRunner {
  runCalls = 0;
  private depth = 0;

  /** True while the work handed to `run` is executing. */
  get active(): boolean {
    return this.depth > 0;
  }

  async run<T>(work: () => Promise<T>): Promise<T> {
    this.runCalls += 1;
    this.depth += 1;
    try {
      return await work();
    } finally {
      this.depth -= 1;
    }
  }
}
