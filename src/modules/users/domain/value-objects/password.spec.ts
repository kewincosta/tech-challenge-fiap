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
});
