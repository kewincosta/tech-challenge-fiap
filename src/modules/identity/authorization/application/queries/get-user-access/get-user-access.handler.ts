import { GetUserByIdHandler } from '../../../../users/application/queries/get-user-by-id/get-user-by-id.handler';
import { GetUserByIdQuery } from '../../../../users/application/queries/get-user-by-id/get-user-by-id.query';
import { UserNotFoundError } from '../../../../users/domain/errors/user-not-found.error';
import { AssignedUserNotFoundError } from '../../../domain/errors/assigned-user-not-found.error';
import { RbacQueryPort, UserAccessDto } from '../../ports/rbac-query.port';
import { GetUserAccessQuery } from './get-user-access.query';

export class GetUserAccessHandler {
  constructor(
    private readonly rbacQuery: RbacQueryPort,
    private readonly getUserById: GetUserByIdHandler,
  ) {}

  async execute(query: GetUserAccessQuery): Promise<UserAccessDto> {
    try {
      await this.getUserById.execute(new GetUserByIdQuery(query.userId));
    } catch (error) {
      if (error instanceof UserNotFoundError) {
        throw new AssignedUserNotFoundError();
      }
      throw error;
    }
    return this.rbacQuery.getUserAccess(query.userId);
  }
}
