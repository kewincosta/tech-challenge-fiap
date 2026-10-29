import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { TransactionRunner } from '../../application/ports/transaction-runner.port';

// A module reaches another through a port that carries identifiers and DTOs only (AD-012), so a
// write that spans two modules, such as a withdrawal that saves the work order and then moves
// stock through the stock ledger port, cannot hand a manager across that port. AsyncLocalStorage
// carries the active transaction's EntityManager through those calls instead, so a repository or
// a key resolver in another module joins the same Postgres transaction without either module
// knowing about the other's persistence details.
const transactionContext = new AsyncLocalStorage<EntityManager>();

/**
 * The EntityManager bound to the transaction currently open on this async context, or undefined
 * outside a TypeOrmTransactionRunner.run() call. Repositories that must be able to join a shared
 * transaction check this first and fall back to their own injected repository otherwise.
 */
export function currentEntityManager(): EntityManager | undefined {
  return transactionContext.getStore();
}

/**
 * Opens a transaction on `dataSource` and publishes its manager as the ambient one while `work`
 * runs, which is what `TypeOrmTransactionRunner.run` does for a use case. A repository that finds
 * no ambient transaction opens its own through this function, so the key resolvers and the other
 * modules' reads it calls inside `work` join that transaction and take no second pool connection.
 */
export function runInNewTransaction<T>(
  dataSource: DataSource,
  work: (manager: EntityManager) => Promise<T>,
): Promise<T> {
  return dataSource.transaction((manager) => transactionContext.run(manager, () => work(manager)));
}

@Injectable()
export class TypeOrmTransactionRunner implements TransactionRunner {
  constructor(private readonly dataSource: DataSource) {}

  run<T>(work: () => Promise<T>): Promise<T> {
    return runInNewTransaction(this.dataSource, () => work());
  }
}
