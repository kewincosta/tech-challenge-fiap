import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('work_order_budgets')
export class WorkOrderBudgetOrmEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @Column({ name: 'external_id', type: 'uuid' })
  externalId!: string;

  @Column({ name: 'work_order_id', type: 'bigint' })
  workOrderInternalId!: string;

  @Column({ name: 'round', type: 'int' })
  round!: number;

  // bigint, so the driver hands this back as a string - the mapper converts explicitly (AD-002).
  @Column({ name: 'total_cents', type: 'bigint' })
  totalCents!: string;

  @Column({ name: 'status', type: 'varchar', length: 20 })
  status!: string;

  @Column({ name: 'generated_at', type: 'timestamptz' })
  generatedAt!: Date;

  @Column({ name: 'decided_at', type: 'timestamptz', nullable: true })
  decidedAt!: Date | null;

  @Column({ name: 'decided_by_user_id', type: 'bigint', nullable: true })
  decidedByInternalId!: string | null;
}
