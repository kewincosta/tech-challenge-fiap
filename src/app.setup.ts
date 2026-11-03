import { INestApplication, VersioningType } from '@nestjs/common';
import helmet from 'helmet';
import { noStore } from './shared/presentation/no-store.middleware';

export function configureApp(app: INestApplication): void {
  app.use(helmet());
  app.use(noStore);
  // The cluster probes these two paths as they are, outside the prefix (and the version) of the API.
  app.setGlobalPrefix('api', { exclude: ['health/live', 'health/ready'] });
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.enableShutdownHooks();
}
