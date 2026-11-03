import { INestApplication, VersioningType } from '@nestjs/common';
import helmet from 'helmet';
import { noStore } from './shared/presentation/no-store.middleware';

export function configureApp(app: INestApplication): void {
  // prod answers over plain HTTP at the load balancer. The default policy's upgrade-insecure-requests
  // would make a browser fetch the Swagger page's own assets over HTTPS, where nothing listens.
  app.use(helmet({ contentSecurityPolicy: { directives: { upgradeInsecureRequests: null } } }));
  app.use(noStore);
  // The cluster probes these two paths as they are. The exclusion keeps them out of the `api` prefix;
  // `version: VERSION_NEUTRAL` on `HealthController` keeps them out of the version.
  app.setGlobalPrefix('api', { exclude: ['health/live', 'health/ready'] });
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.enableShutdownHooks();
}
