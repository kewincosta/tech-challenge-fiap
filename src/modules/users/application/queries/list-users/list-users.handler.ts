import { Inject } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { PersonDocument } from '../../../domain/value-objects/person-document';
import { USER_QUERY_PORT, UserQueryPort, UserSummaryDto } from '../../ports/user-query.port';
import { ListUsersQuery } from './list-users.query';

@QueryHandler(ListUsersQuery)
export class ListUsersHandler implements IQueryHandler<ListUsersQuery, UserSummaryDto[]> {
  constructor(@Inject(USER_QUERY_PORT) private readonly userQuery: UserQueryPort) {}

  async execute(query: ListUsersQuery): Promise<UserSummaryDto[]> {
    let document: string | undefined;
    if (query.document !== undefined) {
      try {
        document = PersonDocument.create(query.document).value;
      } catch {
        // A malformed document filter matches nobody by construction - no error, empty result,
        // consistent with FindUserByDocumentHandler's tolerance for free-typed search input.
        return [];
      }
    }
    return this.userQuery.listActive({ role: query.role, document });
  }
}
