import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('permissions')
export class PermissionOrmEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ name: 'code', type: 'varchar', length: 100 })
  code!: string;

  @Column({ name: 'description', type: 'varchar', length: 255, nullable: true })
  description!: string | null;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
