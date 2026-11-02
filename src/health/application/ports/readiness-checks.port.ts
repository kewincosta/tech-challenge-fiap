/**
 * One question per dependency the application cannot work without. A check resolves when the
 * dependency answers and rejects when it cannot.
 */
export interface ReadinessChecks {
  database(): Promise<void>;
  redis(): Promise<void>;
}
