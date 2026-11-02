import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { HttpBudgetDecisionLinks } from './http-budget-decision-links';

const NUMBER = 'A1B090-2026';
const BUDGET_ID = '88888888-8888-4888-8888-888888888888';
const GENERATED_AT = new Date('2026-09-01T09:30:00.000Z');
// The first 32 hexadecimal characters of the SHA-256 of "<budget id>:<epoch milliseconds>", which
// is "88888888-8888-4888-8888-888888888888:1788255000000" here.
const LINK_HASH = '3c64ce548c17bb2d06154d75289431b2';

function hashOf(budgetId: string, generatedAt: Date): string {
  return createHash('sha256')
    .update(`${budgetId}:${generatedAt.getTime()}`)
    .digest('hex')
    .slice(0, 32);
}

describe('HttpBudgetDecisionLinks', () => {
  it('builds the approval and the rejection address of a budget under the public address, each with the hash of its generation', () => {
    const links = new HttpBudgetDecisionLinks('https://oficina.example.com');

    expect(links.of(NUMBER, BUDGET_ID, GENERATED_AT)).toEqual({
      approvalUrl: `https://oficina.example.com/api/v1/work-orders/${NUMBER}/budgets/${BUDGET_ID}/approval?link=${LINK_HASH}`,
      rejectionUrl: `https://oficina.example.com/api/v1/work-orders/${NUMBER}/budgets/${BUDGET_ID}/rejection?link=${LINK_HASH}`,
    });
  });

  it('writes the first 32 hexadecimal characters of the SHA-256 of the budget id and its generation in epoch milliseconds', () => {
    const links = new HttpBudgetDecisionLinks('https://oficina.example.com');
    const otherBudget = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const otherGeneration = new Date('2026-10-15T18:04:05.678Z');

    for (const [budgetId, generatedAt] of [
      [BUDGET_ID, GENERATED_AT],
      [otherBudget, GENERATED_AT],
      [BUDGET_ID, otherGeneration],
    ] as const) {
      const { approvalUrl, rejectionUrl } = links.of(NUMBER, budgetId, generatedAt);

      const hash = hashOf(budgetId, generatedAt);
      expect(hash).toMatch(/^[0-9a-f]{32}$/);
      expect(new URL(approvalUrl).searchParams.get('link')).toBe(hash);
      expect(new URL(rejectionUrl).searchParams.get('link')).toBe(hash);
    }
  });

  it('changes the hash when the budget is generated again, even a millisecond later', () => {
    const links = new HttpBudgetDecisionLinks('https://oficina.example.com');
    const later = new Date(GENERATED_AT.getTime() + 1);

    const first = links.of(NUMBER, BUDGET_ID, GENERATED_AT);
    const regenerated = links.of(NUMBER, BUDGET_ID, later);

    expect(regenerated.approvalUrl).not.toBe(first.approvalUrl);
    expect(regenerated.rejectionUrl).not.toBe(first.rejectionUrl);
    expect(new URL(first.approvalUrl).pathname).toBe(new URL(regenerated.approvalUrl).pathname);
  });

  it('ignores the slashes that end the public address', () => {
    const links = new HttpBudgetDecisionLinks('http://localhost:13000//');

    expect(links.of(NUMBER, BUDGET_ID, GENERATED_AT).approvalUrl).toBe(
      `http://localhost:13000/api/v1/work-orders/${NUMBER}/budgets/${BUDGET_ID}/approval?link=${LINK_HASH}`,
    );
  });

  it('keeps a path the public address carries', () => {
    const links = new HttpBudgetDecisionLinks('https://example.com/oficina/');

    expect(links.of(NUMBER, BUDGET_ID, GENERATED_AT).rejectionUrl).toBe(
      `https://example.com/oficina/api/v1/work-orders/${NUMBER}/budgets/${BUDGET_ID}/rejection?link=${LINK_HASH}`,
    );
  });

  describe('isCurrent', () => {
    const links = new HttpBudgetDecisionLinks('https://oficina.example.com');

    it('accepts the hash its own links carry for the generation', () => {
      expect(links.isCurrent(BUDGET_ID, GENERATED_AT, LINK_HASH)).toBe(true);
    });

    it('accepts the hash the links of that generation carry, whichever one it is', () => {
      const generatedAt = new Date('2026-10-15T18:04:05.678Z');
      const { approvalUrl } = links.of(NUMBER, BUDGET_ID, generatedAt);
      const hash = new URL(approvalUrl).searchParams.get('link') ?? '';

      expect(links.isCurrent(BUDGET_ID, generatedAt, hash)).toBe(true);
    });

    it('refuses the hash of an earlier generation of the same budget', () => {
      const regeneratedAt = new Date(GENERATED_AT.getTime() + 1);

      expect(links.isCurrent(BUDGET_ID, regeneratedAt, LINK_HASH)).toBe(false);
    });

    it('refuses the hash of another budget', () => {
      expect(links.isCurrent('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', GENERATED_AT, LINK_HASH)).toBe(
        false,
      );
    });

    it.each([
      ['its first character changed', `0${LINK_HASH.slice(1)}`],
      ['its last character changed', `${LINK_HASH.slice(0, -1)}0`],
      ['a character that is not hexadecimal', `${LINK_HASH.slice(0, 31)}z`],
      ['nothing', ''],
      ['a prefix of it', LINK_HASH.slice(0, 31)],
      ['it with one more character', `${LINK_HASH}0`],
    ])('refuses %s', (_label, link) => {
      expect(links.isCurrent(BUDGET_ID, GENERATED_AT, link)).toBe(false);
    });
  });
});
