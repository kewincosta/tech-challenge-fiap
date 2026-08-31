import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { PermissionDto, RbacQueryPort, RoleDto, UserAccessDto } from '../../application/ports/rbac-query.port';
import { PermissionOrmEntity } from './permission.orm-entity';
import { RoleOrmEntity } from './role.orm-entity';
import { RolePermissionOrmEntity } from './role-permission.orm-entity';
import { UserRoleOrmEntity } from './user-role.orm-entity';

@Injectable()
export class TypeOrmRbacQueryAdapter implements RbacQueryPort {
  constructor(
    @InjectRepository(RoleOrmEntity)
    private readonly roles: Repository<RoleOrmEntity>,
    @InjectRepository(PermissionOrmEntity)
    private readonly permissions: Repository<PermissionOrmEntity>,
    @InjectRepository(RolePermissionOrmEntity)
    private readonly rolePermissions: Repository<RolePermissionOrmEntity>,
    @InjectRepository(UserRoleOrmEntity)
    private readonly userRoles: Repository<UserRoleOrmEntity>,
    private readonly dataSource: DataSource,
  ) {}

  async listRoles(): Promise<RoleDto[]> {
    const rows = await this.roles.find({ order: { name: 'ASC' } });
    return this.toRoleDtos(rows);
  }

  async getRoleById(roleId: string): Promise<RoleDto | null> {
    const row = await this.roles.findOne({ where: { externalId: roleId } });
    if (!row) {
      return null;
    }
    const [dto] = await this.toRoleDtos([row]);
    return dto ?? null;
  }

  async listPermissions(): Promise<PermissionDto[]> {
    const rows = await this.permissions.find({ order: { code: 'ASC' } });
    return rows.map((row) => ({
      id: row.externalId,
      code: row.code,
      description: row.description,
    }));
  }

  async getUserAccess(userId: string): Promise<UserAccessDto> {
    const userRows: Array<{ id: string }> = await this.dataSource.query(
      `SELECT id FROM users WHERE external_id = $1`,
      [userId],
    );
    if (userRows.length === 0) {
      return { roles: [] };
    }
    const userInternalId = userRows[0].id;
    const roleLinks = await this.userRoles.find({ where: { userId: userInternalId } });
    const roleRows =
      roleLinks.length > 0
        ? await this.roles.find({ where: { id: In(roleLinks.map((link) => link.roleId)) } })
        : [];
    return {
      roles: roleRows.map((row) => ({ id: row.externalId, name: row.name })),
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
      id: row.externalId,
      name: row.name,
      description: row.description,
      isSystem: row.isSystem,
      permissions: (codesByRole.get(row.id) ?? []).sort(),
    }));
  }

  private async permissionCodesById(permissionIds: string[]): Promise<Map<string, string>> {
    if (permissionIds.length === 0) {
      return new Map();
    }
    const rows = await this.permissions.find({ where: { id: In([...new Set(permissionIds)]) } });
    return new Map(rows.map((row) => [row.id, row.code]));
  }
}
