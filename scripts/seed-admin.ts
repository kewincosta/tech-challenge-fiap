// The seed lives in src/seed-admin.ts, which the production image also runs compiled. Importing it
// runs it, so `npm run seed:admin` keeps working through ts-node.
import '../src/seed-admin';
