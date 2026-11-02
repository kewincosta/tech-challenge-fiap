import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { AppModule } from '../../src/app.module';
import { SmtpMailer } from '../../src/modules/work-orders/infrastructure/mail/smtp-mailer';
import { MAILER } from '../../src/modules/work-orders/work-orders.tokens';

describe('Mail wiring', () => {
  it('binds the Mailer to the SMTP adapter', async () => {
    // Nothing overrides the Mailer here, unlike the end-to-end suites, which replace it with a fake.
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    try {
      expect(moduleRef.get(MAILER, { strict: false })).toBeInstanceOf(SmtpMailer);
    } finally {
      await moduleRef.close();
    }
  });
});
