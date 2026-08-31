import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { TransactionRunner } from '../../application/ports/transaction-runner.port';

// Modules exchange only identifiers and DTOs through the CommandBus and the QueryBus (AD-003), so
// a write that spans two modules - such as RegisterUserHandler's user insert and the role
// assignment it dispatches - cannot pass a manager through a command payload. AsyncLocalStorage
// carries the active transaction's EntityManager across that bus dispatch instead, so a
// repository in another module can join the same Postgres transaction without either module
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

@Injectable()
export class TypeOrmTransactionRunner implements TransactionRunner {
  constructor(private readonly dataSource: DataSource) {}

  run<T>(work: () => Promise<T>): Promise<T> {
    return this.dataSource.transaction((manager) => transactionContext.run(manager, work));
  }
}
