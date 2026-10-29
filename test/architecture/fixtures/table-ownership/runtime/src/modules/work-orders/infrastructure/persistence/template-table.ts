export const lookup = (table: string): string => `SELECT id FROM ${table} WHERE external_id = $1`;
