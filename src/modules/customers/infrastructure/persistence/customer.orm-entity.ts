import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('customers')
export class CustomerOrmEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @Column({ name: 'external_id', type: 'uuid' })
  externalId!: string;

  @Column({ name: 'user_id', type: 'bigint' })
  userInternalId!: string;

  @Column({ name: 'address_street', type: 'varchar', length: 160, nullable: true })
  addressStreet!: string | null;

  @Column({ name: 'address_number', type: 'varchar', length: 20, nullable: true })
  addressNumber!: string | null;

  @Column({ name: 'address_complement', type: 'varchar', length: 60, nullable: true })
  addressComplement!: string | null;

  @Column({ name: 'address_district', type: 'varchar', length: 80, nullable: true })
  addressDistrict!: string | null;

  @Column({ name: 'address_city', type: 'varchar', length: 80, nullable: true })
  addressCity!: string | null;

  @Column({ name: 'address_state', type: 'char', length: 2, nullable: true })
  addressState!: string | null;

  @Column({ name: 'address_zip_code', type: 'varchar', length: 8, nullable: true })
  addressZipCode!: string | null;

  @Column({ name: 'phone', type: 'varchar', length: 11, nullable: true })
  phone!: string | null;

  @Column({ name: 'status', type: 'varchar', length: 20 })
  status!: string;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;
}
