import { describe, expect, it, vi } from 'vitest';
import { UserQueryPort, UserSummaryDto } from '../../ports/user-query.port';
import { FindUserByDocumentHandler } from './find-user-by-document.handler';
import { FindUserByDocumentQuery } from './find-user-by-document.query';

function user(): UserSummaryDto {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'jane@example.com',
    name: 'Jane Doe',
    document: '11144477735',
    status: 'ACTIVE',
  };
}

function fakePort(result: UserSummaryDto | null): UserQueryPort {
  return {
    findActiveByDocument: vi.fn().mockResolvedValue(result),
    listActive: vi.fn(),
  };
}

describe('FindUserByDocumentHandler', () => {
  it('searches by the digits of a formatted CPF', async () => {
    const port = fakePort(user());
    const handler = new FindUserByDocumentHandler(port);

    const result = await handler.execute(new FindUserByDocumentQuery('111.444.777-35'));

    expect(result).toEqual(user());
    expect(port.findActiveByDocument).toHaveBeenCalledWith('11144477735');
  });

  it('searches by the digits of a formatted CNPJ too', async () => {
    const port = fakePort(null);
    const handler = new FindUserByDocumentHandler(port);

    await handler.execute(new FindUserByDocumentQuery('11.222.333/0001-81'));

    expect(port.findActiveByDocument).toHaveBeenCalledWith('11222333000181');
  });

  it('returns null for a document nobody carries', async () => {
    const handler = new FindUserByDocumentHandler(fakePort(null));

    await expect(
      handler.execute(new FindUserByDocumentQuery('11144477735')),
    ).resolves.toBeNull();
  });

  it('answers null for a malformed document - a counter search miss, not a validation failure', async () => {
    const port = fakePort(user());
    const handler = new FindUserByDocumentHandler(port);

    await expect(handler.execute(new FindUserByDocumentQuery('123'))).resolves.toBeNull();
    expect(port.findActiveByDocument).not.toHaveBeenCalled();
  });
});
