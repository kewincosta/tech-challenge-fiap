import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { TransactionRunner } from '../../application/ports/transaction-runner.port';

// A transaction writes the tables of one module only (AD-017). A use case reaches its repositories
// through ports that carry no database handle, so it cannot pass the manager of its transaction
// down as an argument. AsyncLocalStorage carries the active transaction's EntityManager through
// those calls instead: the module's repositories join the transaction, and so do the key resolvers
// and the reads of other modules that run inside it, which see the rows written earlier and hold
// no second connection (ADR 0032). Another module's use case that writes opens a transaction of
// its own.
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
