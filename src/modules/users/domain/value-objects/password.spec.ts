import { describe, expect, it } from 'vitest';
import { WeakPasswordError } from '../errors/weak-password.error';
import { Password } from './password';

describe('Password', () => {
  it('should accept a password with letters and digits', () => {
    const password = Password.create('Str0ngPassword');

    expect(password.value).toBe('Str0ngPassword');
  });

  it('should not accept a password shorter than 8 characters', () => {
    expect(() => Password.create('Ab1')).toThrow(WeakPasswordError);
  });

  it('should not accept a password without digits', () => {
    expect(() => Password.create('OnlyLetters')).toThrow(WeakPasswordError);
  });

  it('should not accept a password without letters', () => {
    expect(() => Password.create('12345678')).toThrow(WeakPasswordError);
  });

  it('should generate a password that satisfies the strength rules', () => {
    expect(() => Password.generate()).not.toThrow();
  });

  it('should generate a password with at least one letter and one digit', () => {
    const password = Password.generate();

    expect(password.value).toMatch(/[a-zA-Z]/);
    expect(password.value).toMatch(/\d/);
  });

  it('should generate a different password on each call', () => {
    const first = Password.generate();
    const second = Password.generate();

    expect(first.value).not.toBe(second.value);
  });
});
