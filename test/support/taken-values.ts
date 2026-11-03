// The CPFs and plates that the factories in test/support/factories do not hand out. The set holds
// the values they handed out in this test file, and a factory draws again when it meets one, so no
// call hands out a value twice. The test database is never truncated, so it keeps every user and
// vehicle that earlier runs inserted, and a CPF or a plate that an active row holds meets the unique
// index of its table (ux_users_document, ux_vehicles_plate). The integration and e2e suites also
// load the values of the active rows of the database into the set before each test file
// (setup-taken-values.ts). The unit suite and the infra runtime specs load nothing, so for them the
// set only keeps a file from drawing one value twice.
export const takenValues = new Set<string>();

// Plenty: a plate, the likelier of the two, lands on a taken value about once in three thousand
// draws. A factory that keeps meeting taken values, because Math.random is stubbed to repeat itself,
// fails instead of looping.
const MAX_DRAWS = 1000;

/** Draws until the value is not taken, and takes it, so no call hands out the same value again. */
export function drawFree(draw: () => string): string {
  for (let draws = 0; draws < MAX_DRAWS; draws += 1) {
    const value = draw();

    if (!takenValues.has(value)) {
      takenValues.add(value);
      return value;
    }
  }
  throw new Error(`All ${MAX_DRAWS} draws gave a value that is already taken.`);
}
