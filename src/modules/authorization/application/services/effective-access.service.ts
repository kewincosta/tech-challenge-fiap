import { Inject, Injectable } from '@nestjs/common';
import { EffectiveAccessDto } from '../dtos/effective-access.dto';
import { ACCESS_CACHE, AccessCache } from '../ports/access-cache.port';
import {
  EFFECTIVE_ACCESS_READER,
  EffectiveAccessReader,
} from '../ports/effective-access-reader.port';

@Injectable()
export class EffectiveAccessService {
  constructor(
    @Inject(ACCESS_CACHE) private readonly cache: AccessCache,
    @Inject(EFFECTIVE_ACCESS_READER) private readonly reader: EffectiveAccessReader,
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
