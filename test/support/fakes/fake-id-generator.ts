import { IdGenerator } from '../../../src/shared/application/ports/id-generator.port';

export class FakeIdGenerator implements IdGenerator {
  private counter = 0;

  generate(): string {
    this.counter += 1;
    return `00000000-0000-4000-8000-${String(this.counter).padStart(12, '0')}`;
  }
}
