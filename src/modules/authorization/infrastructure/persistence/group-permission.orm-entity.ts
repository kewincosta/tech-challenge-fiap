import { Entity, PrimaryColumn } from 'typeorm';

@Entity('group_permissions')
export class GroupPermissionOrmEntity {
  @PrimaryColumn({ name: 'group_id', type: 'uuid' })
  groupId!: string;

  @PrimaryColumn({ name: 'permission_id', type: 'uuid' })
  permissionId!: string;
}
