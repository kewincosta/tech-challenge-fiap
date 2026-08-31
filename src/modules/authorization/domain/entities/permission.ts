import { PermissionCode } from '../value-objects/permission-code';
import { PermissionId } from '../value-objects/permission-id';

interface PermissionProps {
  id: PermissionId;
  code: PermissionCode;
  description: string | null;
}

export class Permission {
  private constructor(private readonly props: PermissionProps) {}

  static restore(props: PermissionProps): Permission {
    return new Permission({ ...props });
  }

  get id(): PermissionId {
    return this.props.id;
  }

  get code(): PermissionCode {
    return this.props.code;
  }

  get description(): string | null {
    return this.props.description;
  }
}
