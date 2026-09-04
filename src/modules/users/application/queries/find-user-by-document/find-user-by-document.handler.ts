import { Inject } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { PersonDocument } from '../../../domain/value-objects/person-document';
import { USER_QUERY_PORT, UserQueryPort, UserSummaryDto } from '../../ports/user-query.port';
import { FindUserByDocumentQuery } from './find-user-by-document.query';

@QueryHandler(FindUserByDocumentQuery)
export class FindUserByDocumentHandler implements IQueryHandler<
  FindUserByDocumentQuery,
  UserSummaryDto | null
> {
  constructor(@Inject(USER_QUERY_PORT) private readonly userQuery: UserQueryPort) {}

  async execute(query: FindUserByDocumentQuery): Promise<UserSummaryDto | null> {
    let document: PersonDocument;
    try {
      document = PersonDocument.create(query.document);
    } catch {
      // A malformed document is a counter-search miss, not a validation failure - unlike
      // registration, which rejects it. Returning null lets the search answer "no match" for
      // free-typed input.
      return null;
    }
    return this.userQuery.findActiveByDocument(document.value);
  }
}
