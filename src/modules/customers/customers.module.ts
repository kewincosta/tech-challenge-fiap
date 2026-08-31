import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DeactivateCustomerHandler } from './application/commands/deactivate-customer/deactivate-customer.handler';
import { RegisterCustomerHandler } from './application/commands/register-customer/register-customer.handler';
import { UpdateCustomerHandler } from './application/commands/update-customer/update-customer.handler';
import { CUSTOMER_QUERY_PORT } from './application/ports/customer-query.port';
import { GetCustomerByUserIdHandler } from './application/queries/get-customer-by-user-id/get-customer-by-user-id.handler';
import { GetCustomerHandler } from './application/queries/get-customer/get-customer.handler';
import { ListCustomersHandler } from './application/queries/list-customers/list-customers.handler';
import { CUSTOMER_REPOSITORY } from './domain/repositories/customer.repository';
import { CustomerOrmEntity } from './infrastructure/persistence/customer.orm-entity';
import { TypeOrmCustomerQueryAdapter } from './infrastructure/persistence/typeorm-customer-query.adapter';
import { TypeOrmCustomerRepository } from './infrastructure/persistence/typeorm-customer.repository';
import { CustomersController } from './presentation/controllers/customers.controller';

@Module({
  imports: [TypeOrmModule.forFeature([CustomerOrmEntity])],
  controllers: [CustomersController],
  providers: [
    RegisterCustomerHandler,
    UpdateCustomerHandler,
    DeactivateCustomerHandler,
    GetCustomerHandler,
    GetCustomerByUserIdHandler,
    ListCustomersHandler,
    { provide: CUSTOMER_REPOSITORY, useClass: TypeOrmCustomerRepository },
    { provide: CUSTOMER_QUERY_PORT, useClass: TypeOrmCustomerQueryAdapter },
  ],
})
export class CustomersModule {}
