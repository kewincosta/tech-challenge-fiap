import { Clock } from '../../../../../../shared/application/ports/clock.port';
import { DomainEventPublisher } from '../../../../../../shared/application/ports/domain-event-publisher.port';
import { IdGenerator } from '../../../../../../shared/application/ports/id-generator.port';
import { UserDto } from '../../../../users/application/dtos/user.dto';
import { GetUserByIdUseCase } from '../../../../users/application/queries/get-user-by-id/get-user-by-id.use-case';
import { GetUserByIdQuery } from '../../../../users/application/queries/get-user-by-id/get-user-by-id.query';
import { VerifyCredentialsUseCase } from '../../../../users/application/queries/verify-credentials/verify-credentials.use-case';
import { VerifyCredentialsQuery } from '../../../../users/application/queries/verify-credentials/verify-credentials.query';
import { UserNotFoundError } from '../../../../users/domain/errors/user-not-found.error';
import { Session } from '../../../domain/entities/session';
import { InvalidCredentialsError } from '../../../domain/errors/invalid-credentials.error';
import { RefreshTokenHash } from '../../../domain/value-objects/refresh-token-hash';
import { RefreshTokenId } from '../../../domain/value-objects/refresh-token-id';
import { SessionId } from '../../../domain/value-objects/session-id';
import { AuthSettings } from '../../auth-settings';
import { AuthResultDto } from '../../dtos/auth-result.dto';
import { AccessTokenService } from '../../ports/access-token.port';
import { RefreshTokenHasher } from '../../ports/refresh-token-hasher.port';
import { SessionRepository } from '../../ports/session.repository';
import { AuthenticateUserCommand } from './authenticate-user.command';

export class AuthenticateUserUseCase {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly accessTokens: AccessTokenService,
    private readonly refreshTokenHasher: RefreshTokenHasher,
    private readonly idGenerator: IdGenerator,
    private readonly clock: Clock,
    private readonly settings: AuthSettings,
    private readonly verifyCredentials: VerifyCredentialsUseCase,
    private readonly getUserById: GetUserByIdUseCase,
    private readonly events: DomainEventPublisher,
  ) {}

  async execute(command: AuthenticateUserCommand): Promise<AuthResultDto> {
    const credentials = await this.verifyCredentials.execute(
      new VerifyCredentialsQuery(command.email, command.password),
    );
    if (!credentials) {
      throw new InvalidCredentialsError();
    }
    // Re-fetched by id rather than carried on VerifiedCredentialsDto, so both this use case and
    // RefreshSessionUseCase read the pending-password flag through the same general-purpose
    // query instead of two different shapes of the same fact.
    let user: UserDto;
    try {
      user = await this.getUserById.execute(new GetUserByIdQuery(credentials.userId));
    } catch (error) {
      // The account went away between the credential check and this read, which a login answers
      // as it answers any other failure.
      if (error instanceof UserNotFoundError) {
        throw new InvalidCredentialsError();
      }
      throw error;
    }
    const now = this.clock.now();
    const rawRefreshToken = this.idGenerator.generate();
    const session = Session.start({
      id: SessionId.create(this.idGenerator.generate()),
      userId: credentials.userId,
      ip: command.ip,
      userAgent: command.userAgent,
      initialTokenId: RefreshTokenId.create(this.idGenerator.generate()),
      initialTokenHash: RefreshTokenHash.create(this.refreshTokenHasher.hash(rawRefreshToken)),
      refreshTokenTtlSeconds: this.settings.refreshTokenTtlSeconds,
      absoluteTtlSeconds: this.settings.sessionAbsoluteTtlSeconds,
      now,
    });
    await this.sessions.save(session);
    const access = await this.accessTokens.sign({
      userId: credentials.userId,
      sessionId: session.id.value,
      mustChangePassword: user.mustChangePassword,
    });
    const refreshTokenExpiresAt = session.activeToken.expiresAt.toISOString();
    this.events.publish(session.pullDomainEvents());
    return {
      accessToken: access.token,
      tokenType: 'Bearer',
      expiresInSeconds: access.expiresInSeconds,
      refreshToken: rawRefreshToken,
      refreshTokenExpiresAt,
      sessionId: session.id.value,
    };
  }
}
