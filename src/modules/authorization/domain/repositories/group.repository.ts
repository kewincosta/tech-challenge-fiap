import { Group } from '../entities/group';
import { GroupId } from '../value-objects/group-id';
import { GroupName } from '../value-objects/group-name';

export interface GroupRepository {
  findById(id: GroupId): Promise<Group | null>;
  existsByName(name: GroupName): Promise<boolean>;
  save(group: Group): Promise<void>;
  delete(group: Group): Promise<void>;
}

export const GROUP_REPOSITORY = Symbol('GroupRepository');
