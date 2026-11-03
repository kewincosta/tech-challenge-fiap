import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import * as argon2 from 'argon2';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { CreateInventoryItemCommand } from '../src/modules/inventory/application/commands/create-inventory-item/create-inventory-item.command';
import { CreateInventoryItemUseCase } from '../src/modules/inventory/application/commands/create-inventory-item/create-inventory-item.use-case';
import { ReplenishStockCommand } from '../src/modules/inventory/application/commands/replenish-stock/replenish-stock.command';
import { ReplenishStockUseCase } from '../src/modules/inventory/application/commands/replenish-stock/replenish-stock.use-case';
import { CreateServiceCommand } from '../src/modules/services/application/commands/create-service/create-service.command';
import { CreateServiceUseCase } from '../src/modules/services/application/commands/create-service/create-service.use-case';
import { RegisterCustomerCommand } from '../src/modules/customers/application/commands/register-customer/register-customer.command';
import { RegisterCustomerUseCase } from '../src/modules/customers/application/commands/register-customer/register-customer.use-case';
import { RegisterVehicleCommand } from '../src/modules/vehicles/application/commands/register-vehicle/register-vehicle.command';
import { RegisterVehicleUseCase } from '../src/modules/vehicles/application/commands/register-vehicle/register-vehicle.use-case';

/**
 * Puts a whole workshop on the table: one user per role with the role already assigned, plus the
 * catalog, the stock and one customer with vehicles that the Postman collection walks through.
 *
 * Two halves, for two different reasons. The accounts are written in SQL, the way
 * `seed-admin.ts` already does, because no authenticated actor exists to register them when the
 * database is empty (AD-006). Everything after that runs the same use cases the HTTP routes run,
 * resolved from the application context, so the domain invariants decide what is valid rather
 * than this file restating them in INSERT statements.
 *
 * Idempotent throughout: every step looks for what it is about to create and skips it. Running
 * this twice leaves the same database, and running it over `npm run seed:admin` is safe too.
 */

const DEFAULT_PASSWORD = 'Str0ngPassword';
const ADDRESS = {
  street: 'Avenida Paulista',
  number: '1578',
  complement: 'Conjunto 12',
  district: 'Bela Vista',
  city: 'Sao Paulo',
  state: 'SP',
  zipCode: '01310200',
};

interface SeedActor {
  role: string;
  email: string;
  name: string;
  /** The nine digits the two CPF check digits are computed from. */
  documentBase: string;
}

const ACTORS: SeedActor[] = [
  {
    role: 'ADMIN',
    email: 'admin@oficina.local',
    name: 'Ana Administrator',
    documentBase: '529982247',
  },
  {
    role: 'SERVICE_ADVISOR',
    email: 'consultor@oficina.local',
    name: 'Carlos Advisor',
    documentBase: '746273890',
  },
  {
    role: 'MECHANIC',
    email: 'mecanico@oficina.local',
    name: 'Marcos Mechanic',
    documentBase: '390533447',
  },
  {
    role: 'CUSTOMER',
    email: 'cliente@oficina.local',
    name: 'Clara Customer',
    documentBase: '168995500',
  },
];

const SERVICES = [
  { name: 'Oil change', description: 'Oil and filter included', priceCents: 15_099, minutes: 60 },
  {
    name: 'Wheel alignment and balancing',
    description: 'All four wheels',
    priceCents: 12_000,
    minutes: 90,
  },
  {
    name: 'Full service',
    description: '10,000 kilometre service',
    priceCents: 48_000,
    minutes: 240,
  },
  {
    name: 'Brake pad replacement',
    description: 'Front axle',
    priceCents: 32_000,
    minutes: 120,
  },
];

