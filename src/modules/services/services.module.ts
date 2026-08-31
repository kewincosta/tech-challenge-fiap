import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CreateServiceHandler } from './application/commands/create-service/create-service.handler';
import { DeactivateServiceHandler } from './application/commands/deactivate-service/deactivate-service.handler';
import { UpdateServiceHandler } from './application/commands/update-service/update-service.handler';
import { SERVICE_QUERY_PORT } from './application/ports/service-query.port';
import { GetServiceHandler } from './application/queries/get-service/get-service.handler';
import { ListServicesHandler } from './application/queries/list-services/list-services.handler';
import { SERVICE_REPOSITORY } from './domain/repositories/service.repository';
import { ServiceOrmEntity } from './infrastructure/persistence/service.orm-entity';
import { TypeOrmServiceQueryAdapter } from './infrastructure/persistence/typeorm-service-query.adapter';
import { TypeOrmServiceRepository } from './infrastructure/persistence/typeorm-service.repository';
import { ServicesController } from './presentation/controllers/services.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ServiceOrmEntity])],
  controllers: [ServicesController],
  providers: [
    CreateServiceHandler,
    UpdateServiceHandler,
    DeactivateServiceHandler,
    GetServiceHandler,
    ListServicesHandler,
    { provide: SERVICE_REPOSITORY, useClass: TypeOrmServiceRepository },
    { provide: SERVICE_QUERY_PORT, useClass: TypeOrmServiceQueryAdapter },
  ],
})
export class ServicesModule {}
