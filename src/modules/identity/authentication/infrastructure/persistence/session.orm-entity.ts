import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { RefreshTokenOrmEntity } from './refresh-token.orm-entity';

@Entity('sessions')
export class SessionOrmEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @Column({ name: 'external_id', type: 'uuid' })
  externalId!: string;

  @Column({ name: 'user_id', type: 'bigint' })
  userInternalId!: string;

  @Column({ name: 'status', type: 'varchar', length: 20 })
  status!: string;

  @Column({ name: 'ip', type: 'varchar', length: 64, nullable: true })
  ip!: string | null;

  @Column({ name: 'user_agent', type: 'varchar', length: 512, nullable: true })
  userAgent!: string | null;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @Column({ name: 'last_used_at', type: 'timestamptz' })
  lastUsedAt!: Date;

  @Column({ name: 'absolute_expires_at', type: 'timestamptz' })
  absoluteExpiresAt!: Date;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt!: Date | null;

  @Column({ name: 'revocation_reason', type: 'varchar', length: 40, nullable: true })
  revocationReason!: string | null;

  @OneToMany(() => RefreshTokenOrmEntity, (token) => token.session)
  tokens?: RefreshTokenOrmEntity[];
}
