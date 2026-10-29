import { Injectable } from '@nestjs/common';
import {
  AppPermission,
  GetUserByIdHandler,
  GetUserByIdQuery,
  GetUserEffectiveAccessHandler,
  GetUserEffectiveAccessQuery,
  SystemRole,
  UserNotFoundError,
} from '../../../identity';
import { ActorCapabilities, WorkOrderActors } from '../../application/ports/work-order-actors.port';

/**
 * Asks the identity module what an actor may do to work orders, so the permission codes and role
 * names stay on this side of the boundary (AD-012).
 */
@Injectable()
export class WorkOrderActorsGateway implements WorkOrderActors {
  constructor(
    private readonly getUserEffectiveAccess: GetUserEffectiveAccessHandler,
    private readonly getUserById: GetUserByIdHandler,
  ) {}

  async capabilitiesOf(userId: string): Promise<ActorCapabilities> {
    const access = await this.getUserEffectiveAccess.execute(
      new GetUserEffectiveAccessQuery(userId),
    );
    return {
      decidesAnyBudget: access.permissions.includes(AppPermission.WorkOrdersDecide),
      cancelsInExecution: access.permissions.includes(AppPermission.WorkOrdersCancelInExecution),
      managesWorkOrders: access.permissions.includes(AppPermission.WorkOrdersManage),
    };
  }

  // The existence read comes first: the effective access of a user that does not exist is empty,
  // the same as for a user without roles, so it cannot tell the two apart.
  async findMechanicCandidate(userId: string): Promise<{ isMechanic: boolean } | null> {
    try {
      await this.getUserById.execute(new GetUserByIdQuery(userId));
    } catch (error) {
      if (error instanceof UserNotFoundError) {
        return null;
      }
      throw error;
    }
    const access = await this.getUserEffectiveAccess.execute(
      new GetUserEffectiveAccessQuery(userId),
    );
    return { isMechanic: access.roles.includes(SystemRole.Mechanic) };
  }
}
