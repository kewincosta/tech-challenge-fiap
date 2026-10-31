import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('customer_account_steps')
export class CustomerAccountStepOrmEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @Column({ name: 'operation_id', type: 'uuid' })
  operationId!: string;

  @Column({ name: 'kind', type: 'varchar', length: 30 })
  kind!: string;

  // The external id the registration chose for the account, before the account exists.
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ name: 'payload', type: 'jsonb' })
  payload!: Record<string, unknown>;

  @Column({ name: 'status', type: 'varchar', length: 20 })
  status!: string;

  @Column({ name: 'attempts', type: 'integer' })
  attempts!: number;

  @Column({ name: 'due_at', type: 'timestamptz' })
  dueAt!: Date;

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError!: string | null;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;
}
