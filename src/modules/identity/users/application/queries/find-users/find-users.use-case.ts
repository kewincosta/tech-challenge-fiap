import { PersonDocument } from '../../../domain/value-objects/person-document';
import { UserQueryPort, UserSummaryDto } from '../../ports/user-query.port';
import { FindUsersQuery } from './find-users.query';

/**
 * Finds users by id, by a fragment of the name or by document, for the modules that need user data
 * (each module queries only its own tables, AD-013). It returns users of any status, deactivated
 * ones included.
 */
export class FindUsersUseCase {
  constructor(private readonly userQuery: UserQueryPort) {}

  async execute(query: FindUsersQuery): Promise<UserSummaryDto[]> {
    let document: string | undefined;
    if (query.document !== undefined) {
      try {
        document = PersonDocument.create(query.document).value;
      } catch {
        // A malformed document matches nobody, so the answer is an empty list, as ListUsersHandler
        // gives for the same input.
        return [];
      }
    }
    return this.userQuery.find({ ids: query.ids, nameContains: query.nameContains, document });
  }
}