const INVENTORY = [
  {
    sku: 'FLT-OL-001',
    name: 'Oil filter',
    description: 'Fits 1.0 to 1.6 engines',
    kind: 'PART',
    priceCents: 4_500,
    quantity: 40,
  },
  {
    sku: 'PST-FR-001',
    name: 'Front brake pad',
    description: 'Set of four',
    kind: 'PART',
    priceCents: 18_900,
    quantity: 25,
  },
  {
    sku: 'OLE-5W30-001',
    name: '5W30 synthetic oil',
    description: 'One litre',
    kind: 'SUPPLY',
    priceCents: 5_200,
    quantity: 120,
  },
  {
    sku: 'FLU-FR-001',
    name: 'DOT4 brake fluid',
    description: '500 ml bottle',
    kind: 'SUPPLY',
    priceCents: 3_400,
    quantity: 60,
  },
  {
    sku: 'EST-LV-001',
    name: 'Cleaning rags',
    description: 'One kilo pack',
    kind: 'SUPPLY',
    priceCents: 1_800,
    quantity: 80,
  },
];

const VEHICLES = [
  { plate: 'RDX8B47', brand: 'Toyota', model: 'Corolla', year: 2020 },
  { plate: 'QNM4321', brand: 'Honda', model: 'Civic', year: 2018 },
];

/** The same weighted sum `PersonDocument` verifies, run forwards to produce a valid CPF. */
function cpfFrom(base: string): string {
  const digits = base.split('').map(Number);
  const first = checkDigit(digits, 10);
  const second = checkDigit([...digits, first], 11);
  return `${base}${first}${second}`;
}

function checkDigit(digits: number[], startWeight: number): number {
  const sum = digits.reduce((total, digit, index) => total + digit * (startWeight - index), 0);
  const remainder = sum % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}

export async function runSeed(): Promise<void> {
  const password = process.env.SEED_PASSWORD ?? DEFAULT_PASSWORD;
  if (password.length < 8) {
    throw new Error('SEED_PASSWORD must be at least 8 characters.');
  }

  const context = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const dataSource = context.get(DataSource);
  const createService = context.get(CreateServiceUseCase);
  const createInventoryItem = context.get(CreateInventoryItemUseCase);
  const replenishStock = context.get(ReplenishStockUseCase);
  const registerCustomer = context.get(RegisterCustomerUseCase);
  const registerVehicle = context.get(RegisterVehicleUseCase);

  try {
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

    const superAdminEmail = (process.env.ADMIN_EMAIL ?? 'admin@workshop.local')
      .trim()
      .toLowerCase();
    await upsertUser(dataSource, {
      email: superAdminEmail,
      name: 'Super Administrator',
      document: cpfFrom('287687331'),
      passwordHash,
      role: 'SUPER_ADMIN',
    });

    const actorIds = new Map<string, string>();
    for (const actor of ACTORS) {
      const id = await upsertUser(dataSource, {
        email: actor.email,
        name: actor.name,
        document: cpfFrom(actor.documentBase),
        passwordHash,
        role: actor.role,
      });
      actorIds.set(actor.role, id);
    }
    console.log(
      `Actors ready: SUPER_ADMIN (${superAdminEmail}), ${ACTORS.map((a) => a.role).join(', ')}`,
    );

    await seedServices(dataSource, createService);
    await seedInventory(dataSource, createInventoryItem, replenishStock, actorIds.get('ADMIN')!);
    await seedCustomerAndVehicles(
      dataSource,
      registerCustomer,
      registerVehicle,
      actorIds.get('CUSTOMER')!,
    );

    console.log(`Every account uses the password: ${password}`);
  } finally {
    await context.close();
  }
}

interface UserSeed {
  email: string;
  name: string;
  document: string;
  passwordHash: string;
  role: string;
}

/** Inserts the account and grants the role, both skipped when already there. Returns its uuid. */
async function upsertUser(dataSource: DataSource, seed: UserSeed): Promise<string> {
  const found: Array<{ external_id: string }> = await dataSource.query(
    `SELECT external_id FROM users WHERE email = $1 AND deleted_at IS NULL`,
    [seed.email],
  );
  if (found.length === 0) {
    // users.document is uniquely indexed too, so a document already held under a different email
    // would fail the INSERT with a raw constraint error. Checked here to say which one instead.
    const documentTaken: unknown[] = await dataSource.query(
      `SELECT 1 FROM users WHERE document = $1 AND deleted_at IS NULL`,
      [seed.document],
    );
    if (documentTaken.length > 0) {
      throw new Error(
        `Cannot seed ${seed.email}: the document ${seed.document} already belongs to another ` +
          'account. Free it, or change the base this actor draws its CPF from.',
      );
    }
    await dataSource.query(
      `INSERT INTO users (external_id, email, password_hash, name, document, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'ACTIVE', now(), now())`,
      [randomUUID(), seed.email, seed.passwordHash, seed.name, seed.document],
    );
  }
  await dataSource.query(
    `INSERT INTO user_roles (user_id, role_id, created_at)
     SELECT u.id, r.id, now()
       FROM users u
      CROSS JOIN roles r
      WHERE u.email = $1 AND u.deleted_at IS NULL AND r.name = $2
     ON CONFLICT DO NOTHING`,
    [seed.email, seed.role],
  );
  const rows: Array<{ external_id: string }> = await dataSource.query(
    `SELECT external_id FROM users WHERE email = $1 AND deleted_at IS NULL`,
    [seed.email],
  );
  return rows[0].external_id;
}

