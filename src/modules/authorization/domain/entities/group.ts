import { AggregateRoot } from '../../../../shared/domain/aggregate-root';
import { GroupId } from '../value-objects/group-id';
import { GroupName } from '../value-objects/group-name';

interface GroupProps {
  id: GroupId;
  name: GroupName;
  description: string | null;
  roleIds: Set<string>;
  permissionIds: Set<string>;
  createdAt: Date;
  updatedAt: Date;
}

interface CreateGroupInput {
  id: GroupId;
  name: GroupName;
  description: string | null;
  now: Date;
}

interface RestoreGroupInput {
  id: GroupId;
  name: GroupName;
  description: string | null;
  roleIds: string[];
  permissionIds: string[];
  createdAt: Date;
  updatedAt: Date;
}

interface UpdateGroupInput {
  name?: GroupName;
  description?: string | null;
}

export class Group extends AggregateRoot {
  private constructor(private readonly props: GroupProps) {
    super();
  }

  static create(input: CreateGroupInput): Group {
    return new Group({
      id: input.id,
      name: input.name,
      description: input.description,
      roleIds: new Set(),
      permissionIds: new Set(),
      createdAt: input.now,
      updatedAt: input.now,
    });
  }

  static restore(input: RestoreGroupInput): Group {
    return new Group({
      ...input,
      roleIds: new Set(input.roleIds),
      permissionIds: new Set(input.permissionIds),
    });
  }

  update(input: UpdateGroupInput, now: Date): void {
    if (input.name) {
      this.props.name = input.name;
    }
    if (input.description !== undefined) {
      this.props.description = input.description;
    }
    this.props.updatedAt = now;
  }

  setRoles(roleIds: string[], now: Date): void {
    this.props.roleIds = new Set(roleIds);
    this.props.updatedAt = now;
  }

  setPermissions(permissionIds: string[], now: Date): void {
    this.props.permissionIds = new Set(permissionIds);
    this.props.updatedAt = now;
  }

  get id(): GroupId {
    return this.props.id;
  }

  get name(): GroupName {
    return this.props.name;
  }

  get description(): string | null {
    return this.props.description;
  }

  get roleIds(): readonly string[] {
    return [...this.props.roleIds];
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
