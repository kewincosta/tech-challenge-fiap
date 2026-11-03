import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('stock_movements')
export class StockMovementOrmEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @Column({ name: 'external_id', type: 'uuid' })
  externalId!: string;

  @Column({ name: 'inventory_item_id', type: 'bigint' })
  inventoryItemInternalId!: string;

  @Column({ name: 'kind', type: 'varchar', length: 20 })
  kind!: string;

  @Column({ name: 'undoes_movement_id', type: 'bigint', nullable: true })
  undoesMovementInternalId!: string | null;

  @Column({ name: 'quantity', type: 'integer' })
  quantity!: number;

  // bigint, so the driver hands this back as a string - InventoryItemMapper converts explicitly.
  @Column({ name: 'unit_price_cents', type: 'bigint' })
  unitPriceCents!: string;

  @Column({ name: 'work_order_id', type: 'bigint', nullable: true })
  workOrderInternalId!: string | null;

  @Column({ name: 'status', type: 'varchar', length: 20, nullable: true })
  status!: string | null;

  @Column({ name: 'occurred_at', type: 'timestamptz' })
  occurredAt!: Date;

  @Column({ name: 'actor_user_id', type: 'bigint' })
  actorInternalId!: string;

  @Column({ name: 'note', type: 'varchar', length: 255, nullable: true })
  note!: string | null;

  @Column({ name: 'operation_id', type: 'uuid', nullable: true })
  operationId!: string | null;

  // Null until the work order of the withdrawal that wrote a consumption confirmed it.
  @Column({ name: 'confirmed_at', type: 'timestamptz', nullable: true })
  confirmedAt!: Date | null;
}
