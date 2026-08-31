import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { Principal } from '../../../authentication/presentation/principal';
import { EffectiveAccessService } from '../../application/services/effective-access.service';
import { REQUIRED_PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';
import { REQUIRED_ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly effectiveAccess: EffectiveAccessService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions =
      this.reflector.getAllAndOverride<string[] | undefined>(REQUIRED_PERMISSIONS_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];
    const requiredRoles =
      this.reflector.getAllAndOverride<string[] | undefined>(REQUIRED_ROLES_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];
    if (requiredPermissions.length === 0 && requiredRoles.length === 0) {
      return true;
    }
    const request = context.switchToHttp().getRequest<Request & { principal?: Principal }>();
    const principal = request.principal;
    if (!principal) {
      throw new ForbiddenException();
    }
    const access = await this.effectiveAccess.getEffectiveAccess(principal.userId);
    const hasAllPermissions = requiredPermissions.every((permission) =>
      access.permissions.includes(permission),
    );
    const hasAnyRequiredRole =
      requiredRoles.length === 0 || requiredRoles.some((role) => access.roles.includes(role));
    if (!hasAllPermissions || !hasAnyRequiredRole) {
      throw new ForbiddenException();
    }
    return true;
  }
}
