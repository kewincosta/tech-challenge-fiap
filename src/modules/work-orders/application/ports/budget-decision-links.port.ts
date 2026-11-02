/** The two addresses with which a customer decides one budget. */
export interface BudgetDecisionUrls {
  approvalUrl: string;
  rejectionUrl: string;
}

/**
 * Where a customer decides a budget. The answer of the API and the e-mail of a budget awaiting
 * approval carry the same addresses, and the HTTP adapter that receives the decisions owns them.
 */
export interface BudgetDecisionLinks {
  of(workOrderNumber: string, budgetId: string): BudgetDecisionUrls;
}
