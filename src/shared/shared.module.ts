import { Global, Module } from '@nestjs/common';
import { CryptoIdGenerator } from './infrastructure/ids/crypto-id-generator';
import { TypeOrmTransactionRunner } from './infrastructure/database/typeorm-transaction-runner';
import { InMemoryDomainEventDispatcher } from './infrastructure/events/in-memory-domain-event-dispatcher';
import { SystemClock } from './infrastructure/time/system-clock';
import { CLOCK, DOMAIN_EVENT_PUBLISHER, ID_GENERATOR, TRANSACTION_RUNNER } from './shared.tokens';

@Global()
@Module({
  providers: [
    { provide: CLOCK, useClass: SystemClock },
    { provide: ID_GENERATOR, useClass: CryptoIdGenerator },
    { provide: TRANSACTION_RUNNER, useClass: TypeOrmTransactionRunner },
    InMemoryDomainEventDispatcher,
    { provide: DOMAIN_EVENT_PUBLISHER, useExisting: InMemoryDomainEventDispatcher },
  ],
  exports: [
    CLOCK,
    ID_GENERATOR,
    TRANSACTION_RUNNER,
    DOMAIN_EVENT_PUBLISHER,
    InMemoryDomainEventDispatcher,
  ],
})
export class SharedModule {}
