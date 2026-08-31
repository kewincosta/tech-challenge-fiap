import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Permission } from '../../domain/entities/permission';
import { PermissionRepository } from '../../domain/repositories/permission.repository';
import { PermissionCode } from '../../domain/value-objects/permission-code';
import { PermissionId } from '../../domain/value-objects/permission-id';
import { PermissionOrmEntity } from './permission.orm-entity';

@Injectable()
export class TypeOrmPermissionRepository implements PermissionRepository {
  constructor(
    @InjectRepository(PermissionOrmEntity)
    private readonly permissions: Repository<PermissionOrmEntity>,
  ) {}

  async findAll(): Promise<Permission[]> {
    const rows = await this.permissions.find({ order: { code: 'ASC' } });
    return rows.map((row) => this.toDomain(row));
  }

  async findByIds(ids: PermissionId[]): Promise<Permission[]> {
    if (ids.length === 0) {
      return [];
    }
    const rows = await this.permissions.find({ where: { id: In(ids.map((id) => id.value)) } });
    return rows.map((row) => this.toDomain(row));
  }

  async findByCodes(codes: PermissionCode[]): Promise<Permission[]> {
    if (codes.length === 0) {
      return [];
    }
    const rows = await this.permissions.find({
      where: { code: In(codes.map((code) => code.value)) },
    });
    return rows.map((row) => this.toDomain(row));
  }

  private toDomain(row: PermissionOrmEntity): Permission {
    return Permission.restore({
      id: PermissionId.create(row.id),
      code: PermissionCode.create(row.code),
      description: row.description,
    });
  }
}
