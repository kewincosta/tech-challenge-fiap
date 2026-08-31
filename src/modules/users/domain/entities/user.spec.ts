import { describe, expect, it } from 'vitest';
import { buildUser } from '../../../../../test/support/factories/user.factory';
import { InvalidUserNameError } from '../errors/invalid-user-name.error';
import { UserRegistered } from '../events/user-registered.event';
import { UserStatus } from '../user-status';
import { PasswordHash } from '../value-objects/password-hash';

describe('User', () => {
  it('should register an active user and record a UserRegistered event', () => {
    const user = buildUser({ email: 'jane@example.com' });

    const events = user.pullDomainEvents();

    expect(user.status).toBe(UserStatus.Active);
    expect(user.canAuthenticate()).toBe(true);
    expect(events).toHaveLength(1);
    expect(events[0]).toBeInstanceOf(UserRegistered);
  });

  it('should trim the name during registration', () => {
    const user = buildUser({ name: '  Jane Doe  ' });

    expect(user.name).toBe('Jane Doe');
  });

  it('should not register a user with a name shorter than 2 characters', () => {
    expect(() => buildUser({ name: 'J' })).toThrow(InvalidUserNameError);
  });

  it('should not authenticate a deactivated user', () => {
    const user = buildUser();

    user.deactivate(new Date('2026-08-26T13:00:00.000Z'));

    expect(user.status).toBe(UserStatus.Inactive);
    expect(user.canAuthenticate()).toBe(false);
  });

  it('should change the password hash', () => {
    const user = buildUser({ passwordHash: 'hashed:old' });

    user.changePassword(PasswordHash.create('hashed:new'), new Date('2026-08-26T13:00:00.000Z'));

    expect(user.passwordHash.value).toBe('hashed:new');
  });
});
