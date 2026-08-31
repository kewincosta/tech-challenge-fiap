import { Inject } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { GroupDto, RBAC_QUERY_PORT, RbacQueryPort } from '../../ports/rbac-query.port';
import { ListGroupsQuery } from './list-groups.query';

@QueryHandler(ListGroupsQuery)
export class ListGroupsHandler implements IQueryHandler<ListGroupsQuery, GroupDto[]> {
  constructor(@Inject(RBAC_QUERY_PORT) private readonly rbacQuery: RbacQueryPort) {}

  async execute(): Promise<GroupDto[]> {
    return this.rbacQuery.listGroups();
  }
}
