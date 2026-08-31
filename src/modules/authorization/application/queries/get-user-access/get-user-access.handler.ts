import { Inject } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { QueryBus } from '@nestjs/cqrs';
import { UserDto } from '../../../../users/application/dtos/user.dto';
import { GetUserByIdQuery } from '../../../../users/application/queries/get-user-by-id/get-user-by-id.query';
import { AssignedUserNotFoundError } from '../../../domain/errors/assigned-user-not-found.error';
import { RBAC_QUERY_PORT, RbacQueryPort, UserAccessDto } from '../../ports/rbac-query.port';
import { GetUserAccessQuery } from './get-user-access.query';

@QueryHandler(GetUserAccessQuery)
export class GetUserAccessHandler implements IQueryHandler<GetUserAccessQuery, UserAccessDto> {
  constructor(
    @Inject(RBAC_QUERY_PORT) private readonly rbacQuery: RbacQueryPort,
    private readonly queryBus: QueryBus,
  ) {}

  async execute(query: GetUserAccessQuery): Promise<UserAccessDto> {
    const user = await this.queryBus.execute<GetUserByIdQuery, UserDto | null>(
      new GetUserByIdQuery(query.userId),
    );
    if (!user) {
      throw new AssignedUserNotFoundError();
    }
    return this.rbacQuery.getUserAccess(query.userId);
  }
}
