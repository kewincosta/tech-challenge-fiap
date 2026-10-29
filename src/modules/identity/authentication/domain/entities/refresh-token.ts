import { RefreshTokenStatus } from '../refresh-token-status';
import { RefreshTokenHash } from '../value-objects/refresh-token-hash';
import { RefreshTokenId } from '../value-objects/refresh-token-id';

interface RefreshTokenProps {
  id: RefreshTokenId;
  tokenHash: RefreshTokenHash;
  status: RefreshTokenStatus;
  createdAt: Date;
  expiresAt: Date;
  rotatedAt: Date | null;
  replacedById: string | null;
}

interface IssueRefreshTokenInput {
  id: RefreshTokenId;
  tokenHash: RefreshTokenHash;
  now: Date;
  expiresAt: Date;
}

export class RefreshToken {
  private constructor(private readonly props: RefreshTokenProps) {}

  static issue(input: IssueRefreshTokenInput): RefreshToken {
    return new RefreshToken({
      id: input.id,
      tokenHash: input.tokenHash,
      status: RefreshTokenStatus.Active,
      createdAt: input.now,
      expiresAt: input.expiresAt,
      rotatedAt: null,
      replacedById: null,
    });
  }

  static restore(props: RefreshTokenProps): RefreshToken {
    return new RefreshToken({ ...props });
  }

  markRotated(replacedById: string, now: Date): void {
    this.props.status = RefreshTokenStatus.Rotated;
    this.props.rotatedAt = now;
    this.props.replacedById = replacedById;
  }

  revoke(): void {
    if (this.props.status !== RefreshTokenStatus.Active) {
      return;
    }
    this.props.status = RefreshTokenStatus.Revoked;
  }

  matches(hash: RefreshTokenHash): boolean {
    return this.props.tokenHash.equals(hash);
  }

  isExpired(now: Date): boolean {
    return now.getTime() >= this.props.expiresAt.getTime();
  }

  get isActive(): boolean {
    return this.props.status === RefreshTokenStatus.Active;
  }

  get id(): RefreshTokenId {
    return this.props.id;
  }

  get tokenHash(): RefreshTokenHash {
    return this.props.tokenHash;
  }

  get status(): RefreshTokenStatus {
    return this.props.status;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get expiresAt(): Date {
    return this.props.expiresAt;
  }

  get rotatedAt(): Date | null {
    return this.props.rotatedAt;
  }

  get replacedById(): string | null {
    return this.props.replacedById;
  }
}
