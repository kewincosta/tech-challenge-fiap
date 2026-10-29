import { UserNotFoundError } from '../../../domain/errors/user-not-found.error';
import { UserId } from '../../../domain/value-objects/user-id';
import { UserDto } from '../../dtos/user.dto';
import { UserRepository } from '../../ports/user.repository';
import { GetUserByIdQuery } from './get-user-by-id.query';

export class GetUserByIdUseCase {
  constructor(private readonly users: UserRepository) {}

  async execute(query: GetUserByIdQuery): Promise<UserDto> {
    let id: UserId;
    try {
      id = UserId.create(query.userId);
    } catch {
      // A malformed id matches nobody by construction.
      throw new UserNotFoundError();
    }
    const user = await this.users.findById(id);
    if (!user || user.deletedAt !== null) {
      throw new UserNotFoundError();
    }
    return {
      id: user.id.value,
      email: user.email.value,
      name: user.name,
      status: user.status,
      mustChangePassword: user.mustChangePassword,
      createdAt: user.createdAt.toISOString(),
    };
  }
}
