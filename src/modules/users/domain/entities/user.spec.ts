import { describe, expect, it } from 'vitest';
import { buildUser } from '../../../../../test/support/factories/user.factory';
import { InvalidUserNameError } from '../errors/invalid-user-name.error';
import { UserRegistered } from '../events/user-registered.event';
import { UserStatus } from '../user-status';
import { User } from './user';
import { Email } from '../value-objects/email';
import { PasswordHash } from '../value-objects/password-hash';
import { PersonDocument } from '../value-objects/person-document';

describe('User', () => {
  it('should register an active user and record a UserRegistered event', () => {
    const user = buildUser({ email: 'jane@example.com' });

    const events = user.pullDomainEvents();

    expect(user.status).toBe(UserStatus.Active);
    expect(user.canAuthenticate()).toBe(true);
    expect(events).toHaveLength(1);
    expect(events[0]).toBeInstanceOf(UserRegistered);
  });

  it('should register a user with its document', () => {
    const user = buildUser({ document: '11144477735' });

    expect(user.document.value).toBe('11144477735');
    expect(user.document.kind).toBe('CPF');
  });

  it('should restore a user together with its document', () => {
    const document = PersonDocument.create('11144477735');
    const now = new Date('2026-08-26T13:00:00.000Z');

    const user = User.restore({
      id: buildUser().id,
      email: buildUser({ email: 'restored@example.com' }).email,
      name: 'Restored User',
      document,
      passwordHash: PasswordHash.create('hashed:old'),
      status: UserStatus.Active,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    expect(user.document.equals(document)).toBe(true);
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
    const now = new Date('2026-08-26T13:00:00.000Z');

    user.deactivate(now);

    expect(user.status).toBe(UserStatus.Inactive);
    expect(user.canAuthenticate()).toBe(false);
  });

  it('should soft delete a user on deactivation, matching the schema deleted_at filter', () => {
    const user = buildUser();
    const now = new Date('2026-08-26T13:00:00.000Z');

    user.deactivate(now);

    expect(user.deletedAt).toEqual(now);
  });

  it('should be a no-op to deactivate an already inactive user', () => {
    const user = buildUser();
    const firstNow = new Date('2026-08-26T13:00:00.000Z');
    const laterNow = new Date('2026-08-27T13:00:00.000Z');
    user.deactivate(firstNow);

    user.deactivate(laterNow);

    expect(user.deletedAt).toEqual(firstNow);
    expect(user.updatedAt).toEqual(firstNow);
  });

  it('should change the password hash', () => {
    const user = buildUser({ passwordHash: 'hashed:old' });

    user.changePassword(PasswordHash.create('hashed:new'), new Date('2026-08-26T13:00:00.000Z'));

    expect(user.passwordHash.value).toBe('hashed:new');
  });

  it('should update the name, email and document, each revalidated', () => {
    const user = buildUser({ name: 'Jane Doe' });
    const now = new Date('2026-08-26T13:00:00.000Z');

    user.updateProfile(
      { name: 'Jane Updated', email: Email.create('updated@example.com'), document: PersonDocument.create('52998224725') },
      now,
    );

    expect(user.name).toBe('Jane Updated');
    expect(user.email.value).toBe('updated@example.com');
    expect(user.document.value).toBe('52998224725');
    expect(user.updatedAt).toEqual(now);
  });

  it('should update only the fields supplied, leaving the rest untouched', () => {
    const user = buildUser({ name: 'Jane Doe', email: 'jane@example.com', document: '11144477735' });
    const now = new Date('2026-08-26T13:00:00.000Z');

    user.updateProfile({ name: 'Jane Renamed' }, now);

    expect(user.name).toBe('Jane Renamed');
    expect(user.email.value).toBe('jane@example.com');
    expect(user.document.value).toBe('11144477735');
  });

  it('should not update the name to fewer than 2 characters', () => {
    const user = buildUser();

    expect(() => user.updateProfile({ name: 'J' }, new Date())).toThrow(InvalidUserNameError);
  });
});
