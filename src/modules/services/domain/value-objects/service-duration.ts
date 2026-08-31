import { InvalidServiceDurationError } from '../errors/invalid-service-duration.error';

export class ServiceDuration {
  private constructor(readonly minutes: number) {}

  /** No upper bound: an engine rebuild legitimately spans days (spec.md's Assumptions). */
  static fromMinutes(raw: number): ServiceDuration {
    if (!Number.isInteger(raw) || raw <= 0) {
      throw new InvalidServiceDurationError();
    }
    return new ServiceDuration(raw);
  }

  equals(other?: ServiceDuration): boolean {
    return other instanceof ServiceDuration && other.minutes === this.minutes;
  }
}
