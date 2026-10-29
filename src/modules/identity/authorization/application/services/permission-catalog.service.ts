import { PermissionNotFoundError } from '../../domain/errors/permission-not-found.error';
import { PermissionRepository } from '../../domain/repositories/permission.repository';
import { PermissionCode } from '../../domain/value-objects/permission-code';

export class PermissionCatalogService {
  constructor(private readonly permissions: PermissionRepository) {}

  async resolveIdsByCodes(codes: string[]): Promise<string[]> {
    if (codes.length === 0) {
      return [];
    }
    const uniqueCodes = [...new Set(codes)].map((code) => PermissionCode.create(code));
    const found = await this.permissions.findByCodes(uniqueCodes);
    if (found.length !== uniqueCodes.length) {
      throw new PermissionNotFoundError();
    }
    return found.map((permission) => permission.id.value);
  }
}
