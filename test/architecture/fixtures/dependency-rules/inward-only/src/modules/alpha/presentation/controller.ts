import { useCase } from '../application/use-case';
import { repo } from '../infrastructure/repo';

export const controller = [useCase, repo];
