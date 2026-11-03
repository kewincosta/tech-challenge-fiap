import { usesConfig } from './modules/alpha/application/uses-config';
import { usesAlpha } from './modules/beta/application/uses-alpha';

export const root = [usesConfig, usesAlpha];
