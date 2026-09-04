import { randomUUID } from 'node:crypto';
import { Permission } from '../../../src/modules/authorization/domain/entities/permission';
import { PermissionRepository } from '../../../src/modules/authorization/domain/repositories/permission.repository';
import { PermissionCode } from '../../../src/modules/authorization/domain/value-objects/permission-code';
import { PermissionId } from '../../../src/modules/authorization/domain/value-objects/permission-id';

export class FakePermissionRepository implements PermissionRepository {
  private readonly permissions: Permission[];

  constructor(codes: string[]) {
    this.permissions = codes.map((code) =>
      Permission.restore({
        id: PermissionId.create(randomUUID()),
        code: PermissionCode.create(code),
        description: null,
      }),
    );
  }

  async findAll(): Promise<Permission[]> {
    return Promise.resolve([...this.permissions]);
  }

  async findByIds(ids: PermissionId[]): Promise<Permission[]> {
    return Promise.resolve(
      this.permissions.filter((permission) => ids.some((id) => permission.id.equals(id))),
    );
  }

  async findByCodes(codes: PermissionCode[]): Promise<Permission[]> {
    return Promise.resolve(
      this.permissions.filter((permission) => codes.some((code) => permission.code.equals(code))),
    );
  }
}
