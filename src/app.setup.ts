import { INestApplication, VersioningType } from '@nestjs/common';
import helmet from 'helmet';
import { noStore } from './shared/presentation/no-store.middleware';

export function configureApp(app: INestApplication): void {
  app.use(helmet());
  app.use(noStore);
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.enableShutdownHooks();
}
