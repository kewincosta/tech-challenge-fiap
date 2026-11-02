import { describe, expect, it } from 'vitest';
import { HttpBudgetDecisionLinks } from './http-budget-decision-links';

const NUMBER = 'A1B090-2026';
const BUDGET_ID = '88888888-8888-4888-8888-888888888888';

describe('HttpBudgetDecisionLinks', () => {
  it('builds the approval and the rejection address of a budget under the public address', () => {
    const links = new HttpBudgetDecisionLinks('https://oficina.example.com');

    expect(links.of(NUMBER, BUDGET_ID)).toEqual({
      approvalUrl: `https://oficina.example.com/api/v1/work-orders/${NUMBER}/budgets/${BUDGET_ID}/approval`,
      rejectionUrl: `https://oficina.example.com/api/v1/work-orders/${NUMBER}/budgets/${BUDGET_ID}/rejection`,
    });
  });

  it('ignores the slashes that end the public address', () => {
    const links = new HttpBudgetDecisionLinks('http://localhost:13000//');

    expect(links.of(NUMBER, BUDGET_ID).approvalUrl).toBe(
      `http://localhost:13000/api/v1/work-orders/${NUMBER}/budgets/${BUDGET_ID}/approval`,
    );
  });

  it('keeps a path the public address carries', () => {
    const links = new HttpBudgetDecisionLinks('https://example.com/oficina/');

    expect(links.of(NUMBER, BUDGET_ID).rejectionUrl).toBe(
      `https://example.com/oficina/api/v1/work-orders/${NUMBER}/budgets/${BUDGET_ID}/rejection`,
    );
  });
});
