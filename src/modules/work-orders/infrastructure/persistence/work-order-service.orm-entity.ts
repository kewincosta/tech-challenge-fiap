import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('work_order_services')
export class WorkOrderServiceOrmEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @Column({ name: 'external_id', type: 'uuid' })
  externalId!: string;

  @Column({ name: 'work_order_id', type: 'bigint' })
  workOrderInternalId!: string;

  @Column({ name: 'service_id', type: 'bigint' })
  serviceInternalId!: string;

  @Column({ name: 'service_name', type: 'varchar', length: 120 })
  serviceName!: string;

  // bigint, so the driver hands this back as a string - the mapper converts explicitly (AD-002).
  @Column({ name: 'unit_price_cents', type: 'bigint' })
  unitPriceCents!: string;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @Column({ name: 'budget_id', type: 'bigint', nullable: true })
  budgetInternalId!: string | null;

  @Column({ name: 'budgeted_unit_price_cents', type: 'bigint', nullable: true })
  budgetedUnitPriceCents!: string | null;
}
