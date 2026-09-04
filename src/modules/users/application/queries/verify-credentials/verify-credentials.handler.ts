import { Inject } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { USER_REPOSITORY, UserRepository } from '../../../domain/repositories/user.repository';
import { Email } from '../../../domain/value-objects/email';
import { PASSWORD_HASHER, PasswordHasher } from '../../ports/password-hasher.port';
import { VerifiedCredentialsDto, VerifyCredentialsQuery } from './verify-credentials.query';

@QueryHandler(VerifyCredentialsQuery)
export class VerifyCredentialsHandler implements IQueryHandler<
  VerifyCredentialsQuery,
  VerifiedCredentialsDto | null
> {
  private dummyHash: string | null = null;

  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(PASSWORD_HASHER) private readonly passwordHasher: PasswordHasher,
  ) {}

  async execute(query: VerifyCredentialsQuery): Promise<VerifiedCredentialsDto | null> {
    let email: Email;
    try {
      email = Email.create(query.email);
    } catch {
      return null;
    }
    const user = await this.users.findByEmail(email);
    if (!user) {
      await this.passwordHasher.verify(await this.getDummyHash(), query.password);
      return null;
    }
    const passwordMatches = await this.passwordHasher.verify(
      user.passwordHash.value,
      query.password,
    );
    if (!passwordMatches || !user.canAuthenticate()) {
      return null;
    }
    return { userId: user.id.value };
  }

  private async getDummyHash(): Promise<string> {
    this.dummyHash ??= await this.passwordHasher.hash('timing-equalization-placeholder-1');
    return this.dummyHash;
  }
}
