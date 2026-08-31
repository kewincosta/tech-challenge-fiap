import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('inventory_items')
export class InventoryItemOrmEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @Column({ name: 'external_id', type: 'uuid' })
  externalId!: string;

  @Column({ name: 'sku', type: 'varchar', length: 40 })
  sku!: string;

  @Column({ name: 'name', type: 'varchar', length: 120 })
  name!: string;

  @Column({ name: 'description', type: 'varchar', length: 255, nullable: true })
  description!: string | null;

  @Column({ name: 'kind', type: 'varchar', length: 10 })
  kind!: string;

  // bigint, so the driver hands this back as a string - InventoryItemMapper converts explicitly
  // (AD-002, the same pattern service.orm-entity.ts uses for price_cents).
  @Column({ name: 'unit_price_cents', type: 'bigint' })
  unitPriceCents!: string;

  @Column({ name: 'quantity_on_hand', type: 'integer' })
  quantityOnHand!: number;

  @Column({ name: 'status', type: 'varchar', length: 20 })
  status!: string;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
