import { PersonDocument } from '../../../domain/value-objects/person-document';
import { UserQueryPort, UserSummaryDto } from '../../ports/user-query.port';
import { ListUsersQuery } from './list-users.query';

export class ListUsersUseCase {
  constructor(private readonly userQuery: UserQueryPort) {}

  async execute(query: ListUsersQuery): Promise<UserSummaryDto[]> {
    let document: string | undefined;
    if (query.document !== undefined) {
      try {
        document = PersonDocument.create(query.document).value;
      } catch {
        // A malformed document filter matches nobody by construction - no error, empty result,
        // consistent with FindUserByDocumentUseCase's tolerance for free-typed search input.
        return [];
      }
    }
    return this.userQuery.listActive({ role: query.role, document });
  }
}
