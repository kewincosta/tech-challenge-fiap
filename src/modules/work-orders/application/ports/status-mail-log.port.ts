export interface StatusMailLog {
  /** The e-mail for a status change of this work order did not go out, and nothing sends it again. */
  failed(workOrderNumber: string, error: unknown): void;
}
