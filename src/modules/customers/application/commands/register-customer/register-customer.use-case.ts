import { ConcurrentModificationError } from '../../../../../shared/application/errors/concurrent-modification.error';
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
import { OutboxSettings } from '../../outbox-settings';
import { CustomerAccounts } from '../../ports/customer-accounts.port';
import { CustomerRepository } from '../../ports/customer.repository';
import {
  AccountStep,
  AccountStepKind,
  PendingAccountSteps,
} from '../../ports/pending-account-steps.port';
import { RegisteredCustomerDto, RegisterCustomerCommand } from './register-customer.command';

/**
 * A registration over an existing user reads `identity` and saves the customer in one customers
 * transaction. A registration that opens a new account writes `identity` and `customers`, and each
 * module commits only its own data (CA-10), so it takes three steps:
 *
 * 1. It arms a discard step in the customers outbox, due after the grace period.
 * 2. Identity opens the account, user and role together, under the id chosen here.
 * 3. One customers transaction disarms the step and saves the customer.
 *
 * If the opening or the last step fails, the request discards the account at once, completes the
 * step and answers the first error. A process that stops between the steps leaves the armed step
 * behind, and the processor discards the account once the grace period has passed. When the
 * processor claimed the step before the request reached the last step, the disarm finds it taken
 * and the request answers 409: the customer stays unsaved and the account is discarded.
 */
export class RegisterCustomerUseCase {
  constructor(
    private readonly customers: CustomerRepository,
    private readonly idGenerator: IdGenerator,
    private readonly clock: Clock,
    private readonly transactionRunner: TransactionRunner,
    private readonly accounts: CustomerAccounts,
    private readonly steps: PendingAccountSteps,
    private readonly settings: OutboxSettings,
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

    if (command.userId !== undefined) {
      return this.registerOverExistingUser(command.userId, address, phoneNumber);
    }
    return this.registerWithNewAccount(command, address, phoneNumber);
  }

  // Writes nothing in `identity`: the reads of its checks stay inside the customers transaction.
  private registerOverExistingUser(
    userId: string,
    address: Address | undefined,
    phoneNumber: PhoneNumber | undefined,
  ): Promise<RegisteredCustomerDto> {
    return this.transactionRunner.run(async () => {
      await this.assertUserMayBecomeCustomer(userId);
      const customer = Customer.register({
        id: CustomerId.create(this.idGenerator.generate()),
        userId,
        address,
        phoneNumber,
        now: this.clock.now(),
      });
      await this.customers.save(customer);
      return { id: customer.id.value };
    });
  }

  private async registerWithNewAccount(
    command: RegisterCustomerCommand,
    address: Address | undefined,
    phoneNumber: PhoneNumber | undefined,
  ): Promise<RegisteredCustomerDto> {
    // Every identifier is chosen up front, the account's included, because the outbox names an
    // account that does not exist yet.
    const userId = this.idGenerator.generate();
    const customerId = CustomerId.create(this.idGenerator.generate());
    const step: AccountStep = {
      operationId: this.idGenerator.generate(),
      kind: AccountStepKind.DiscardAccount,
      userId,
    };
    const dueAt = new Date(this.clock.now().getTime() + this.settings.graceSeconds * 1000);
    // Nothing is opened yet, so a failure here has nothing to discard.
    await this.steps.arm(step, dueAt);

    try {
      const account = await this.accounts.open(
        userId,
        command.email!,
        command.name!,
        command.document!,
      );
      const customer = Customer.register({
        id: customerId,
        userId: account.userId,
        address,
        phoneNumber,
        now: this.clock.now(),
      });
      await this.transactionRunner.run(async () => {
        if (!(await this.steps.disarm(step.operationId))) {
          throw new ConcurrentModificationError();
        }
        await this.customers.save(customer);
      });
      return account.temporaryPassword
        ? { id: customer.id.value, temporaryPassword: account.temporaryPassword }
        : { id: customer.id.value };
    } catch (error) {
      await this.compensate(step);
      throw error;
    }
  }

  private async assertUserMayBecomeCustomer(userId: string): Promise<void> {
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
  }

  /**
   * Discards the account and completes the step, without claiming it: a discard changes nothing on
   * a repeat, so it can run while the processor holds the step. A discard that fails hands the step
   * to the processor at once, because the request has no other way to finish it. The caller
   * rethrows its own error, so nothing here may throw.
   */
  private async compensate(step: AccountStep): Promise<void> {
    try {
      await this.accounts.discard(step.userId);
      await this.steps.complete(step.operationId);
    } catch {
      await this.handToProcessor(step);
    }
  }

  /**
   * `release` makes an armed step due now and leaves a step the processor already holds alone,
   * where `recordFailure` would also cut short the lease of a claim that is still working.
   */
  private async handToProcessor(step: AccountStep): Promise<void> {
    try {
      await this.steps.release(step.operationId);
    } catch {
      // The step stays armed, and the processor discards the account once its grace period has passed.
    }
  }
}
