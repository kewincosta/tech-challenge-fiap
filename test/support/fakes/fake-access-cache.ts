import { EffectiveAccessDto } from '../../../src/modules/authorization/application/dtos/effective-access.dto';
import { AccessCache } from '../../../src/modules/authorization/application/ports/access-cache.port';

export class FakeAccessCache implements AccessCache {
  readonly entries = new Map<string, EffectiveAccessDto>();

  async get(userId: string): Promise<EffectiveAccessDto | null> {
    return Promise.resolve(this.entries.get(userId) ?? null);
  }

  async set(userId: string, access: EffectiveAccessDto): Promise<void> {
    this.entries.set(userId, access);
    return Promise.resolve();
  }

  async invalidate(userId: string): Promise<void> {
    this.entries.delete(userId);
    return Promise.resolve();
  }
}
