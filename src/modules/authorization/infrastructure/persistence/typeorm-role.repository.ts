import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { Role } from '../../domain/entities/role';
import { RoleRepository } from '../../domain/repositories/role.repository';
import { RoleId } from '../../domain/value-objects/role-id';
import { RoleName } from '../../domain/value-objects/role-name';
import { RoleOrmEntity } from './role.orm-entity';
import { RolePermissionOrmEntity } from './role-permission.orm-entity';

@Injectable()
export class TypeOrmRoleRepository implements RoleRepository {
  constructor(
    @InjectRepository(RoleOrmEntity)
    private readonly roles: Repository<RoleOrmEntity>,
    @InjectRepository(RolePermissionOrmEntity)
    private readonly rolePermissions: Repository<RolePermissionOrmEntity>,
    private readonly dataSource: DataSource,
  ) {}

  async findById(id: RoleId): Promise<Role | null> {
    const row = await this.roles.findOne({ where: { id: id.value } });
    return row ? this.toDomain(row, await this.permissionIdsOf([row.id])) : null;
  }

  async findByIds(ids: RoleId[]): Promise<Role[]> {
    if (ids.length === 0) {
      return [];
    }
    const rows = await this.roles.find({ where: { id: In(ids.map((id) => id.value)) } });
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
    row.id = role.id.value;
    row.name = role.name.value;
    row.description = role.description;
    row.isSystem = role.isSystem;
    row.createdAt = role.createdAt;
    row.updatedAt = role.updatedAt;
    const links = role.permissionIds.map((permissionId) => ({
      roleId: role.id.value,
      permissionId,
    }));
    await this.dataSource.transaction(async (manager) => {
      await manager.save(RoleOrmEntity, row);
      await manager.delete(RolePermissionOrmEntity, { roleId: role.id.value });
      if (links.length > 0) {
        await manager.insert(RolePermissionOrmEntity, links);
      }
    });
  }

  async delete(role: Role): Promise<void> {
    await this.roles.delete({ id: role.id.value });
  }

  private async permissionIdsOf(roleIds: string[]): Promise<Map<string, string[]>> {
    if (roleIds.length === 0) {
      return new Map();
    }
    const links = await this.rolePermissions.find({ where: { roleId: In(roleIds) } });
    const byRole = new Map<string, string[]>();
    for (const link of links) {
      const bucket = byRole.get(link.roleId) ?? [];
      bucket.push(link.permissionId);
      byRole.set(link.roleId, bucket);
    }
    return byRole;
  }

  private toDomain(row: RoleOrmEntity, permissionIdsByRole: Map<string, string[]>): Role {
    return Role.restore({
      id: RoleId.create(row.id),
      name: RoleName.create(row.name),
      description: row.description,
      isSystem: row.isSystem,
      permissionIds: permissionIdsByRole.get(row.id) ?? [],
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
}
