import { Global, Module } from '@nestjs/common';
import { CLOCK } from './application/ports/clock.port';
import { ID_GENERATOR } from './application/ports/id-generator.port';
import { CryptoIdGenerator } from './infrastructure/ids/crypto-id-generator';
import { SystemClock } from './infrastructure/time/system-clock';

@Global()
@Module({
  providers: [
    { provide: CLOCK, useClass: SystemClock },
    { provide: ID_GENERATOR, useClass: CryptoIdGenerator },
  ],
  exports: [CLOCK, ID_GENERATOR],
})
export class SharedModule {}
