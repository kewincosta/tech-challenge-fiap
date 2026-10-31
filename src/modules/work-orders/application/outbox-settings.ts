export interface OutboxSettings {
  /** How often the processor looks for due steps, in milliseconds. 0 turns the processor off. */
  pollIntervalMs: number;
  /** How long an armed step waits before it is undone, and how long a claim on a step lasts. */
  graceSeconds: number;
  /** The attempt at which a step that keeps failing is marked failed. */
  maxAttempts: number;
}
