import { describe, expect, it, vi } from 'vitest';
import { ServiceNotFoundError } from '../../../domain/errors/service-not-found.error';
import { ServiceQueryPort, ServiceSummaryDto } from '../../ports/service-query.port';
import { GetServiceUseCase } from './get-service.use-case';
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

describe('GetServiceUseCase', () => {
  it('returns what the port answers for a well formed id', async () => {
    const port = fakePort(service());
    const useCase = new GetServiceUseCase(port);

    const result = await useCase.execute(new GetServiceQuery(SERVICE_ID));

    expect(result).toEqual(service());
    expect(port.getById).toHaveBeenCalledWith(SERVICE_ID);
  });

  it('answers a deactivated service rather than the not-found error, so "deactivated" stays apart from "does not exist"', async () => {
    const useCase = new GetServiceUseCase(fakePort(service('INACTIVE')));

    const result = await useCase.execute(new GetServiceQuery(SERVICE_ID));

    expect(result).toMatchObject({ status: 'INACTIVE' });
  });

  it('refuses an id the port knows nothing about with the service not-found error', async () => {
    const useCase = new GetServiceUseCase(fakePort(null));

    await expect(useCase.execute(new GetServiceQuery(SERVICE_ID))).rejects.toThrow(
      ServiceNotFoundError,
    );
  });

  it('refuses a malformed id with the service not-found error, without touching the port', async () => {
    const port = fakePort(service());
    const useCase = new GetServiceUseCase(port);

    await expect(useCase.execute(new GetServiceQuery('not-a-uuid'))).rejects.toThrow(
      ServiceNotFoundError,
    );
    expect(port.getById).not.toHaveBeenCalled();
  });
});
