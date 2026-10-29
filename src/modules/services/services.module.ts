import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Clock } from '../../shared/application/ports/clock.port';
import { DomainEventPublisher } from '../../shared/application/ports/domain-event-publisher.port';
import { IdGenerator } from '../../shared/application/ports/id-generator.port';
import { CLOCK, DOMAIN_EVENT_PUBLISHER, ID_GENERATOR } from '../../shared/shared.tokens';
import { CreateServiceHandler } from './application/commands/create-service/create-service.handler';
import { DeactivateServiceHandler } from './application/commands/deactivate-service/deactivate-service.handler';
import { UpdateServiceHandler } from './application/commands/update-service/update-service.handler';
import { ServiceQueryPort } from './application/ports/service-query.port';
import { ServiceRepository } from './application/ports/service.repository';
import { GetServiceHandler } from './application/queries/get-service/get-service.handler';
import { ListServicesHandler } from './application/queries/list-services/list-services.handler';
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
      provide: CreateServiceHandler,
      useFactory: (
        services: ServiceRepository,
        idGenerator: IdGenerator,
        clock: Clock,
        events: DomainEventPublisher,
      ) => new CreateServiceHandler(services, idGenerator, clock, events),
      inject: [SERVICE_REPOSITORY, ID_GENERATOR, CLOCK, DOMAIN_EVENT_PUBLISHER],
    },
    {
      provide: UpdateServiceHandler,
      useFactory: (services: ServiceRepository, clock: Clock, events: DomainEventPublisher) =>
        new UpdateServiceHandler(services, clock, events),
      inject: [SERVICE_REPOSITORY, CLOCK, DOMAIN_EVENT_PUBLISHER],
    },
    {
      provide: DeactivateServiceHandler,
      useFactory: (services: ServiceRepository, clock: Clock, events: DomainEventPublisher) =>
        new DeactivateServiceHandler(services, clock, events),
      inject: [SERVICE_REPOSITORY, CLOCK, DOMAIN_EVENT_PUBLISHER],
    },
    {
      provide: GetServiceHandler,
      useFactory: (serviceQuery: ServiceQueryPort) => new GetServiceHandler(serviceQuery),
      inject: [SERVICE_QUERY_PORT],
    },
    {
      provide: ListServicesHandler,
      useFactory: (serviceQuery: ServiceQueryPort) => new ListServicesHandler(serviceQuery),
      inject: [SERVICE_QUERY_PORT],
    },
    { provide: SERVICE_REPOSITORY, useClass: TypeOrmServiceRepository },
    { provide: SERVICE_QUERY_PORT, useClass: TypeOrmServiceQueryAdapter },
    ServiceKeyResolver,
  ],
  exports: [GetServiceHandler, ServiceKeyResolver],
})
export class ServicesModule {}
