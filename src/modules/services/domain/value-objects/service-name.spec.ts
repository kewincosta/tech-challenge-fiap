import { describe, expect, it } from 'vitest';
import { InvalidServiceNameError } from '../errors/invalid-service-name.error';
import { ServiceName } from './service-name';

describe('ServiceName', () => {
  it('should accept a valid name and expose it trimmed', () => {
    expect(ServiceName.create('  Troca de oleo  ').value).toBe('Troca de oleo');
  });

  it('should collapse runs of internal whitespace to a single space', () => {
    expect(ServiceName.create('Troca   de\toleo').value).toBe('Troca de oleo');
  });

  it('should reject an empty or whitespace-only name', () => {
    expect(() => ServiceName.create('')).toThrow(InvalidServiceNameError);
    expect(() => ServiceName.create('   ')).toThrow(InvalidServiceNameError);
  });

  it('should reject a name longer than 120 characters', () => {
    expect(() => ServiceName.create('a'.repeat(121))).toThrow(InvalidServiceNameError);
    expect(ServiceName.create('a'.repeat(120)).value).toHaveLength(120);
  });

  it('should preserve the capitalisation as supplied', () => {
    expect(ServiceName.create('Troca De Oleo').value).toBe('Troca De Oleo');
  });
});
