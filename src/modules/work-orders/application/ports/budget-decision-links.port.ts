/** The two addresses with which a customer decides one budget. */
export interface BudgetDecisionUrls {
  approvalUrl: string;
  rejectionUrl: string;
}

/**
 * Where a customer decides a budget. The answer of the API and the e-mail of a budget awaiting
 * approval carry the same addresses, and the HTTP adapter that receives the decisions owns them.
 * Round 1 is generated again, under the same id, after a rejection, so each address carries a
 * hash of the moment the budget was generated.
 */
export interface BudgetDecisionLinks {
  of(workOrderNumber: string, budgetId: string, generatedAt: Date): BudgetDecisionUrls;
}

/** Tells whether the `link` of a request is the one the addresses of that generation carry. */
export interface BudgetLinkVerifier {
  isCurrent(budgetId: string, generatedAt: Date, link: string): boolean;
}
