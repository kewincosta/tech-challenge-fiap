import { AggregateRoot } from '../../../../shared/domain/aggregate-root';
import { SystemRoleImmutableError } from '../errors/system-role-immutable.error';
import { RoleId } from '../value-objects/role-id';
import { RoleName } from '../value-objects/role-name';

interface RoleProps {
  id: RoleId;
  name: RoleName;
  description: string | null;
  isSystem: boolean;
  permissionIds: Set<string>;
  createdAt: Date;
  updatedAt: Date;
}

interface CreateRoleInput {
  id: RoleId;
  name: RoleName;
  description: string | null;
  permissionIds: string[];
  now: Date;
}

interface RestoreRoleInput {
  id: RoleId;
  name: RoleName;
  description: string | null;
  isSystem: boolean;
  permissionIds: string[];
  createdAt: Date;
  updatedAt: Date;
}

interface UpdateRoleInput {
  name?: RoleName;
  description?: string | null;
}

export class Role extends AggregateRoot {
  private constructor(private readonly props: RoleProps) {
    super();
  }

  static create(input: CreateRoleInput): Role {
    return new Role({
      id: input.id,
      name: input.name,
      description: input.description,
      isSystem: false,
      permissionIds: new Set(input.permissionIds),
      createdAt: input.now,
      updatedAt: input.now,
    });
  }

  static restore(input: RestoreRoleInput): Role {
    return new Role({ ...input, permissionIds: new Set(input.permissionIds) });
  }

  update(input: UpdateRoleInput, now: Date): void {
    if (input.name && !input.name.equals(this.props.name)) {
      this.ensureMutable();
      this.props.name = input.name;
    }
    if (input.description !== undefined) {
      this.props.description = input.description;
    }
    this.props.updatedAt = now;
  }

  setPermissions(permissionIds: string[], now: Date): void {
    this.props.permissionIds = new Set(permissionIds);
    this.props.updatedAt = now;
  }

  ensureDeletable(): void {
    this.ensureMutable();
  }

  private ensureMutable(): void {
    if (this.props.isSystem) {
      throw new SystemRoleImmutableError();
    }
  }

  get id(): RoleId {
    return this.props.id;
  }

  get name(): RoleName {
    return this.props.name;
  }

  get description(): string | null {
    return this.props.description;
  }

  get isSystem(): boolean {
    return this.props.isSystem;
  }

  get permissionIds(): readonly string[] {
    return [...this.props.permissionIds];
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }
}
