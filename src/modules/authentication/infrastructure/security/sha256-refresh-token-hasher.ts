import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { RefreshTokenHasher } from '../../application/ports/refresh-token-hasher.port';

@Injectable()
export class Sha256RefreshTokenHasher implements RefreshTokenHasher {
  hash(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }
}
