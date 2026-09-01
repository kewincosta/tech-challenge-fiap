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
}
