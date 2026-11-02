import {
  BudgetDecisionLinks,
  BudgetDecisionUrls,
} from '../application/ports/budget-decision-links.port';

/**
 * The routes `WorkOrdersController` declares for deciding a budget, under the public address of
 * the API: `POST` to the approval address approves that budget, `POST` to the rejection address
 * rejects it, both with the customer's bearer token.
 */
export class HttpBudgetDecisionLinks implements BudgetDecisionLinks {
  private readonly publicUrl: string;

  constructor(publicUrl: string) {
    this.publicUrl = publicUrl.replace(/\/+$/, '');
  }

  of(workOrderNumber: string, budgetId: string): BudgetDecisionUrls {
    const budget = `${this.publicUrl}/api/v1/work-orders/${workOrderNumber}/budgets/${budgetId}`;
    return { approvalUrl: `${budget}/approval`, rejectionUrl: `${budget}/rejection` };
  }
}
