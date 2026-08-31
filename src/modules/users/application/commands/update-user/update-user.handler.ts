import { Inject } from '@nestjs/common';
import { CommandHandler, EventBus, ICommandHandler } from '@nestjs/cqrs';
import { CLOCK, Clock } from '../../../../../shared/application/ports/clock.port';
import { DocumentAlreadyInUseError } from '../../../domain/errors/document-already-in-use.error';
import { EmailAlreadyInUseError } from '../../../domain/errors/email-already-in-use.error';
import { UserNotFoundError } from '../../../domain/errors/user-not-found.error';
import { USER_REPOSITORY, UserRepository } from '../../../domain/repositories/user.repository';
import { Email } from '../../../domain/value-objects/email';
import { PersonDocument } from '../../../domain/value-objects/person-document';
import { UserId } from '../../../domain/value-objects/user-id';
import { UpdateUserCommand } from './update-user.command';

@CommandHandler(UpdateUserCommand)
export class UpdateUserHandler implements ICommandHandler<UpdateUserCommand, void> {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly eventBus: EventBus,
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
    this.eventBus.publishAll(user.pullDomainEvents());
  }
}
