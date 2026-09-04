import { describe, expect, it, vi } from 'vitest';
import { ServiceQueryPort, ServiceSummaryDto } from '../../ports/service-query.port';
import { ListServicesHandler } from './list-services.handler';
import { ListServicesQuery } from './list-services.query';

function fakePort(result: ServiceSummaryDto[]): ServiceQueryPort {
  return {
    getById: vi.fn(),
    listActive: vi.fn().mockResolvedValue(result),
  };
}

describe('ListServicesHandler', () => {
  it('returns exactly what the port answers', async () => {
    const rows = [{ id: '11111111-1111-4111-8111-111111111111' } as ServiceSummaryDto];
    const handler = new ListServicesHandler(fakePort(rows));

    await expect(handler.execute(new ListServicesQuery())).resolves.toBe(rows);
  });

  it('answers an empty catalog as a list, never an error', async () => {
    const handler = new ListServicesHandler(fakePort([]));

    await expect(handler.execute(new ListServicesQuery())).resolves.toEqual([]);
  });

  it('asks the port for the active catalog, with no filter of its own', async () => {
    const port = fakePort([]);
    const handler = new ListServicesHandler(port);

    await handler.execute(new ListServicesQuery());

    expect(port.listActive).toHaveBeenCalledTimes(1);
    expect(port.listActive).toHaveBeenCalledWith();
  });
});
