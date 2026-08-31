import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Group } from '../../domain/entities/group';
import { GroupRepository } from '../../domain/repositories/group.repository';
import { GroupId } from '../../domain/value-objects/group-id';
import { GroupName } from '../../domain/value-objects/group-name';
import { GroupOrmEntity } from './group.orm-entity';
import { GroupPermissionOrmEntity } from './group-permission.orm-entity';
import { GroupRoleOrmEntity } from './group-role.orm-entity';

@Injectable()
export class TypeOrmGroupRepository implements GroupRepository {
  constructor(
    @InjectRepository(GroupOrmEntity)
    private readonly groups: Repository<GroupOrmEntity>,
    @InjectRepository(GroupRoleOrmEntity)
    private readonly groupRoles: Repository<GroupRoleOrmEntity>,
    @InjectRepository(GroupPermissionOrmEntity)
    private readonly groupPermissions: Repository<GroupPermissionOrmEntity>,
    private readonly dataSource: DataSource,
  ) {}

  async findById(id: GroupId): Promise<Group | null> {
    const row = await this.groups.findOne({ where: { id: id.value } });
    if (!row) {
      return null;
    }
    const [roleLinks, permissionLinks] = await Promise.all([
      this.groupRoles.find({ where: { groupId: row.id } }),
      this.groupPermissions.find({ where: { groupId: row.id } }),
    ]);
    return Group.restore({
      id: GroupId.create(row.id),
      name: GroupName.create(row.name),
      description: row.description,
      roleIds: roleLinks.map((link) => link.roleId),
      permissionIds: permissionLinks.map((link) => link.permissionId),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }

  async existsByName(name: GroupName): Promise<boolean> {
    return this.groups.exists({ where: { name: name.value } });
  }

  async save(group: Group): Promise<void> {
    const row = new GroupOrmEntity();
    row.id = group.id.value;
    row.name = group.name.value;
    row.description = group.description;
    row.createdAt = group.createdAt;
    row.updatedAt = group.updatedAt;
    const roleLinks = group.roleIds.map((roleId) => ({ groupId: group.id.value, roleId }));
    const permissionLinks = group.permissionIds.map((permissionId) => ({
      groupId: group.id.value,
      permissionId,
    }));
    await this.dataSource.transaction(async (manager) => {
      await manager.save(GroupOrmEntity, row);
      await manager.delete(GroupRoleOrmEntity, { groupId: group.id.value });
      await manager.delete(GroupPermissionOrmEntity, { groupId: group.id.value });
      if (roleLinks.length > 0) {
        await manager.insert(GroupRoleOrmEntity, roleLinks);
      }
      if (permissionLinks.length > 0) {
        await manager.insert(GroupPermissionOrmEntity, permissionLinks);
      }
    });
  }

  async delete(group: Group): Promise<void> {
    await this.groups.delete({ id: group.id.value });
  }
}
