import { InvalidRoleNameError } from '../errors/invalid-role-name.error';

const ROLE_NAME_PATTERN = /^[A-Z][A-Z0-9_]{1,49}$/;

export class RoleName {
  private constructor(readonly value: string) {}

  static create(raw: string): RoleName {
    const normalized = typeof raw === 'string' ? raw.trim().toUpperCase() : '';
    if (!ROLE_NAME_PATTERN.test(normalized)) {
      throw new InvalidRoleNameError();
    }
    return new RoleName(normalized);
  }

  equals(other?: RoleName): boolean {
    return other instanceof RoleName && other.value === this.value;
  }
}
