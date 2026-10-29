import { entity } from '../domain/entity';
import { repoPort } from './ports/repo.port';

export const useCase = [entity, repoPort];
