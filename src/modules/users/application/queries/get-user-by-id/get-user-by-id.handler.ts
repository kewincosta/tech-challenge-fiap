import { Inject } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { USER_REPOSITORY, UserRepository } from '../../../domain/repositories/user.repository';
import { UserId } from '../../../domain/value-objects/user-id';
import { UserDto } from '../../dtos/user.dto';
import { GetUserByIdQuery } from './get-user-by-id.query';

@QueryHandler(GetUserByIdQuery)
export class GetUserByIdHandler implements IQueryHandler<GetUserByIdQuery, UserDto | null> {
  constructor(@Inject(USER_REPOSITORY) private readonly users: UserRepository) {}

  async execute(query: GetUserByIdQuery): Promise<UserDto | null> {
    let id: UserId;
    try {
      id = UserId.create(query.userId);
    } catch {
      return null;
    }
    const user = await this.users.findById(id);
    if (!user || user.deletedAt !== null) {
      return null;
    }
    return {
      id: user.id.value,
      email: user.email.value,
      name: user.name,
      status: user.status,
      createdAt: user.createdAt.toISOString(),
    };
  }
}
