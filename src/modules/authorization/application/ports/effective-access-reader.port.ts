import { EffectiveAccessDto } from '../dtos/effective-access.dto';

export interface EffectiveAccessReader {
  read(userId: string): Promise<EffectiveAccessDto>;
}

export const EFFECTIVE_ACCESS_READER = Symbol('EffectiveAccessReader');
