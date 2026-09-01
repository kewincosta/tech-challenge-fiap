import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('work_orders')
export class WorkOrderOrmEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @Column({ name: 'external_id', type: 'uuid' })
  externalId!: string;

  @Column({ name: 'number', type: 'varchar', length: 11 })
  number!: string;

  @Column({ name: 'customer_id', type: 'bigint' })
  customerInternalId!: string;

  @Column({ name: 'vehicle_id', type: 'bigint' })
  vehicleInternalId!: string;

  @Column({ name: 'assigned_mechanic_user_id', type: 'bigint', nullable: true })
  assignedMechanicInternalId!: string | null;

  @Column({ name: 'created_by_user_id', type: 'bigint' })
  createdByInternalId!: string;

  @Column({ name: 'status', type: 'varchar', length: 20 })
  status!: string;

  @Column({ name: 'customer_name', type: 'varchar', length: 120 })
  customerName!: string;

  @Column({ name: 'vehicle_plate', type: 'varchar', length: 7 })
  vehiclePlate!: string;

  @Column({ name: 'vehicle_brand', type: 'varchar', length: 60 })
  vehicleBrand!: string;

  @Column({ name: 'vehicle_model', type: 'varchar', length: 60 })
  vehicleModel!: string;

  @Column({ name: 'vehicle_year', type: 'smallint' })
  vehicleYear!: number;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @Column({ name: 'diagnosis_started_at', type: 'timestamptz', nullable: true })
  diagnosisStartedAt!: Date | null;

  @Column({ name: 'diagnosis_completed_at', type: 'timestamptz', nullable: true })
  diagnosisCompletedAt!: Date | null;

  @Column({ name: 'budget_decided_at', type: 'timestamptz', nullable: true })
  budgetDecidedAt!: Date | null;

  @Column({ name: 'budget_decided_by_user_id', type: 'bigint', nullable: true })
  budgetDecidedByInternalId!: string | null;

  @Column({ name: 'execution_started_at', type: 'timestamptz', nullable: true })
  executionStartedAt!: Date | null;

  @Column({ name: 'charged_total_cents', type: 'bigint', nullable: true })
  chargedTotalCents!: string | null;

  @Column({ name: 'discount_cents', type: 'bigint' })
  discountCents!: string;

  @Column({ name: 'discount_note', type: 'varchar', length: 255, nullable: true })
  discountNote!: string | null;

  @Column({ name: 'discount_applied_by_user_id', type: 'bigint', nullable: true })
  discountAppliedByInternalId!: string | null;

  @Column({ name: 'discount_applied_at', type: 'timestamptz', nullable: true })
  discountAppliedAt!: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  @Column({ name: 'delivered_at', type: 'timestamptz', nullable: true })
  deliveredAt!: Date | null;

  @Column({ name: 'delivered_by_user_id', type: 'bigint', nullable: true })
  deliveredByInternalId!: string | null;

  @Column({ name: 'canceled_at', type: 'timestamptz', nullable: true })
  canceledAt!: Date | null;

  @Column({ name: 'canceled_by_user_id', type: 'bigint', nullable: true })
  canceledByInternalId!: string | null;

  @Column({ name: 'cancellation_reason', type: 'varchar', length: 255, nullable: true })
  cancellationReason!: string | null;

  /** AD-009. Not TypeORM's `@VersionColumn` - the repository's own `save` owns the check and the
   * bump explicitly, so a mismatch maps to `ConcurrentModificationError` rather than a driver
   * exception. */
  @Column({ name: 'version', type: 'integer' })
  version!: number;
}
