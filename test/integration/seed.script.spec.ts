import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { DataSource } from 'typeorm';
import { runSeed } from '../../scripts/seed';
import { createTestDataSource } from '../support/db';

// The demo data the seed writes, as the README and the Postman collection rely on it. The test
// database is never truncated: the first run of this spec writes these rows and every later run
// finds them already there. Both leave each one exactly once.
const ADMIN_EMAIL = 'admin@oficina.local';
const CUSTOMER_EMAIL = 'cliente@oficina.local';

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
  { name: 'Brake pad replacement', description: 'Front axle', priceCents: 32_000, minutes: 120 },
];

const ITEMS = [
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

let dataSource: DataSource;

beforeAll(async () => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  dataSource = createTestDataSource();
  await dataSource.initialize();
  await runSeed();
  await runSeed();
});

afterAll(async () => {
  vi.restoreAllMocks();
  await dataSource.destroy();
});

describe('seed script', () => {
  it('leaves each demo service once after two runs, with its description, price and duration', async () => {
    for (const service of SERVICES) {
      const rows: Array<{ description: string; priceCents: number; minutes: number }> =
        await dataSource.query(
          `SELECT description, price_cents::int AS "priceCents",
                  estimated_duration_minutes AS minutes
             FROM services
            WHERE name = $1 AND status = 'ACTIVE'`,
          [service.name],
        );

      expect(rows, service.name).toEqual([
        {
          description: service.description,
          priceCents: service.priceCents,
          minutes: service.minutes,
        },
      ]);
    }
  });

  it('leaves each demo inventory item once after two runs, holding its opening quantity', async () => {
    for (const item of ITEMS) {
      const rows: Array<{
        name: string;
        description: string;
        kind: string;
        priceCents: number;
        quantity: number;
      }> = await dataSource.query(
        `SELECT name, description, kind, unit_price_cents::int AS "priceCents",
                quantity_on_hand AS quantity
           FROM inventory_items
          WHERE sku = $1 AND status = 'ACTIVE'`,
        [item.sku],
      );

      expect(rows, item.sku).toEqual([
        {
          name: item.name,
          description: item.description,
          kind: item.kind,
          priceCents: item.priceCents,
          quantity: item.quantity,
        },
      ]);
    }
  });

  it('books the opening stock of each demo item as one INBOUND movement by the admin account', async () => {
    for (const item of ITEMS) {
      const rows: Array<{
        kind: string;
        quantity: number;
        priceCents: number;
        note: string | null;
        actor: string;
        workOrderId: string | null;
      }> = await dataSource.query(
        `SELECT m.kind, m.quantity, m.unit_price_cents::int AS "priceCents", m.note,
                u.email AS actor, m.work_order_id AS "workOrderId"
           FROM stock_movements m
           JOIN inventory_items i ON i.id = m.inventory_item_id
           JOIN users u ON u.id = m.actor_user_id
          WHERE i.sku = $1 AND i.status = 'ACTIVE'`,
        [item.sku],
      );

      expect(rows, item.sku).toEqual([
        {
          kind: 'INBOUND',
          quantity: item.quantity,
          priceCents: item.priceCents,
          note: 'Opening stock',
          actor: ADMIN_EMAIL,
          workOrderId: null,
        },
      ]);
    }
  });

  it('leaves the demo customer once after two runs, on the customer account, with its address and phone', async () => {
    const rows: Array<Record<string, string>> = await dataSource.query(
      `SELECT c.status, c.address_street AS street, c.address_number AS number,
              c.address_complement AS complement, c.address_district AS district,
              c.address_city AS city, c.address_state AS state,
              c.address_zip_code AS "zipCode", c.phone
         FROM customers c
         JOIN users u ON u.id = c.user_id
        WHERE u.email = $1 AND u.deleted_at IS NULL AND c.deleted_at IS NULL`,
      [CUSTOMER_EMAIL],
    );

    expect(rows).toEqual([
      {
        status: 'ACTIVE',
        street: 'Avenida Paulista',
        number: '1578',
        complement: 'Conjunto 12',
        district: 'Bela Vista',
        city: 'Sao Paulo',
        state: 'SP',
        zipCode: '01310200',
        phone: '11987654321',
      },
    ]);
  });

  it('leaves each demo vehicle once after two runs, owned by the demo customer', async () => {
    for (const vehicle of VEHICLES) {
      const rows: Array<{ brand: string; model: string; year: number; owner: string }> =
        await dataSource.query(
          `SELECT v.brand, v.model, v.year, u.email AS owner
             FROM vehicles v
             JOIN customers c ON c.id = v.customer_id
             JOIN users u ON u.id = c.user_id
            WHERE v.plate = $1 AND v.deleted_at IS NULL`,
          [vehicle.plate],
        );

      expect(rows, vehicle.plate).toEqual([
        {
          brand: vehicle.brand,
          model: vehicle.model,
          year: vehicle.year,
          owner: CUSTOMER_EMAIL,
        },
      ]);
    }
  });
});
