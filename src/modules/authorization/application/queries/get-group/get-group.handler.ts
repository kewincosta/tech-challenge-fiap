import { Inject } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { GroupDto, RBAC_QUERY_PORT, RbacQueryPort } from '../../ports/rbac-query.port';
import { GetGroupQuery } from './get-group.query';

@QueryHandler(GetGroupQuery)
export class GetGroupHandler implements IQueryHandler<GetGroupQuery, GroupDto | null> {
  constructor(@Inject(RBAC_QUERY_PORT) private readonly rbacQuery: RbacQueryPort) {}

  async execute(query: GetGroupQuery): Promise<GroupDto | null> {
    return this.rbacQuery.getGroupById(query.groupId);
  }
}
