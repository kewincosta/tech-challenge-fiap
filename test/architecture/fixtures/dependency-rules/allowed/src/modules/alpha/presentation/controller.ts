import { beta } from '../../beta';
import { useCase } from '../application/use-case';
import { repo } from '../infrastructure/typeorm-repo';

export const controller = [beta, useCase, repo];
