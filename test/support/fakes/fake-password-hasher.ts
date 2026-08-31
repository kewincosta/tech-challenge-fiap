import { PasswordHasher } from '../../../src/modules/users/application/ports/password-hasher.port';

export class FakePasswordHasher implements PasswordHasher {
  readonly verifyCalls: Array<{ hash: string; plain: string }> = [];

  async hash(plain: string): Promise<string> {
    return Promise.resolve(`hashed:${plain}`);
  }

  async verify(hash: string, plain: string): Promise<boolean> {
    this.verifyCalls.push({ hash, plain });
    return Promise.resolve(hash === `hashed:${plain}`);
  }
}
