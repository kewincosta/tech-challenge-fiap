import { Entity, PrimaryColumn } from 'typeorm';

@Entity('role_permissions')
export class RolePermissionOrmEntity {
  @PrimaryColumn({ name: 'role_id', type: 'bigint' })
  roleId!: string;

  @PrimaryColumn({ name: 'permission_id', type: 'bigint' })
  permissionId!: string;
}
