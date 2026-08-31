import { Global, Module } from '@nestjs/common';
import { CLOCK } from './application/ports/clock.port';
import { ID_GENERATOR } from './application/ports/id-generator.port';
import { TRANSACTION_RUNNER } from './application/ports/transaction-runner.port';
import { CryptoIdGenerator } from './infrastructure/ids/crypto-id-generator';
import { TypeOrmTransactionRunner } from './infrastructure/database/typeorm-transaction-runner';
import { SystemClock } from './infrastructure/time/system-clock';

@Global()
@Module({
  providers: [
    { provide: CLOCK, useClass: SystemClock },
    { provide: ID_GENERATOR, useClass: CryptoIdGenerator },
    { provide: TRANSACTION_RUNNER, useClass: TypeOrmTransactionRunner },
  ],
  exports: [CLOCK, ID_GENERATOR, TRANSACTION_RUNNER],
})
export class SharedModule {}
