import { describe, expect, it } from 'vitest';
import { InvalidEmailError } from '../errors/invalid-email.error';
import { Email } from './email';

describe('Email', () => {
  it('should normalize a valid email to lowercase', () => {
    const email = Email.create('  Jane.Doe@Example.COM ');

    expect(email.value).toBe('jane.doe@example.com');
  });

  it('should not accept an email without a domain', () => {
    expect(() => Email.create('jane.doe')).toThrow(InvalidEmailError);
  });

  it('should not accept an empty email', () => {
    expect(() => Email.create('   ')).toThrow(InvalidEmailError);
  });

  it('should not accept an email with spaces', () => {
    expect(() => Email.create('jane doe@example.com')).toThrow(InvalidEmailError);
  });
});
