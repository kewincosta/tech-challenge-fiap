import { EffectiveAccessDto } from '../dtos/effective-access.dto';
import { AccessCache } from '../ports/access-cache.port';
import { EffectiveAccessReader } from '../ports/effective-access-reader.port';

export class EffectiveAccessService {
  constructor(
    private readonly cache: AccessCache,
    private readonly reader: EffectiveAccessReader,
  ) {}

  async getEffectiveAccess(userId: string): Promise<EffectiveAccessDto> {
    const cached = await this.cache.get(userId);
    if (cached) {
      return cached;
    }
    const access = await this.reader.read(userId);
    await this.cache.set(userId, access);
    return access;
  }

  async invalidate(userId: string): Promise<void> {
    await this.cache.invalidate(userId);
  }
}
