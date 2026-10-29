export interface WorkOrderNumberGenerator {
  /** A candidate number for the given year - not guaranteed unique, the caller retries on collision. */
  next(year: number): string;
}
