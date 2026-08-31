import { AggregateRoot } from '../../../../shared/domain/aggregate-root';
import { InvalidUserNameError } from '../errors/invalid-user-name.error';
import { UserRegistered } from '../events/user-registered.event';
import { UserStatus } from '../user-status';
import { Email } from '../value-objects/email';
import { PasswordHash } from '../value-objects/password-hash';
import { PersonDocument } from '../value-objects/person-document';
import { UserId } from '../value-objects/user-id';

interface UserProps {
  id: UserId;
  email: Email;
  name: string;
  document: PersonDocument;
  passwordHash: PasswordHash;
  status: UserStatus;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

interface RegisterUserInput {
  id: UserId;
  email: Email;
  name: string;
  document: PersonDocument;
  passwordHash: PasswordHash;
  now: Date;
}

const NAME_MIN_LENGTH = 2;
const NAME_MAX_LENGTH = 120;

export class User extends AggregateRoot {
  private constructor(private readonly props: UserProps) {
    super();
  }

  static register(input: RegisterUserInput): User {
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    if (name.length < NAME_MIN_LENGTH || name.length > NAME_MAX_LENGTH) {
      throw new InvalidUserNameError();
    }
    const user = new User({
      id: input.id,
      email: input.email,
      name,
      document: input.document,
      passwordHash: input.passwordHash,
      status: UserStatus.Active,
      createdAt: input.now,
      updatedAt: input.now,
      deletedAt: null,
    });
    user.record(new UserRegistered(input.id.value, input.email.value, input.now));
    return user;
  }

  static restore(props: UserProps): User {
    return new User({ ...props });
  }

  changePassword(newHash: PasswordHash, now: Date): void {
    this.props.passwordHash = newHash;
    this.props.updatedAt = now;
  }

  deactivate(now: Date): void {
    if (this.props.status === UserStatus.Inactive) {
      return;
    }
    this.props.status = UserStatus.Inactive;
    this.props.updatedAt = now;
  }

  canAuthenticate(): boolean {
    return this.props.status === UserStatus.Active && this.props.deletedAt === null;
  }

  get id(): UserId {
    return this.props.id;
  }

  get email(): Email {
    return this.props.email;
  }

  get name(): string {
    return this.props.name;
  }

  get document(): PersonDocument {
    return this.props.document;
  }

  get passwordHash(): PasswordHash {
    return this.props.passwordHash;
  }

  get status(): UserStatus {
    return this.props.status;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  get deletedAt(): Date | null {
    return this.props.deletedAt;
  }
}
