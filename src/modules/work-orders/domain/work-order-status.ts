/**
 * All seven states section 11 names. Only `RECEIVED` is reachable by this feature - the other
 * six exist so the `CHECK` constraint and this enum never need rewriting when features 6 to 8
 * open the rest of the state machine.
 */
export enum WorkOrderStatus {
  Received = 'RECEIVED',
  InDiagnosis = 'IN_DIAGNOSIS',
  AwaitingApproval = 'AWAITING_APPROVAL',
  InExecution = 'IN_EXECUTION',
  Completed = 'COMPLETED',
  Delivered = 'DELIVERED',
  Canceled = 'CANCELED',
}
