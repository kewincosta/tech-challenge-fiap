import { createHash, timingSafeEqual } from 'node:crypto';
import {
  BudgetDecisionLinks,
  BudgetDecisionUrls,
  BudgetLinkVerifier,
} from '../application/ports/budget-decision-links.port';

/**
 * The routes `WorkOrdersController` declares for deciding a budget, under the public address of
 * the API: `POST` to the approval address approves that budget, `POST` to the rejection address
 * rejects it, both with the customer's bearer token.
 *
 * Both addresses end in `?link=` and a hash of the budget's generation: the first 32 hexadecimal
 * characters of the SHA-256 of `<budget id>:<generatedAt in epoch milliseconds>`. A rejected round
 * 1 is generated again under its old id, so the hash is what lets the route refuse an address
 * sent before that. The customer's bearer token already authenticates the call, which is why the
 * hash carries no secret.
 */
export class HttpBudgetDecisionLinks implements BudgetDecisionLinks, BudgetLinkVerifier {
  private readonly publicUrl: string;

  constructor(publicUrl: string) {
    this.publicUrl = publicUrl.replace(/\/+$/, '');
  }

  of(workOrderNumber: string, budgetId: string, generatedAt: Date): BudgetDecisionUrls {
    const budget = `${this.publicUrl}/api/v1/work-orders/${workOrderNumber}/budgets/${budgetId}`;
    const query = `?link=${this.hashOf(budgetId, generatedAt)}`;
    return {
      approvalUrl: `${budget}/approval${query}`,
      rejectionUrl: `${budget}/rejection${query}`,
    };
  }

  isCurrent(budgetId: string, generatedAt: Date, link: string): boolean {
    const expected = Buffer.from(this.hashOf(budgetId, generatedAt));
    const given = Buffer.from(link);
    // The length of the hash is no secret, and `timingSafeEqual` refuses buffers of two lengths.
    return given.length === expected.length && timingSafeEqual(given, expected);
  }

  private hashOf(budgetId: string, generatedAt: Date): string {
    return createHash('sha256')
      .update(`${budgetId}:${generatedAt.getTime()}`)
      .digest('hex')
      .slice(0, 32);
  }
}
