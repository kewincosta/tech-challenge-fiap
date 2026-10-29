import { Clock } from '../../../../../../shared/application/ports/clock.port';
import { DomainEventPublisher } from '../../../../../../shared/application/ports/domain-event-publisher.port';
import { IdGenerator } from '../../../../../../shared/application/ports/id-generator.port';
import { GetUserByIdHandler } from '../../../../users/application/queries/get-user-by-id/get-user-by-id.handler';
import { GetUserByIdQuery } from '../../../../users/application/queries/get-user-by-id/get-user-by-id.query';
import { UserNotFoundError } from '../../../../users/domain/errors/user-not-found.error';
import { InvalidRefreshTokenError } from '../../../domain/errors/invalid-refresh-token.error';
import { RefreshTokenReuseError } from '../../../domain/errors/refresh-token-reuse.error';
import { RefreshTokenHash } from '../../../domain/value-objects/refresh-token-hash';
import { RefreshTokenId } from '../../../domain/value-objects/refresh-token-id';
import { AuthSettings } from '../../auth-settings';
import { AuthResultDto } from '../../dtos/auth-result.dto';
import { AccessTokenService } from '../../ports/access-token.port';
import { RefreshTokenHasher } from '../../ports/refresh-token-hasher.port';
import { RevokedSessionStore } from '../../ports/revoked-session-store.port';
import { SessionRepository } from '../../ports/session.repository';
import { RefreshSessionCommand } from './refresh-session.command';

export class RefreshSessionHandler {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly accessTokens: AccessTokenService,
    private readonly refreshTokenHasher: RefreshTokenHasher,
    private readonly revokedSessions: RevokedSessionStore,
    private readonly idGenerator: IdGenerator,
    private readonly clock: Clock,
    private readonly settings: AuthSettings,
    private readonly getUserById: GetUserByIdHandler,
    private readonly events: DomainEventPublisher,
  ) {}

  async execute(command: RefreshSessionCommand): Promise<AuthResultDto> {
    const presentedHash = RefreshTokenHash.create(
      this.refreshTokenHasher.hash(command.refreshToken),
    );
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
        refreshTokenTtlSeconds: this.settings.refreshTokenTtlSeconds,
        now,
      });
    } catch (error) {
      if (error instanceof RefreshTokenReuseError) {
        await this.sessions.save(session);
        await this.revokedSessions.add(session.id.value, this.settings.accessTokenTtlSeconds);
        this.events.publish(session.pullDomainEvents());
      }
      throw error;
    }
    await this.sessions.save(session);
    // Read fresh rather than carried on the session, so a password changed after the session
    // was created is reflected in the reissued token (see ChangePasswordHandler and T16's guard).
    const user = await this.getUserById.execute(new GetUserByIdQuery(session.userId));
    if (!user) {
      throw new UserNotFoundError();
    }
    const access = await this.accessTokens.sign({
      userId: session.userId,
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
