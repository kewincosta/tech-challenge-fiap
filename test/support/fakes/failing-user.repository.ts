import { InMemoryUserRepository } from './in-memory-user.repository';

/** Fails every lookup by id with the failure it is given, the way a database that is down does. */
export class FailingUserRepository extends InMemoryUserRepository {
  constructor(private readonly failure: Error) {
    super();
  }

  override async findById(): Promise<never> {
    return Promise.reject(this.failure);
  }
}
