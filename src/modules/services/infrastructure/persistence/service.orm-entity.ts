import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('services')
export class ServiceOrmEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @Column({ name: 'external_id', type: 'uuid' })
  externalId!: string;

  @Column({ name: 'name', type: 'varchar', length: 120 })
  name!: string;

  @Column({ name: 'description', type: 'varchar', length: 255, nullable: true })
  description!: string | null;

  // bigint, so the driver hands this back as a string - ServiceMapper converts explicitly
  // (AD-002, and the risk the service catalog phase named).
  @Column({ name: 'price_cents', type: 'bigint' })
  priceCents!: string;

  @Column({ name: 'estimated_duration_minutes', type: 'integer' })
  estimatedDurationMinutes!: number;

  @Column({ name: 'status', type: 'varchar', length: 20 })
  status!: string;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
