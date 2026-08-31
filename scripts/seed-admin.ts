import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import * as argon2 from 'argon2';
import dataSource from '../src/shared/infrastructure/database/typeorm-cli.datasource';

async function seedAdmin(): Promise<void> {
  const email = (process.env.ADMIN_EMAIL ?? '').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? '';
  if (email.length === 0 || password.length < 8) {
    throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD (minimum 8 characters) must be set.');
  }
  await dataSource.initialize();
  try {
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    await dataSource.query(
      `INSERT INTO users (id, email, password_hash, name, status, created_at, updated_at)
       VALUES ($1, $2, $3, 'Administrator', 'ACTIVE', now(), now())
       ON CONFLICT (email) WHERE deleted_at IS NULL DO NOTHING`,
      [randomUUID(), email, passwordHash],
    );
    await dataSource.query(
      `INSERT INTO user_roles (user_id, role_id, created_at)
       SELECT u.id, r.id, now()
         FROM users u
        CROSS JOIN roles r
        WHERE u.email = $1 AND u.deleted_at IS NULL AND r.name = 'ADMIN'
       ON CONFLICT DO NOTHING`,
      [email],
    );
    console.log(`Admin user ready: ${email}`);
  } finally {
    await dataSource.destroy();
  }
}

seedAdmin().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
