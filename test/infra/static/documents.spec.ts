import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPOSITORY_ROOT } from '../support/docker';
import { readText } from '../support/hcl';

const ADR_FOLDER = join(REPOSITORY_ROOT, 'docs/adr');

/** The records of the infrastructure feature and the decisions of `.specs/STATE.md` they come from. */
const RECORDS: Array<[adr: number, decision: number]> = [
  [38, 22],
  [39, 23],
  [40, 24],
  [41, 25],
];

const pad = (value: number, width: number): string => String(value).padStart(width, '0');

describe('Decision records', () => {
  it('records AD-022 to AD-025 as ADRs 0038 to 0041 that name each other', () => {
    const state = readText(join(REPOSITORY_ROOT, '.specs/STATE.md')).split('\n');
    const index = readText(join(ADR_FOLDER, 'README.md')).split('\n');
    const files = readdirSync(ADR_FOLDER);
    const named = new Set<string>();

    for (const [adr, decision] of RECORDS) {
      const number = pad(adr, 4);
      const id = `AD-${pad(decision, 3)}`;
      const matching = files.filter(
        (file) => file.startsWith(`${number}-`) && file.endsWith('.md'),
      );

      expect(matching, `one file for ADR ${number}`).toHaveLength(1);
      const file = matching[0];
      const text = readText(join(ADR_FOLDER, file));
      const title = /^# (\d{4})\. (.+)$/m.exec(text);

      // The record is accepted, says where it comes from, and has the four sections in order.
      expect(title?.[1], `${file} opens with its number`).toBe(number);
      expect(text, `${file} is accepted`).toMatch(/^\*\*Status\*\*: Accepted$/m);
      expect(text, `${file} names ${id}`).toMatch(
        new RegExp(`^\\*\\*Source\\*\\*: ${id} in \`\\.specs/STATE\\.md\`$`, 'm'),
      );
      expect(text, `${file} says when it was recorded`).toMatch(
        /^\*\*Recorded\*\*: \d{4}-\d{2}-\d{2}/m,
      );
      const sections = [...text.matchAll(/^## (.+)$/gm)].map((match) => match[1]);
      expect(sections, file).toEqual(['Context', 'Decision', 'Alternatives', 'Consequences']);

      // The row of the log names the record.
      const row = state.find((line) => line.startsWith(`| ${id} |`));
      expect(row, `${id} is in the log`).toBeDefined();
      expect(row, `${id} names ADR ${number}`).toContain(`(ADR ${number})`);
      expect(row, `${id} is active`).toMatch(/\| active \|/);

      // The index lists the record under the title it carries, as accepted.
      const entry = index.find((line) => line.startsWith(`| [${number}](${file})`));
      const cells = (entry ?? '').split('|').map((cell) => cell.trim());
      expect(entry, `${file} is in the index`).toBeDefined();
      expect(cells[2], `${file} has its title in the index`).toBe(title?.[2]);
      expect(cells[3], `${file} is accepted in the index`).toBe('Accepted');

      // Every record it links to exists, and the four link to one another.
      for (const link of text.matchAll(/\]\((\d{4}-[^)\s]+\.md)\)/g)) {
        expect(files, `${file} links to ${link[1]}`).toContain(link[1]);
        if (
          RECORDS.some(([other]) => link[1].startsWith(`${pad(other, 4)}-`)) &&
          !link[1].startsWith(number)
        ) {
          named.add(link[1].slice(0, 4));
        }
      }
    }
    expect([...named].sort(), 'each of the four is named by another one').toEqual([
      '0038',
      '0039',
      '0040',
      '0041',
    ]);
  });
});
