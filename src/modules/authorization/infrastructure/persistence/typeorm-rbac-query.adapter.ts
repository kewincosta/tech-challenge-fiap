import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  GroupDto,
  PermissionDto,
  RbacQueryPort,
  RoleDto,
  UserAccessDto,
} from '../../application/ports/rbac-query.port';
import { GroupOrmEntity } from './group.orm-entity';
import { GroupPermissionOrmEntity } from './group-permission.orm-entity';
import { GroupRoleOrmEntity } from './group-role.orm-entity';
import { PermissionOrmEntity } from './permission.orm-entity';
import { RoleOrmEntity } from './role.orm-entity';
import { RolePermissionOrmEntity } from './role-permission.orm-entity';
import { UserGroupOrmEntity } from './user-group.orm-entity';
import { UserRoleOrmEntity } from './user-role.orm-entity';

@Injectable()
export class TypeOrmRbacQueryAdapter implements RbacQueryPort {
  constructor(
    @InjectRepository(RoleOrmEntity)
    private readonly roles: Repository<RoleOrmEntity>,
    @InjectRepository(GroupOrmEntity)
    private readonly groups: Repository<GroupOrmEntity>,
    @InjectRepository(PermissionOrmEntity)
    private readonly permissions: Repository<PermissionOrmEntity>,
    @InjectRepository(RolePermissionOrmEntity)
    private readonly rolePermissions: Repository<RolePermissionOrmEntity>,
    @InjectRepository(GroupRoleOrmEntity)
    private readonly groupRoles: Repository<GroupRoleOrmEntity>,
    @InjectRepository(GroupPermissionOrmEntity)
    private readonly groupPermissions: Repository<GroupPermissionOrmEntity>,
    @InjectRepository(UserRoleOrmEntity)
    private readonly userRoles: Repository<UserRoleOrmEntity>,
    @InjectRepository(UserGroupOrmEntity)
    private readonly userGroups: Repository<UserGroupOrmEntity>,
  ) {}

  async listRoles(): Promise<RoleDto[]> {
    const rows = await this.roles.find({ order: { name: 'ASC' } });
    return this.toRoleDtos(rows);
  }

  async getRoleById(roleId: string): Promise<RoleDto | null> {
    const row = await this.roles.findOne({ where: { id: roleId } });
    if (!row) {
      return null;
    }
    const [dto] = await this.toRoleDtos([row]);
    return dto ?? null;
  }

  async listGroups(): Promise<GroupDto[]> {
    const rows = await this.groups.find({ order: { name: 'ASC' } });
    return this.toGroupDtos(rows);
  }

  async getGroupById(groupId: string): Promise<GroupDto | null> {
    const row = await this.groups.findOne({ where: { id: groupId } });
    if (!row) {
      return null;
    }
    const [dto] = await this.toGroupDtos([row]);
    return dto ?? null;
  }

  async listPermissions(): Promise<PermissionDto[]> {
    const rows = await this.permissions.find({ order: { code: 'ASC' } });
    return rows.map((row) => ({ id: row.id, code: row.code, description: row.description }));
  }

  async getUserAccess(userId: string): Promise<UserAccessDto> {
    const [roleLinks, groupLinks] = await Promise.all([
      this.userRoles.find({ where: { userId } }),
      this.userGroups.find({ where: { userId } }),
    ]);
    const [roleRows, groupRows] = await Promise.all([
      roleLinks.length > 0
        ? this.roles.find({ where: { id: In(roleLinks.map((link) => link.roleId)) } })
        : Promise.resolve([]),
      groupLinks.length > 0
        ? this.groups.find({ where: { id: In(groupLinks.map((link) => link.groupId)) } })
        : Promise.resolve([]),
    ]);
    return {
      roles: roleRows.map((row) => ({ id: row.id, name: row.name })),
      groups: groupRows.map((row) => ({ id: row.id, name: row.name })),
    };
  }

  private async toRoleDtos(rows: RoleOrmEntity[]): Promise<RoleDto[]> {
    if (rows.length === 0) {
      return [];
    }
    const links = await this.rolePermissions.find({
      where: { roleId: In(rows.map((row) => row.id)) },
    });
    const codeById = await this.permissionCodesById(links.map((link) => link.permissionId));
    const codesByRole = new Map<string, string[]>();
    for (const link of links) {
      const code = codeById.get(link.permissionId);
      if (!code) {
        continue;
      }
      const bucket = codesByRole.get(link.roleId) ?? [];
      bucket.push(code);
      codesByRole.set(link.roleId, bucket);
    }
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      isSystem: row.isSystem,
      permissions: (codesByRole.get(row.id) ?? []).sort(),
    }));
  }

  private async toGroupDtos(rows: GroupOrmEntity[]): Promise<GroupDto[]> {
    if (rows.length === 0) {
      return [];
    }
    const groupIds = rows.map((row) => row.id);
    const [roleLinks, permissionLinks] = await Promise.all([
      this.groupRoles.find({ where: { groupId: In(groupIds) } }),
      this.groupPermissions.find({ where: { groupId: In(groupIds) } }),
    ]);
    const roleNamesById = await this.roleNamesById(roleLinks.map((link) => link.roleId));
    const codeById = await this.permissionCodesById(
      permissionLinks.map((link) => link.permissionId),
    );
    const rolesByGroup = new Map<string, string[]>();
    for (const link of roleLinks) {
      const name = roleNamesById.get(link.roleId);
      if (!name) {
        continue;
      }
      const bucket = rolesByGroup.get(link.groupId) ?? [];
      bucket.push(name);
      rolesByGroup.set(link.groupId, bucket);
    }
    const codesByGroup = new Map<string, string[]>();
    for (const link of permissionLinks) {
      const code = codeById.get(link.permissionId);
      if (!code) {
        continue;
      }
      const bucket = codesByGroup.get(link.groupId) ?? [];
      bucket.push(code);
      codesByGroup.set(link.groupId, bucket);
    }
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      roles: (rolesByGroup.get(row.id) ?? []).sort(),
      permissions: (codesByGroup.get(row.id) ?? []).sort(),
    }));
  }

  private async permissionCodesById(permissionIds: string[]): Promise<Map<string, string>> {
    if (permissionIds.length === 0) {
      return new Map();
    }
    const rows = await this.permissions.find({ where: { id: In([...new Set(permissionIds)]) } });
    return new Map(rows.map((row) => [row.id, row.code]));
  }

  private async roleNamesById(roleIds: string[]): Promise<Map<string, string>> {
    if (roleIds.length === 0) {
      return new Map();
    }
    const rows = await this.roles.find({ where: { id: In([...new Set(roleIds)]) } });
    return new Map(rows.map((row) => [row.id, row.name]));
  }
}
