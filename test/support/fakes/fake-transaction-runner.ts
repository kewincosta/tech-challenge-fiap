import { TransactionRunner } from '../../../src/shared/application/ports/transaction-runner.port';

export class FakeTransactionRunner implements TransactionRunner {
  runCalls = 0;
  /** Every call a watched fake received, in order, as `name.method`. */
  readonly calls: string[] = [];
  /** The calls a watched fake received while the transaction was open, in order. */
  readonly callsInside: string[] = [];
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

  /**
   * Wraps a fake so that every method call it receives is recorded in `calls`, and in
   * `callsInside` too when the transaction is open. A spec reads the two lists to see what the
   * transaction held and in what order the collaborators were reached. State and fields of the
   * fake stay readable through the wrapper.
   */
  watch<T extends object>(name: string, fake: T): T {
    return new Proxy(fake, {
      get: (target, property) => {
        const value: unknown = Reflect.get(target, property);
        if (typeof value !== 'function') {
          return value;
        }
        return (...args: unknown[]): unknown => {
          const call = `${name}.${String(property)}`;
          this.calls.push(call);
          if (this.active) {
            this.callsInside.push(call);
          }
          return (value as (...parameters: unknown[]) => unknown).apply(target, args);
        };
      },
    });
  }
}
