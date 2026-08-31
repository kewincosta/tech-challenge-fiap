import { Inject } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { CommandHandler, EventBus, ICommandHandler, QueryBus } from '@nestjs/cqrs';
import { authConfig } from '../../../../../config/auth.config';
import { CLOCK, Clock } from '../../../../../shared/application/ports/clock.port';
import {
  ID_GENERATOR,
  IdGenerator,
} from '../../../../../shared/application/ports/id-generator.port';
import { UserDto } from '../../../../users/application/dtos/user.dto';
import { GetUserByIdQuery } from '../../../../users/application/queries/get-user-by-id/get-user-by-id.query';
import { InvalidRefreshTokenError } from '../../../domain/errors/invalid-refresh-token.error';
import { UserNotFoundError } from '../../../../users/domain/errors/user-not-found.error';
import { RefreshTokenReuseError } from '../../../domain/errors/refresh-token-reuse.error';
import {
  SESSION_REPOSITORY,
  SessionRepository,
} from '../../../domain/repositories/session.repository';
import { RefreshTokenHash } from '../../../domain/value-objects/refresh-token-hash';
import { RefreshTokenId } from '../../../domain/value-objects/refresh-token-id';
import { AuthResultDto } from '../../dtos/auth-result.dto';
import { ACCESS_TOKEN_SERVICE, AccessTokenService } from '../../ports/access-token.port';
import { REFRESH_TOKEN_HASHER, RefreshTokenHasher } from '../../ports/refresh-token-hasher.port';
import {
  REVOKED_SESSION_STORE,
  RevokedSessionStore,
} from '../../ports/revoked-session-store.port';
import { RefreshSessionCommand } from './refresh-session.command';

@CommandHandler(RefreshSessionCommand)
export class RefreshSessionHandler implements ICommandHandler<RefreshSessionCommand, AuthResultDto> {
  constructor(
    @Inject(SESSION_REPOSITORY) private readonly sessions: SessionRepository,
    @Inject(ACCESS_TOKEN_SERVICE) private readonly accessTokens: AccessTokenService,
    @Inject(REFRESH_TOKEN_HASHER) private readonly refreshTokenHasher: RefreshTokenHasher,
    @Inject(REVOKED_SESSION_STORE) private readonly revokedSessions: RevokedSessionStore,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(authConfig.KEY) private readonly config: ConfigType<typeof authConfig>,
    private readonly queryBus: QueryBus,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: RefreshSessionCommand): Promise<AuthResultDto> {
    const presentedHash = RefreshTokenHash.create(this.refreshTokenHasher.hash(command.refreshToken));
    const session = await this.sessions.findByRefreshTokenHash(presentedHash);
    if (!session) {
      throw new InvalidRefreshTokenError();
    }
    const now = this.clock.now();
    const rawRefreshToken = this.idGenerator.generate();
    try {
      session.rotateRefreshToken({
        presentedTokenHash: presentedHash,
        newTokenId: RefreshTokenId.create(this.idGenerator.generate()),
        newTokenHash: RefreshTokenHash.create(this.refreshTokenHasher.hash(rawRefreshToken)),
        refreshTokenTtlSeconds: this.config.refreshTokenTtlSeconds,
        now,
      });
    } catch (error) {
      if (error instanceof RefreshTokenReuseError) {
        await this.sessions.save(session);
        await this.revokedSessions.add(session.id.value, this.config.accessTokenTtlSeconds);
        this.eventBus.publishAll(session.pullDomainEvents());
      }
      throw error;
    }
    await this.sessions.save(session);
    // Read fresh rather than carried on the session, so a password changed after the session
    // was created is reflected in the reissued token (see ChangePasswordHandler and T16's guard).
    const user = await this.queryBus.execute<GetUserByIdQuery, UserDto | null>(
      new GetUserByIdQuery(session.userId),
    );
    if (!user) {
      throw new UserNotFoundError();
    }
    const access = await this.accessTokens.sign({
      userId: session.userId,
      sessionId: session.id.value,
      mustChangePassword: user.mustChangePassword,
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
