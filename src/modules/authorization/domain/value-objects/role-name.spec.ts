import { describe, expect, it } from 'vitest';
import { InvalidRoleNameError } from '../errors/invalid-role-name.error';
import { RoleName } from './role-name';

describe('RoleName', () => {
  it('should normalize a role name to uppercase', () => {
    expect(RoleName.create(' mechanic ').value).toBe('MECHANIC');
  });

  it('should accept underscores and digits', () => {
    expect(RoleName.create('WORKSHOP_MANAGER_2').value).toBe('WORKSHOP_MANAGER_2');
  });

  it('should not accept a name starting with a digit', () => {
    expect(() => RoleName.create('2MECHANIC')).toThrow(InvalidRoleNameError);
  });

  it('should not accept a single character name', () => {
    expect(() => RoleName.create('A')).toThrow(InvalidRoleNameError);
  });
});
