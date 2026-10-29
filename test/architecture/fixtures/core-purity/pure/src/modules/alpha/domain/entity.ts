export class Entity implements Iterable<number> {
  *[Symbol.iterator](): Iterator<number> {
    yield 1;
  }
}
