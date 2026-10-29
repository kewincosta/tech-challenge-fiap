import { Clock } from '../../../../../shared/application/ports/clock.port';
import { IdGenerator } from '../../../../../shared/application/ports/id-generator.port';
import { TransactionRunner } from '../../../../../shared/application/ports/transaction-runner.port';
import { Customer } from '../../../domain/entities/customer';
import { AmbiguousCustomerRegistrationError } from '../../../domain/errors/ambiguous-customer-registration.error';
import { CustomerAlreadyExistsForUserError } from '../../../domain/errors/customer-already-exists-for-user.error';
import { TargetUserNotFoundError } from '../../../domain/errors/target-user-not-found.error';
import { UserMissingCustomerRoleError } from '../../../domain/errors/user-missing-customer-role.error';
import { Address } from '../../../domain/value-objects/address';
import { CustomerId } from '../../../domain/value-objects/customer-id';
import { PhoneNumber } from '../../../domain/value-objects/phone-number';
import { CustomerAccounts, OpenedAccount } from '../../ports/customer-accounts.port';
import { CustomerRepository } from '../../ports/customer.repository';
import { RegisteredCustomerDto, RegisterCustomerCommand } from './register-customer.command';

export class RegisterCustomerHandler {
  constructor(
    private readonly customers: CustomerRepository,
    private readonly idGenerator: IdGenerator,
    private readonly clock: Clock,
    private readonly transactionRunner: TransactionRunner,
    private readonly accounts: CustomerAccounts,
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
    // account opening both need to commit or roll back together with the customer
    // insert - see design.md's Risks & Concerns (the same risk identity-foundation's T9/T18 closed
    // for RegisterUserUseCase).
    return this.transactionRunner.run(async () => {
      const { userId, temporaryPassword } = hasExistingUser
        ? await this.resolveExistingUser(command.userId)
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
    const user = await this.accounts.findUser(userId);
    if (!user) {
      throw new TargetUserNotFoundError();
    }
    if (!(await this.accounts.hasCustomerRole(userId))) {
      throw new UserMissingCustomerRoleError();
    }
    // Application-layer pre-check, same two-layer shape as RegisterUserUseCase's
    // existsByEmail/existsByDocument: a friendly error on the common path, with the repository's
    // own unique-constraint mapping (T5) as the race-condition backstop.
    if (await this.customers.existsByUserId(userId)) {
      throw new CustomerAlreadyExistsForUserError();
    }
    return { userId };
  }

  private createAccount(command: RegisterCustomerCommand): Promise<OpenedAccount> {
    return this.accounts.open(command.email!, command.name!, command.document!);
  }
}
