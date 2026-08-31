import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('user_roles')
export class UserRoleOrmEntity {
  @PrimaryColumn({ name: 'user_id', type: 'bigint' })
  userId!: string;

  @PrimaryColumn({ name: 'role_id', type: 'bigint' })
  roleId!: string;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
