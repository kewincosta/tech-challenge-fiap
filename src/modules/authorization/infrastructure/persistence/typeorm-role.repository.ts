import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { Role } from '../../domain/entities/role';
import { RoleRepository } from '../../domain/repositories/role.repository';
import { RoleId } from '../../domain/value-objects/role-id';
import { RoleName } from '../../domain/value-objects/role-name';
import { PermissionOrmEntity } from './permission.orm-entity';
import { RoleOrmEntity } from './role.orm-entity';
import { RolePermissionOrmEntity } from './role-permission.orm-entity';

@Injectable()
export class TypeOrmRoleRepository implements RoleRepository {
  constructor(
    @InjectRepository(RoleOrmEntity)
    private readonly roles: Repository<RoleOrmEntity>,
    @InjectRepository(RolePermissionOrmEntity)
    private readonly rolePermissions: Repository<RolePermissionOrmEntity>,
    @InjectRepository(PermissionOrmEntity)
    private readonly permissions: Repository<PermissionOrmEntity>,
    private readonly dataSource: DataSource,
  ) {}

  async findById(id: RoleId): Promise<Role | null> {
    const row = await this.roles.findOne({ where: { externalId: id.value } });
    return row ? this.toDomain(row, await this.permissionIdsOf([row.id])) : null;
  }

  async findByIds(ids: RoleId[]): Promise<Role[]> {
    if (ids.length === 0) {
      return [];
    }
    const rows = await this.roles.find({
      where: { externalId: In(ids.map((id) => id.value)) },
    });
    const permissionIdsByRole = await this.permissionIdsOf(rows.map((row) => row.id));
    return rows.map((row) => this.toDomain(row, permissionIdsByRole));
  }

  async findByName(name: RoleName): Promise<Role | null> {
    const row = await this.roles.findOne({ where: { name: name.value } });
    return row ? this.toDomain(row, await this.permissionIdsOf([row.id])) : null;
  }

  async existsByName(name: RoleName): Promise<boolean> {
    return this.roles.exists({ where: { name: name.value } });
  }

  async save(role: Role): Promise<void> {
    const row = new RoleOrmEntity();
    row.externalId = role.id.value;
    row.name = role.name.value;
    row.description = role.description;
    row.isSystem = role.isSystem;
    row.createdAt = role.createdAt;
    row.updatedAt = role.updatedAt;

    const existing = await this.roles.findOne({
      where: { externalId: role.id.value },
      select: { id: true },
    });
    if (existing) {
      row.id = existing.id;
    }

    const permissionRows =
      role.permissionIds.length > 0
        ? await this.permissions.find({ where: { externalId: In(role.permissionIds) } })
        : [];
    const internalPermissionIds = permissionRows.map((permissionRow) => permissionRow.id);

    await this.dataSource.transaction(async (manager) => {
      await manager.save(RoleOrmEntity, row);
      await manager.delete(RolePermissionOrmEntity, { roleId: row.id });
      if (internalPermissionIds.length > 0) {
        await manager.insert(
          RolePermissionOrmEntity,
          internalPermissionIds.map((permissionId) => ({ roleId: row.id, permissionId })),
        );
      }
    });
  }

  async delete(role: Role): Promise<void> {
    await this.roles.delete({ externalId: role.id.value });
  }

  private async permissionIdsOf(internalRoleIds: string[]): Promise<Map<string, string[]>> {
    if (internalRoleIds.length === 0) {
      return new Map();
    }
    const links = await this.rolePermissions.find({ where: { roleId: In(internalRoleIds) } });
    if (links.length === 0) {
      return new Map();
    }
    const permissionRows = await this.permissions.find({
      where: { id: In([...new Set(links.map((link) => link.permissionId))]) },
    });
    const externalIdByInternalId = new Map(permissionRows.map((row) => [row.id, row.externalId]));
    const byRole = new Map<string, string[]>();
    for (const link of links) {
      const externalId = externalIdByInternalId.get(link.permissionId);
      if (!externalId) {
        continue;
      }
      const bucket = byRole.get(link.roleId) ?? [];
      bucket.push(externalId);
      byRole.set(link.roleId, bucket);
    }
    return byRole;
  }

  private toDomain(row: RoleOrmEntity, permissionIdsByRole: Map<string, string[]>): Role {
    return Role.restore({
      id: RoleId.create(row.externalId),
      name: RoleName.create(row.name),
      description: row.description,
      isSystem: row.isSystem,
      permissionIds: permissionIdsByRole.get(row.id) ?? [],
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
}