async function seedServices(
  dataSource: DataSource,
  createService: CreateServiceUseCase,
): Promise<void> {
  let created = 0;
  for (const service of SERVICES) {
    const existing: unknown[] = await dataSource.query(
      `SELECT 1 FROM services WHERE name = $1 AND status = 'ACTIVE'`,
      [service.name],
    );
    if (existing.length > 0) {
      continue;
    }
    await createService.execute(
      new CreateServiceCommand(
        service.name,
        service.priceCents,
        service.minutes,
        service.description,
      ),
    );
    created += 1;
  }
  console.log(`Catalog services: ${created} created, ${SERVICES.length - created} already there`);
}

async function seedInventory(
  dataSource: DataSource,
  createInventoryItem: CreateInventoryItemUseCase,
  replenishStock: ReplenishStockUseCase,
  actorUserId: string,
): Promise<void> {
  let created = 0;
  for (const item of INVENTORY) {
    const existing: unknown[] = await dataSource.query(
      `SELECT 1 FROM inventory_items WHERE sku = $1 AND status = 'ACTIVE'`,
      [item.sku],
    );
    if (existing.length > 0) {
      continue;
    }
    const { id } = await createInventoryItem.execute(
      new CreateInventoryItemCommand(
        item.sku,
        item.name,
        item.kind,
        item.priceCents,
        item.description,
      ),
    );
    // A created item has a quantity on hand of zero and only a movement moves the count, so the
    // opening stock is a real INBOUND movement rather than a column written directly.
    await replenishStock.execute(
      new ReplenishStockCommand(id, item.quantity, item.priceCents, actorUserId, 'Opening stock'),
    );
    created += 1;
  }
  console.log(`Inventory items: ${created} created, ${INVENTORY.length - created} already there`);
}

async function seedCustomerAndVehicles(
  dataSource: DataSource,
  registerCustomer: RegisterCustomerUseCase,
  registerVehicle: RegisterVehicleUseCase,
  customerUserId: string,
): Promise<void> {
  const existing: Array<{ external_id: string }> = await dataSource.query(
    `SELECT c.external_id
       FROM customers c
       JOIN users u ON u.id = c.user_id
      WHERE u.external_id = $1 AND c.deleted_at IS NULL`,
    [customerUserId],
  );
  let customerId: string;
  if (existing.length > 0) {
    customerId = existing[0].external_id;
    console.log('Customer record: already there');
  } else {
    const registered = await registerCustomer.execute(
      new RegisterCustomerCommand(
        customerUserId,
        undefined,
        undefined,
        undefined,
        ADDRESS,
        '11987654321',
      ),
    );
    customerId = registered.id;
    console.log('Customer record: created');
  }

  let created = 0;
  for (const vehicle of VEHICLES) {
    const rows: unknown[] = await dataSource.query(
      `SELECT 1 FROM vehicles WHERE plate = $1 AND deleted_at IS NULL`,
      [vehicle.plate],
    );
    if (rows.length > 0) {
      continue;
    }
    await registerVehicle.execute(
      new RegisterVehicleCommand(
        customerId,
        vehicle.plate,
        vehicle.brand,
        vehicle.model,
        vehicle.year,
      ),
    );
    created += 1;
  }
  console.log(`Vehicles: ${created} created, ${VEHICLES.length - created} already there`);
}

if (require.main === module) {
  runSeed().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
