import { Clock } from '../../../src/shared/application/ports/clock.port';

export class FakeClock implements Clock {
  constructor(private current: Date = new Date('2026-08-26T12:00:00.000Z')) {}

  now(): Date {
    return new Date(this.current.getTime());
  }

  advanceSeconds(seconds: number): void {
    this.current = new Date(this.current.getTime() + seconds * 1000);
  }

  set(date: Date): void {
    this.current = date;
  }
}
