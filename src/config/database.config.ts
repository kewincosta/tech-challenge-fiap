import { registerAs } from '@nestjs/config';

export const databaseConfig = registerAs('database', () => ({
  host: process.env.DATABASE_HOST ?? 'localhost',
  port: Number(process.env.DATABASE_PORT ?? 5432),
  user: process.env.DATABASE_USER ?? 'workshop',
  password: process.env.DATABASE_PASSWORD ?? 'workshop',
  name: process.env.DATABASE_NAME ?? 'workshop',
}));
