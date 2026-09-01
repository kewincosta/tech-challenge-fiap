import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('work_order_parts')
export class WorkOrderPartOrmEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @Column({ name: 'external_id', type: 'uuid' })
  externalId!: string;

  @Column({ name: 'work_order_id', type: 'bigint' })
  workOrderInternalId!: string;

  @Column({ name: 'inventory_item_id', type: 'bigint' })
  inventoryItemInternalId!: string;

  @Column({ name: 'sku', type: 'varchar', length: 40 })
  sku!: string;

  @Column({ name: 'item_name', type: 'varchar', length: 120 })
  itemName!: string;

  @Column({ name: 'planned_quantity', type: 'integer' })
  plannedQuantity!: number;

  @Column({ name: 'withdrawn_quantity', type: 'integer' })
  withdrawnQuantity!: number;

  // bigint, so the driver hands this back as a string - the mapper converts explicitly (AD-002).
  @Column({ name: 'unit_price_cents', type: 'bigint' })
  unitPriceCents!: string;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
