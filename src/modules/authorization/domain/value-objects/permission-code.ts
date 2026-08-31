import { InvalidPermissionCodeError } from '../errors/invalid-permission-code.error';

const PERMISSION_CODE_PATTERN = /^[a-z][a-z0-9-]*(:[a-z0-9-]+)+$/;
const MAX_LENGTH = 100;

export class PermissionCode {
  private constructor(readonly value: string) {}

  static create(raw: string): PermissionCode {
    const normalized = typeof raw === 'string' ? raw.trim() : '';
    if (normalized.length > MAX_LENGTH || !PERMISSION_CODE_PATTERN.test(normalized)) {
      throw new InvalidPermissionCodeError();
    }
    return new PermissionCode(normalized);
  }

  equals(other?: PermissionCode): boolean {
    return other instanceof PermissionCode && other.value === this.value;
  }
}
