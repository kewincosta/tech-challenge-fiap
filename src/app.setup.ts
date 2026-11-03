import { INestApplication, VersioningType } from '@nestjs/common';
import helmet from 'helmet';
import { noStore } from './shared/presentation/no-store.middleware';

export function configureApp(app: INestApplication): void {
  app.use(helmet());
  app.use(noStore);
  // The cluster probes these two paths as they are. The exclusion keeps them out of the `api` prefix;
  // `version: VERSION_NEUTRAL` on `HealthController` keeps them out of the version.
  app.setGlobalPrefix('api', { exclude: ['health/live', 'health/ready'] });
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.enableShutdownHooks();
}
