import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { Mailer } from '../../src/modules/work-orders/application/ports/mailer.port';
import { MAILER } from '../../src/modules/work-orders/work-orders.tokens';
import { RecordingMailer } from './fakes/recording-mailer';

export interface TestApp<M extends Mailer = RecordingMailer> {
  app: INestApplication;
  dataSource: DataSource;
  /** The mailer the application was built with, so a test can read what it was asked to send. */
  mailer: M;
  close: () => Promise<void>;
}

/**
 * The whole application over the test database. The `Mailer` is replaced with a fake, so no suite
 * needs a mail server and none sends a real e-mail: a recording one unless the caller passes its own.
 */
export async function createTestApp(): Promise<TestApp<RecordingMailer>>;
export async function createTestApp<M extends Mailer>(options: { mailer: M }): Promise<TestApp<M>>;
export async function createTestApp(options?: { mailer: Mailer }): Promise<TestApp<Mailer>> {
  const mailer = options?.mailer ?? new RecordingMailer();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(MAILER)
    .useValue(mailer)
    .compile();
  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();
  return {
    app,
    dataSource: app.get(DataSource),
    mailer,
    close: async () => {
      // A subscriber the dispatcher does not wait for, such as the status e-mail, may still be
      // reading when a test ends. Closing at once would log its read as a failed e-mail.
      await new Promise((resolve) => setTimeout(resolve, 100));
      await app.close();
    },
  };
}
