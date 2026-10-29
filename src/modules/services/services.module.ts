import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Clock } from '../../shared/application/ports/clock.port';
import { DomainEventPublisher } from '../../shared/application/ports/domain-event-publisher.port';
import { IdGenerator } from '../../shared/application/ports/id-generator.port';
import { CLOCK, DOMAIN_EVENT_PUBLISHER, ID_GENERATOR } from '../../shared/shared.tokens';
import { CreateServiceUseCase } from './application/commands/create-service/create-service.use-case';
import { DeactivateServiceUseCase } from './application/commands/deactivate-service/deactivate-service.use-case';
import { UpdateServiceUseCase } from './application/commands/update-service/update-service.use-case';
import { ServiceQueryPort } from './application/ports/service-query.port';
import { ServiceRepository } from './application/ports/service.repository';
import { GetServiceUseCase } from './application/queries/get-service/get-service.use-case';
import { ListServicesUseCase } from './application/queries/list-services/list-services.use-case';
import { ServiceKeyResolver } from './infrastructure/persistence/service-key-resolver';
import { ServiceOrmEntity } from './infrastructure/persistence/service.orm-entity';
import { TypeOrmServiceQueryAdapter } from './infrastructure/persistence/typeorm-service-query.adapter';
import { TypeOrmServiceRepository } from './infrastructure/persistence/typeorm-service.repository';
import { ServicesController } from './presentation/controllers/services.controller';
import { SERVICE_QUERY_PORT, SERVICE_REPOSITORY } from './services.tokens';

@Module({
  imports: [TypeOrmModule.forFeature([ServiceOrmEntity])],
  controllers: [ServicesController],
  providers: [
    {
      provide: CreateServiceUseCase,
      useFactory: (
        services: ServiceRepository,
        idGenerator: IdGenerator,
        clock: Clock,
        events: DomainEventPublisher,
      ) => new CreateServiceUseCase(services, idGenerator, clock, events),
      inject: [SERVICE_REPOSITORY, ID_GENERATOR, CLOCK, DOMAIN_EVENT_PUBLISHER],
    },
    {
      provide: UpdateServiceUseCase,
      useFactory: (services: ServiceRepository, clock: Clock, events: DomainEventPublisher) =>
        new UpdateServiceUseCase(services, clock, events),
      inject: [SERVICE_REPOSITORY, CLOCK, DOMAIN_EVENT_PUBLISHER],
    },
    {
      provide: DeactivateServiceUseCase,
      useFactory: (services: ServiceRepository, clock: Clock, events: DomainEventPublisher) =>
        new DeactivateServiceUseCase(services, clock, events),
      inject: [SERVICE_REPOSITORY, CLOCK, DOMAIN_EVENT_PUBLISHER],
    },
    {
      provide: GetServiceUseCase,
      useFactory: (serviceQuery: ServiceQueryPort) => new GetServiceUseCase(serviceQuery),
      inject: [SERVICE_QUERY_PORT],
    },
    {
      provide: ListServicesUseCase,
      useFactory: (serviceQuery: ServiceQueryPort) => new ListServicesUseCase(serviceQuery),
      inject: [SERVICE_QUERY_PORT],
    },
    { provide: SERVICE_REPOSITORY, useClass: TypeOrmServiceRepository },
    { provide: SERVICE_QUERY_PORT, useClass: TypeOrmServiceQueryAdapter },
    ServiceKeyResolver,
  ],
  exports: [GetServiceUseCase, ServiceKeyResolver],
})
export class ServicesModule {}
