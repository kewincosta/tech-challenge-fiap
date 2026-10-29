import { User } from '../../domain/entities/user';
import { Email } from '../../domain/value-objects/email';
import { PersonDocument } from '../../domain/value-objects/person-document';
import { UserId } from '../../domain/value-objects/user-id';

export interface UserRepository {
  findById(id: UserId): Promise<User | null>;
  findByEmail(email: Email): Promise<User | null>;
  existsByEmail(email: Email): Promise<boolean>;
  findByDocument(document: PersonDocument): Promise<User | null>;
  existsByDocument(document: PersonDocument): Promise<boolean>;
  save(user: User): Promise<void>;
}
