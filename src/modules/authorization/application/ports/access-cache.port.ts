import { EffectiveAccessDto } from '../dtos/effective-access.dto';

export interface AccessCache {
  get(userId: string): Promise<EffectiveAccessDto | null>;
  set(userId: string, access: EffectiveAccessDto): Promise<void>;
  invalidate(userId: string): Promise<void>;
}

export const ACCESS_CACHE = Symbol('AccessCache');
