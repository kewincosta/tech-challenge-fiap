export const up = [
  `CREATE TABLE orphan_rows (id bigserial PRIMARY KEY)`,
  `CREATE TABLE IF NOT EXISTS customers (id bigserial PRIMARY KEY)`,
];
