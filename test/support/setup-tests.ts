import { resolve } from 'node:path';
import { config } from 'dotenv';

config({ path: resolve(__dirname, '../../.env.test'), override: true, quiet: true });
// No fixed faker.seed() here: the test database is never truncated (see .specs/STATE.md
// Conventions), so faker-derived data such as emails must differ across process runs, not just
// within one run. A fixed seed reproduces the exact same "random" sequence every time the suite
// starts, which collides with rows a previous run already inserted - discovered when T9 made
// registration succeed often enough, across repeated e2e runs, for the collision to surface.
