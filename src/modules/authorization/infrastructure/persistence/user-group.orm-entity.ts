import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('user_groups')
export class UserGroupOrmEntity {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @PrimaryColumn({ name: 'group_id', type: 'uuid' })
  groupId!: string;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
