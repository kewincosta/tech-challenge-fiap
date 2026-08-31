import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { CLOCK, Clock } from '../../../../shared/application/ports/clock.port';
import { currentEntityManager } from '../../../../shared/infrastructure/database/typeorm-transaction-runner';
import { AssignmentRepository } from '../../application/ports/assignment.repository';
import { RoleOrmEntity } from './role.orm-entity';
import { UserRoleOrmEntity } from './user-role.orm-entity';

@Injectable()
export class TypeOrmAssignmentRepository implements AssignmentRepository {
  constructor(
    @InjectRepository(UserRoleOrmEntity)
    private readonly userRoles: Repository<UserRoleOrmEntity>,
    @InjectRepository(RoleOrmEntity)
    private readonly roles: Repository<RoleOrmEntity>,
    private readonly dataSource: DataSource,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async assignRoleToUser(userId: string, roleId: string): Promise<void> {
    const [userInternalId, roleInternalId] = await Promise.all([
      this.resolveUserInternalId(userId),
      this.resolveRoleInternalId(roleId),
    ]);
    const manager = currentEntityManager();
    const userRoles = manager ? manager.getRepository(UserRoleOrmEntity) : this.userRoles;
    await userRoles
      .createQueryBuilder()
      .insert()
      .values({ userId: userInternalId, roleId: roleInternalId, createdAt: this.clock.now() })
      .orIgnore()
      .execute();
  }

  async removeRoleFromUser(userId: string, roleId: string): Promise<boolean> {
    const [userInternalId, roleInternalId] = await Promise.all([
      this.resolveUserInternalId(userId),
      this.resolveRoleInternalId(roleId),
    ]);
    const result = await this.userRoles.delete({ userId: userInternalId, roleId: roleInternalId });
    return (result.affected ?? 0) > 0;
  }

  private async resolveRoleInternalId(externalRoleId: string): Promise<string> {
    const role = await this.roles.findOne({
      where: { externalId: externalRoleId },
      select: { id: true },
    });
    if (!role) {
      throw new NotFoundException(`Role ${externalRoleId} not found`);
    }
    return role.id;
  }

  private async resolveUserInternalId(externalUserId: string): Promise<string> {
    // Reads through the active transaction's manager when RegisterUserHandler is assigning the
    // default role to a user it just inserted in the same transaction - a different connection
    // would not see that row until commit. See TypeOrmTransactionRunner.
    const runner = currentEntityManager() ?? this.dataSource;
    const rows: Array<{ id: string }> = await runner.query(
      `SELECT id FROM users WHERE external_id = $1`,
      [externalUserId],
    );
    if (rows.length === 0) {
      throw new NotFoundException(`User ${externalUserId} not found`);
    }
    return rows[0].id;
  }
}
