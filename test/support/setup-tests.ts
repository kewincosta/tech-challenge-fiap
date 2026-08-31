import { resolve } from 'node:path';
import { faker } from '@faker-js/faker';
import { config } from 'dotenv';

config({ path: resolve(__dirname, '../../.env.test'), override: true, quiet: true });
faker.seed(20260826);
