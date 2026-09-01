import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Written only by `TypeOrmWorkOrderRepository.save`, inside the transaction that persists the
 * aggregate (AD-007) - never through an injected repository. See T10.
 */
@Entity('work_order_events')
export class WorkOrderEventOrmEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @Column({ name: 'external_id', type: 'uuid' })
  externalId!: string;

  @Column({ name: 'work_order_id', type: 'bigint' })
  workOrderInternalId!: string;

  @Column({ name: 'event_type', type: 'varchar', length: 40 })
  eventType!: string;

  @Column({ name: 'from_status', type: 'varchar', length: 20, nullable: true })
  fromStatus!: string | null;

  @Column({ name: 'to_status', type: 'varchar', length: 20, nullable: true })
  toStatus!: string | null;

  @Column({ name: 'actor_user_id', type: 'bigint', nullable: true })
  actorInternalId!: string | null;

  @Column({ name: 'occurred_at', type: 'timestamptz' })
  occurredAt!: Date;

  @Column({ name: 'note', type: 'varchar', length: 255, nullable: true })
  note!: string | null;
}
