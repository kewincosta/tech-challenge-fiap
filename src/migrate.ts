import { Logger } from '@nestjs/common';
import dataSource from './shared/infrastructure/database/typeorm-cli.datasource';

/**
 * Applies the pending migrations and ends. The production image holds no ts-node, so the chart's
 * migration Job runs this file compiled: `node dist/migrate.js`.
 */
async function migrate(): Promise<void> {
  const logger = new Logger('Migrate');
  await dataSource.initialize();
  try {
    const applied = await dataSource.runMigrations();
    logger.log(
      applied.length === 0
        ? 'No migration was pending.'
        : `Applied ${applied.length} migrations: ${applied.map((migration) => migration.name).join(', ')}`,
    );
  } finally {
    await dataSource.destroy();
  }
}

migrate().catch((error: unknown) => {
  new Logger('Migrate').error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
