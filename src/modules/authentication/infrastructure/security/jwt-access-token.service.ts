import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { authConfig } from '../../../../config/auth.config';
import {
  ID_GENERATOR,
  IdGenerator,
} from '../../../../shared/application/ports/id-generator.port';
import {
  AccessTokenPayload,
  AccessTokenService,
  SignedAccessToken,
} from '../../application/ports/access-token.port';

interface AccessTokenClaims {
  sub: string;
  sid: string;
}

@Injectable()
export class JwtAccessTokenService implements AccessTokenService {
  constructor(
    private readonly jwtService: JwtService,
    @Inject(authConfig.KEY) private readonly config: ConfigType<typeof authConfig>,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
  ) {}

  async sign(payload: AccessTokenPayload): Promise<SignedAccessToken> {
    const token = await this.jwtService.signAsync(
      { sid: payload.sessionId },
      { subject: payload.userId, jwtid: this.idGenerator.generate() },
    );
    return { token, expiresInSeconds: this.config.accessTokenTtlSeconds };
  }

  async verify(token: string): Promise<AccessTokenPayload | null> {
    try {
      const claims = await this.jwtService.verifyAsync<AccessTokenClaims>(token);
      if (typeof claims.sub !== 'string' || typeof claims.sid !== 'string') {
        return null;
      }
      return { userId: claims.sub, sessionId: claims.sid };
    } catch {
      return null;
    }
  }
}
