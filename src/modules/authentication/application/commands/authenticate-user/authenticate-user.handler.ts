import { Inject } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { CommandHandler, EventBus, ICommandHandler, QueryBus } from '@nestjs/cqrs';
import { authConfig } from '../../../../../config/auth.config';
import { CLOCK, Clock } from '../../../../../shared/application/ports/clock.port';
import {
  ID_GENERATOR,
  IdGenerator,
} from '../../../../../shared/application/ports/id-generator.port';
import {
  VerifiedCredentialsDto,
  VerifyCredentialsQuery,
} from '../../../../users/application/queries/verify-credentials/verify-credentials.query';
import { Session } from '../../../domain/entities/session';
import { InvalidCredentialsError } from '../../../domain/errors/invalid-credentials.error';
import {
  SESSION_REPOSITORY,
  SessionRepository,
} from '../../../domain/repositories/session.repository';
import { RefreshTokenHash } from '../../../domain/value-objects/refresh-token-hash';
import { RefreshTokenId } from '../../../domain/value-objects/refresh-token-id';
import { SessionId } from '../../../domain/value-objects/session-id';
import { AuthResultDto } from '../../dtos/auth-result.dto';
import { ACCESS_TOKEN_SERVICE, AccessTokenService } from '../../ports/access-token.port';
import { REFRESH_TOKEN_HASHER, RefreshTokenHasher } from '../../ports/refresh-token-hasher.port';
import { AuthenticateUserCommand } from './authenticate-user.command';

@CommandHandler(AuthenticateUserCommand)
export class AuthenticateUserHandler
  implements ICommandHandler<AuthenticateUserCommand, AuthResultDto>
{
  constructor(
    @Inject(SESSION_REPOSITORY) private readonly sessions: SessionRepository,
    @Inject(ACCESS_TOKEN_SERVICE) private readonly accessTokens: AccessTokenService,
    @Inject(REFRESH_TOKEN_HASHER) private readonly refreshTokenHasher: RefreshTokenHasher,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(authConfig.KEY) private readonly config: ConfigType<typeof authConfig>,
    private readonly queryBus: QueryBus,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: AuthenticateUserCommand): Promise<AuthResultDto> {
    const credentials = await this.queryBus.execute<
      VerifyCredentialsQuery,
      VerifiedCredentialsDto | null
    >(new VerifyCredentialsQuery(command.email, command.password));
    if (!credentials) {
      throw new InvalidCredentialsError();
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
      refreshTokenTtlSeconds: this.config.refreshTokenTtlSeconds,
      absoluteTtlSeconds: this.config.sessionAbsoluteTtlSeconds,
      now,
    });
    await this.sessions.save(session);
    const access = await this.accessTokens.sign({
      userId: credentials.userId,
      sessionId: session.id.value,
    });
    const refreshTokenExpiresAt = session.activeToken.expiresAt.toISOString();
    this.eventBus.publishAll(session.pullDomainEvents());
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
