import { Clock } from '../../../../../../shared/application/ports/clock.port';
import { DomainEventPublisher } from '../../../../../../shared/application/ports/domain-event-publisher.port';
import { DocumentAlreadyInUseError } from '../../../domain/errors/document-already-in-use.error';
import { EmailAlreadyInUseError } from '../../../domain/errors/email-already-in-use.error';
import { UserNotFoundError } from '../../../domain/errors/user-not-found.error';
import { Email } from '../../../domain/value-objects/email';
import { PersonDocument } from '../../../domain/value-objects/person-document';
import { UserId } from '../../../domain/value-objects/user-id';
import { UserRepository } from '../../ports/user.repository';
import { UpdateUserCommand } from './update-user.command';

export class UpdateUserHandler {
  constructor(
    private readonly users: UserRepository,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
  ) {}

  async execute(command: UpdateUserCommand): Promise<void> {
    const userId = UserId.create(command.userId);
    const user = await this.users.findById(userId);
    if (!user) {
      throw new UserNotFoundError();
    }

    const email = command.email !== undefined ? Email.create(command.email) : undefined;
    if (email !== undefined) {
      const existing = await this.users.findByEmail(email);
      if (existing && !existing.id.equals(userId)) {
        throw new EmailAlreadyInUseError();
      }
    }

    const document =
      command.document !== undefined ? PersonDocument.create(command.document) : undefined;
    if (document !== undefined) {
      const existing = await this.users.findByDocument(document);
      if (existing && !existing.id.equals(userId)) {
        throw new DocumentAlreadyInUseError();
      }
    }

    user.updateProfile({ name: command.name, email, document }, this.clock.now());
    await this.users.save(user);
    this.events.publish(user.pullDomainEvents());
  }
}
