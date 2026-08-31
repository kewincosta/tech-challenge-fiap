import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { EffectiveAccessDto } from '../../application/dtos/effective-access.dto';
import { EffectiveAccessReader } from '../../application/ports/effective-access-reader.port';

const EFFECTIVE_ACCESS_SQL = `
WITH member_groups AS (
  SELECT group_id FROM user_groups WHERE user_id = $1
),
all_roles AS (
  SELECT role_id FROM user_roles WHERE user_id = $1
  UNION
  SELECT role_id FROM group_roles WHERE group_id IN (SELECT group_id FROM member_groups)
)
SELECT 'role' AS kind, r.name AS value
  FROM roles r
 WHERE r.id IN (SELECT role_id FROM all_roles)
UNION
SELECT 'permission' AS kind, p.code AS value
  FROM permissions p
 WHERE p.id IN (
   SELECT permission_id FROM role_permissions WHERE role_id IN (SELECT role_id FROM all_roles)
   UNION
   SELECT permission_id FROM group_permissions
    WHERE group_id IN (SELECT group_id FROM member_groups)
 )
ORDER BY kind, value
`;

interface EffectiveAccessRow {
  kind: 'role' | 'permission';
  value: string;
}

@Injectable()
export class TypeOrmEffectiveAccessReader implements EffectiveAccessReader {
  constructor(private readonly dataSource: DataSource) {}

  async read(userId: string): Promise<EffectiveAccessDto> {
    const rows: EffectiveAccessRow[] = await this.dataSource.query(EFFECTIVE_ACCESS_SQL, [userId]);
    return {
      roles: rows.filter((row) => row.kind === 'role').map((row) => row.value),
      permissions: rows.filter((row) => row.kind === 'permission').map((row) => row.value),
    };
  }
}
