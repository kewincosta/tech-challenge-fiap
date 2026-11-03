import { DataSource } from 'typeorm';
import { takenValues } from './taken-values';

// Adds the document of every active user and the plate of every active vehicle of the test database
// to the taken values, so the factories draw something else. "Active" is the condition of the
// partial unique indexes ux_users_document and ux_vehicles_plate: a removed row keeps its value
// free. The database settings are the ones .env.test gives, which setup-tests.ts puts in the
// environment before this runs.
export async function loadTakenValues(): Promise<void> {
  const dataSource = new DataSource({
    type: 'postgres',
    host: process.env.DATABASE_HOST,
    port: Number(process.env.DATABASE_PORT),
    username: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE_NAME,
  });
  await dataSource.initialize();
  try {
    for (const query of [
      `SELECT document AS value FROM users WHERE deleted_at IS NULL`,
      `SELECT plate AS value FROM vehicles WHERE deleted_at IS NULL`,
    ]) {
      const rows: Array<{ value: string }> = await dataSource.query(query);

      for (const { value } of rows) {
        takenValues.add(value);
      }
    }
  } finally {
    await dataSource.destroy();
  }
}
