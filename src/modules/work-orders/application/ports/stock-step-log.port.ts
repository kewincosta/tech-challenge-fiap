import { StockStep } from './pending-stock-steps.port';

export interface StockStepLog {
  /** The step reached its attempt limit and stays failed until an operator looks at it. */
  failed(step: StockStep, lastError: string): void;
}
