import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CLOCK, Clock } from '../../../../shared/application/ports/clock.port';
import { AssignmentRepository } from '../../application/ports/assignment.repository';
import { UserGroupOrmEntity } from './user-group.orm-entity';
import { UserRoleOrmEntity } from './user-role.orm-entity';

@Injectable()
export class TypeOrmAssignmentRepository implements AssignmentRepository {
  constructor(
    @InjectRepository(UserRoleOrmEntity)
    private readonly userRoles: Repository<UserRoleOrmEntity>,
    @InjectRepository(UserGroupOrmEntity)
    private readonly userGroups: Repository<UserGroupOrmEntity>,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async assignRoleToUser(userId: string, roleId: string): Promise<void> {
    await this.userRoles
      .createQueryBuilder()
      .insert()
      .values({ userId, roleId, createdAt: this.clock.now() })
      .orIgnore()
      .execute();
  }

  async removeRoleFromUser(userId: string, roleId: string): Promise<boolean> {
    const result = await this.userRoles.delete({ userId, roleId });
    return (result.affected ?? 0) > 0;
  }

  async addUserToGroup(userId: string, groupId: string): Promise<void> {
    await this.userGroups
      .createQueryBuilder()
      .insert()
      .values({ userId, groupId, createdAt: this.clock.now() })
      .orIgnore()
      .execute();
  }

  async removeUserFromGroup(userId: string, groupId: string): Promise<boolean> {
    const result = await this.userGroups.delete({ userId, groupId });
    return (result.affected ?? 0) > 0;
  }
}
