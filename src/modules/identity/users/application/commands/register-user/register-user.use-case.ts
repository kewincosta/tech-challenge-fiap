import { Clock } from '../../../../../../shared/application/ports/clock.port';
import { DomainEventPublisher } from '../../../../../../shared/application/ports/domain-event-publisher.port';
import { IdGenerator } from '../../../../../../shared/application/ports/id-generator.port';
import { TransactionRunner } from '../../../../../../shared/application/ports/transaction-runner.port';
import { AssignRoleToUserCommand } from '../../../../authorization/application/commands/assign-role-to-user/assign-role-to-user.command';
import { AssignRoleToUserUseCase } from '../../../../authorization/application/commands/assign-role-to-user/assign-role-to-user.use-case';
import { SystemRole } from '../../../../authorization/application/contracts/system-roles';
import { User } from '../../../domain/entities/user';
import { DocumentAlreadyInUseError } from '../../../domain/errors/document-already-in-use.error';
import { EmailAlreadyInUseError } from '../../../domain/errors/email-already-in-use.error';
import { Email } from '../../../domain/value-objects/email';
import { Password } from '../../../domain/value-objects/password';
import { PasswordHash } from '../../../domain/value-objects/password-hash';
import { PersonDocument } from '../../../domain/value-objects/person-document';
import { UserId } from '../../../domain/value-objects/user-id';
import { PasswordHasher } from '../../ports/password-hasher.port';
import { UserRepository } from '../../ports/user.repository';
import { RegisteredUserDto, RegisterUserCommand } from './register-user.command';

export class RegisterUserUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly passwordHasher: PasswordHasher,
    private readonly idGenerator: IdGenerator,
    private readonly clock: Clock,
    private readonly transactionRunner: TransactionRunner,
    private readonly assignRoleToUser: AssignRoleToUserUseCase,
    private readonly events: DomainEventPublisher,
  ) {}

  async execute(command: RegisterUserCommand): Promise<RegisteredUserDto> {
    const email = Email.create(command.email);
    // A staff-created account never supplies its own password (IDENT-07): the workshop cannot
    // hand someone a credential it invented, so one is generated here instead of validated.
    const password = command.issuedByStaff
      ? Password.generate()
      : Password.create(command.password!);
    const document = PersonDocument.create(command.document);
    if (await this.users.existsByEmail(email)) {
      throw new EmailAlreadyInUseError();
    }
    if (await this.users.existsByDocument(document)) {
      throw new DocumentAlreadyInUseError();
    }
    const passwordHash = PasswordHash.create(await this.passwordHasher.hash(password.value));
    const user = User.register({
      id: UserId.create(this.idGenerator.generate()),
      email,
      name: command.name,
      document,
      passwordHash,
      now: this.clock.now(),
      temporary: command.issuedByStaff,
    });
    // The insert and the role assignment it requests must commit or roll back together (see
    // design.md's Risks & Concerns). A failure between the two would leave an account with no
    // role, which can authenticate but resolves an empty permission set.
    return this.transactionRunner.run(async () => {
      await this.users.save(user);
      await this.assignRoleToUser.execute(
        new AssignRoleToUserCommand(user.id.value, { name: SystemRole.Customer }),
      );
      this.events.publish(user.pullDomainEvents());
      return command.issuedByStaff
        ? { id: user.id.value, temporaryPassword: password.value }
        : { id: user.id.value };
    });
  }
}
