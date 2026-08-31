import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('vehicles')
export class VehicleOrmEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @Column({ name: 'external_id', type: 'uuid' })
  externalId!: string;

  @Column({ name: 'customer_id', type: 'bigint' })
  customerInternalId!: string;

  @Column({ name: 'plate', type: 'varchar', length: 7 })
  plate!: string;

  @Column({ name: 'brand', type: 'varchar', length: 60 })
  brand!: string;

  @Column({ name: 'model', type: 'varchar', length: 60 })
  model!: string;

  @Column({ name: 'year', type: 'smallint' })
  year!: number;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;
}
