import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';
import * as argon2 from 'argon2';
import { PersonDocument } from './modules/identity/users/domain/value-objects/person-document';
import dataSource from './shared/infrastructure/database/typeorm-cli.datasource';

/**
 * Creates the SUPER_ADMIN that ADMIN_EMAIL, ADMIN_PASSWORD and ADMIN_DOCUMENT describe, and does
 * nothing for one that exists. It lives here so the production image can run it compiled, with
 * `node dist/seed-admin.js`; `npm run seed:admin` runs it through scripts/seed-admin.ts.
 */
async function seedAdmin(): Promise<void> {
  const email = (process.env.ADMIN_EMAIL ?? '').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? '';
  if (email.length === 0 || password.length < 8) {
    throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD (minimum 8 characters) must be set.');
  }
  const document = PersonDocument.create(process.env.ADMIN_DOCUMENT ?? '');

  await dataSource.initialize();
  try {
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    await dataSource.query(
      `INSERT INTO users (external_id, email, password_hash, name, document, status, created_at, updated_at)
       VALUES ($1, $2, $3, 'Administrator', $4, 'ACTIVE', now(), now())
       ON CONFLICT (email) WHERE deleted_at IS NULL DO NOTHING`,
      [randomUUID(), email, passwordHash, document.value],
    );
    await dataSource.query(
      `INSERT INTO user_roles (user_id, role_id, created_at)
       SELECT u.id, r.id, now()
         FROM users u
        CROSS JOIN roles r
        WHERE u.email = $1 AND u.deleted_at IS NULL AND r.name = 'SUPER_ADMIN'
       ON CONFLICT DO NOTHING`,
      [email],
    );
    new Logger('SeedAdmin').log(`Super administrator ready: ${email}`);
  } finally {
    await dataSource.destroy();
  }
}

seedAdmin().catch((error: unknown) => {
  new Logger('SeedAdmin').error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
