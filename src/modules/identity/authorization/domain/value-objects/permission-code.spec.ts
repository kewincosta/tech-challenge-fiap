import { describe, expect, it } from 'vitest';
import { InvalidPermissionCodeError } from '../errors/invalid-permission-code.error';
import { PermissionCode } from './permission-code';

describe('PermissionCode', () => {
  it('should accept a resource and action code', () => {
    expect(PermissionCode.create('users:read').value).toBe('users:read');
  });

  it('should accept a hyphenated resource', () => {
    expect(PermissionCode.create('user-access:manage').value).toBe('user-access:manage');
  });

  it('should not accept a code without an action', () => {
    expect(() => PermissionCode.create('users')).toThrow(InvalidPermissionCodeError);
  });

  it('should not accept an uppercase code', () => {
    expect(() => PermissionCode.create('Users:Read')).toThrow(InvalidPermissionCodeError);
  });
});
