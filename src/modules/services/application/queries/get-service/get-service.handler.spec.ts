import { describe, expect, it, vi } from 'vitest';
import { ServiceQueryPort, ServiceSummaryDto } from '../../ports/service-query.port';
import { GetServiceHandler } from './get-service.handler';
import { GetServiceQuery } from './get-service.query';

const SERVICE_ID = '11111111-1111-4111-8111-111111111111';

function service(status = 'ACTIVE'): ServiceSummaryDto {
  return {
    id: SERVICE_ID,
    name: 'Troca de oleo',
    description: 'Inclui filtro',
    priceCents: 15099,
    estimatedDurationMinutes: 60,
    status,
  };
}

function fakePort(result: ServiceSummaryDto | null): ServiceQueryPort {
  return {
    getById: vi.fn().mockResolvedValue(result),
    listActive: vi.fn(),
  };
}

describe('GetServiceHandler', () => {
  it('returns what the port answers for a well formed id', async () => {
    const port = fakePort(service());
    const handler = new GetServiceHandler(port);

    const result = await handler.execute(new GetServiceQuery(SERVICE_ID));

    expect(result).toEqual(service());
    expect(port.getById).toHaveBeenCalledWith(SERVICE_ID);
  });

  it('answers a deactivated service rather than null, so "deactivated" stays apart from "does not exist"', async () => {
    const handler = new GetServiceHandler(fakePort(service('INACTIVE')));

    const result = await handler.execute(new GetServiceQuery(SERVICE_ID));

    expect(result).toMatchObject({ status: 'INACTIVE' });
  });

  it('returns null for an id the port knows nothing about', async () => {
    const handler = new GetServiceHandler(fakePort(null));

    await expect(handler.execute(new GetServiceQuery(SERVICE_ID))).resolves.toBeNull();
  });

  it('returns null for a malformed id without touching the port', async () => {
    const port = fakePort(service());
    const handler = new GetServiceHandler(port);

    await expect(handler.execute(new GetServiceQuery('not-a-uuid'))).resolves.toBeNull();
    expect(port.getById).not.toHaveBeenCalled();
  });
});
