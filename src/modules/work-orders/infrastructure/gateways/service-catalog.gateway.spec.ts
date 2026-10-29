import { describe, expect, it } from 'vitest';
import {
  GetServiceHandler,
  GetServiceQuery,
  ServiceNotFoundError,
  ServiceSummaryDto,
} from '../../../services';
import { ServiceCatalogGateway } from './service-catalog.gateway';

const SERVICE_ID = '55555555-5555-4555-8555-555555555555';

const ACTIVE_SERVICE: ServiceSummaryDto = {
  id: SERVICE_ID,
  name: 'Troca de oleo',
  description: 'Inclui filtro',
  priceCents: 15099,
  estimatedDurationMinutes: 60,
  status: 'ACTIVE',
};

// The gateway uses only `execute` of the services module's handler. The stand-in answers for the
// one id it is asked about, so a gateway that sends the wrong identifier gets `null`.
function gatewayOver(result: ServiceSummaryDto | null | Error): ServiceCatalogGateway {
  const getService = {
    execute: (query: GetServiceQuery) => {
      if (query.serviceId !== SERVICE_ID) {
        return Promise.resolve(null);
      }
      return result instanceof Error ? Promise.reject(result) : Promise.resolve(result);
    },
  } as unknown as GetServiceHandler;
  return new ServiceCatalogGateway(getService);
}

describe('ServiceCatalogGateway', () => {
  it('should map the services module answer to the id, the name, the price and an active flag', async () => {
    const catalog = gatewayOver(ACTIVE_SERVICE);

    const service = await catalog.findById(SERVICE_ID);

    expect(service).toEqual({
      id: SERVICE_ID,
      name: 'Troca de oleo',
      priceCents: 15099,
      active: true,
    });
  });

  it('should report a deactivated service as found and not active', async () => {
    const catalog = gatewayOver({ ...ACTIVE_SERVICE, status: 'INACTIVE' });

    const service = await catalog.findById(SERVICE_ID);

    expect(service).toEqual({
      id: SERVICE_ID,
      name: 'Troca de oleo',
      priceCents: 15099,
      active: false,
    });
  });

  it('should answer null when the services module answers null', async () => {
    const catalog = gatewayOver(null);

    expect(await catalog.findById(SERVICE_ID)).toBeNull();
  });

  it('should answer null when the services module throws its not-found error', async () => {
    const catalog = gatewayOver(new ServiceNotFoundError());

    expect(await catalog.findById(SERVICE_ID)).toBeNull();
  });

  it('should let any other error from the services module through', async () => {
    const failure = new Error('database is down');
    const catalog = gatewayOver(failure);

    await expect(catalog.findById(SERVICE_ID)).rejects.toBe(failure);
  });
});
