import { GetUserByIdHandler } from '../../../../users/application/queries/get-user-by-id/get-user-by-id.handler';
import { GetUserByIdQuery } from '../../../../users/application/queries/get-user-by-id/get-user-by-id.query';
import { AssignedUserNotFoundError } from '../../../domain/errors/assigned-user-not-found.error';
import { RbacQueryPort, UserAccessDto } from '../../ports/rbac-query.port';
import { GetUserAccessQuery } from './get-user-access.query';

export class GetUserAccessHandler {
  constructor(
    private readonly rbacQuery: RbacQueryPort,
    private readonly getUserById: GetUserByIdHandler,
  ) {}

  async execute(query: GetUserAccessQuery): Promise<UserAccessDto> {
    const user = await this.getUserById.execute(new GetUserByIdQuery(query.userId));
    if (!user) {
      throw new AssignedUserNotFoundError();
    }
    return this.rbacQuery.getUserAccess(query.userId);
  }
}
