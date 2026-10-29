import { EffectiveAccessDto } from '../../../src/modules/identity/authorization/application/dtos/effective-access.dto';
import { EffectiveAccessReader } from '../../../src/modules/identity/authorization/application/ports/effective-access-reader.port';

/** Holds the access of the users it is given and answers a user it does not know with none, as the database does. */
export class FakeEffectiveAccessReader implements EffectiveAccessReader {
  private readonly access = new Map<string, EffectiveAccessDto>();
  /** Every user id read, in order. */
  readonly reads: string[] = [];

  /** Seeds the roles and permissions of a user; the permissions left out are none. */
  withAccess(userId: string, access: { roles: string[]; permissions?: string[] }): this {
    this.access.set(userId, { roles: access.roles, permissions: access.permissions ?? [] });
    return this;
  }

  async read(userId: string): Promise<EffectiveAccessDto> {
    this.reads.push(userId);
    return Promise.resolve(this.access.get(userId) ?? { roles: [], permissions: [] });
  }
}
