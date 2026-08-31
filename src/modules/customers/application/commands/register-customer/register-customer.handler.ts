import { Inject } from '@nestjs/common';
import { CommandBus, CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs';
import { CLOCK, Clock } from '../../../../../shared/application/ports/clock.port';
import { ID_GENERATOR, IdGenerator } from '../../../../../shared/application/ports/id-generator.port';
import {
  TRANSACTION_RUNNER,
  TransactionRunner,
} from '../../../../../shared/application/ports/transaction-runner.port';
import { EffectiveAccessDto } from '../../../../authorization/application/dtos/effective-access.dto';
import { GetUserEffectiveAccessQuery } from '../../../../authorization/application/queries/get-user-effective-access/get-user-effective-access.query';
import { SystemRole } from '../../../../authorization/application/contracts/system-roles';
import { UserDto } from '../../../../users/application/dtos/user.dto';
import { GetUserByIdQuery } from '../../../../users/application/queries/get-user-by-id/get-user-by-id.query';
import {
  RegisteredUserDto,
  RegisterUserCommand,
} from '../../../../users/application/commands/register-user/register-user.command';
import { Customer } from '../../../domain/entities/customer';
import { AmbiguousCustomerRegistrationError } from '../../../domain/errors/ambiguous-customer-registration.error';
import { CustomerAlreadyExistsForUserError } from '../../../domain/errors/customer-already-exists-for-user.error';
import { TargetUserNotFoundError } from '../../../domain/errors/target-user-not-found.error';
import { UserMissingCustomerRoleError } from '../../../domain/errors/user-missing-customer-role.error';
import { CUSTOMER_REPOSITORY, CustomerRepository } from '../../../domain/repositories/customer.repository';
import { Address } from '../../../domain/value-objects/address';
import { CustomerId } from '../../../domain/value-objects/customer-id';
import { PhoneNumber } from '../../../domain/value-objects/phone-number';
import { RegisteredCustomerDto, RegisterCustomerCommand } from './register-customer.command';

@CommandHandler(RegisterCustomerCommand)
export class RegisterCustomerHandler
  implements ICommandHandler<RegisterCustomerCommand, RegisteredCustomerDto>
{
  constructor(
    @Inject(CUSTOMER_REPOSITORY) private readonly customers: CustomerRepository,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(TRANSACTION_RUNNER) private readonly transactionRunner: TransactionRunner,
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  async execute(command: RegisterCustomerCommand): Promise<RegisteredCustomerDto> {
    const hasExistingUser = command.userId !== undefined;
    const hasAccountData =
      command.email !== undefined || command.name !== undefined || command.document !== undefined;
    if (hasExistingUser === hasAccountData) {
      throw new AmbiguousCustomerRegistrationError();
    }

    const address = Address.create(command.address);
    const phoneNumber = PhoneNumber.create(command.phoneNumber);

    // The existing-user branch's cross-module checks and the account-creation branch's
    // RegisterUserCommand dispatch both need to commit or roll back together with the customer
    // insert - see design.md's Risks & Concerns (the same risk identity-foundation's T9/T18 closed
    // for RegisterUserHandler).
    return this.transactionRunner.run(async () => {
      const { userId, temporaryPassword } = hasExistingUser
        ? await this.resolveExistingUser(command.userId!)
        : await this.createAccount(command);

      const customer = Customer.register({
        id: CustomerId.create(this.idGenerator.generate()),
        userId,
        address,
        phoneNumber,
        now: this.clock.now(),
      });
      await this.customers.save(customer);

      return temporaryPassword
        ? { id: customer.id.value, temporaryPassword }
        : { id: customer.id.value };
    });
  }

  private async resolveExistingUser(
    userId: string,
  ): Promise<{ userId: string; temporaryPassword?: string }> {
    const user = await this.queryBus.execute<GetUserByIdQuery, UserDto | null>(
      new GetUserByIdQuery(userId),
    );
    if (!user) {
      throw new TargetUserNotFoundError();
    }
    const access = await this.queryBus.execute<GetUserEffectiveAccessQuery, EffectiveAccessDto>(
      new GetUserEffectiveAccessQuery(userId),
    );
    if (!access.roles.includes(SystemRole.Customer)) {
      throw new UserMissingCustomerRoleError();
    }
    // Application-layer pre-check, same two-layer shape as RegisterUserHandler's
    // existsByEmail/existsByDocument: a friendly error on the common path, with the repository's
    // own unique-constraint mapping (T5) as the race-condition backstop.
    if (await this.customers.existsByUserId(userId)) {
      throw new CustomerAlreadyExistsForUserError();
    }
    return { userId };
  }

  private async createAccount(
    command: RegisterCustomerCommand,
  ): Promise<{ userId: string; temporaryPassword?: string }> {
    const result = await this.commandBus.execute<RegisterUserCommand, RegisteredUserDto>(
      new RegisterUserCommand(command.email!, command.name!, undefined, command.document!, true),
    );
    return { userId: result.id, temporaryPassword: result.temporaryPassword };
  }
}
