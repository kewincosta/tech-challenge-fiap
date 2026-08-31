import { Entity, PrimaryColumn } from 'typeorm';

@Entity('group_roles')
export class GroupRoleOrmEntity {
  @PrimaryColumn({ name: 'group_id', type: 'uuid' })
  groupId!: string;

  @PrimaryColumn({ name: 'role_id', type: 'uuid' })
  roleId!: string;
}
