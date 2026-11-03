import { EffectiveAccessDto } from '../dtos/effective-access.dto';

export interface EffectiveAccessReader {
  read(userId: string): Promise<EffectiveAccessDto>;
}
