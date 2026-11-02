import 'dotenv/config';
import { join } from 'node:path';
import { DataSource } from 'typeorm';
import { databaseConfig, postgresConnection } from '../../../config/database.config';

// The entities and migrations are found from this file, so the same data source serves the
// TypeScript sources under ts-node and the compiled files in the production image.
export default new DataSource({
  ...postgresConnection(databaseConfig()),
  entities: [join(__dirname, '../../../**/*.orm-entity.{ts,js}')],
  migrations: [join(__dirname, 'migrations/*.{ts,js}')],
});
