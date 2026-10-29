import { EffectiveAccessDto } from '../../dtos/effective-access.dto';
import { EffectiveAccessService } from '../../services/effective-access.service';
import { GetUserEffectiveAccessQuery } from './get-user-effective-access.query';

export class GetUserEffectiveAccessUseCase {
  constructor(private readonly effectiveAccess: EffectiveAccessService) {}

  async execute(query: GetUserEffectiveAccessQuery): Promise<EffectiveAccessDto> {
    return this.effectiveAccess.getEffectiveAccess(query.userId);
  }
}
