import { BudgetLinkVerifier } from '../../../src/modules/work-orders/application/ports/budget-decision-links.port';

/**
 * Stands for the HTTP adapter that owns the links. The link of a budget is its id and the moment
 * it was generated written out, so a test can hold the link of an earlier generation.
 */
export class FakeBudgetLinks implements BudgetLinkVerifier {
  linkOf(budgetId: string, generatedAt: Date): string {
    return `${budgetId}@${generatedAt.getTime()}`;
  }

  isCurrent(budgetId: string, generatedAt: Date, link: string): boolean {
    return link === this.linkOf(budgetId, generatedAt);
  }
}
