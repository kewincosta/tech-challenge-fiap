import { TransactionRunner } from '../../../src/shared/application/ports/transaction-runner.port';

export class FakeTransactionRunner implements TransactionRunner {
  runCalls = 0;

  async run<T>(work: () => Promise<T>): Promise<T> {
    this.runCalls += 1;
    return work();
  }
}
