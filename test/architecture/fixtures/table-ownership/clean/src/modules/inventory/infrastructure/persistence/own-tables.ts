// A JOIN condition stays in the ON clause, and UPDATE or DELETE return a row count.
export const PENDING = `
  WITH pending AS (
    SELECT id FROM stock_movements WHERE status = 'PENDING'
  ),
  latest AS (
    SELECT id FROM pending
  )
  SELECT ii.id
    FROM inventory_items ii
    JOIN stock_movements sm ON sm.inventory_item_id = ii.id
    JOIN latest ON latest.id = sm.id
   WHERE ii.id IN (SELECT movement_id FROM unnest($1::bigint[]) AS movement_id)
     FOR UPDATE OF ii
`;

export const UPSERT = `
  INSERT INTO inventory_items (sku) VALUES ($1)
  ON CONFLICT (sku) DO UPDATE SET name = EXCLUDED.name
`;

export const AVERAGE_AGE = `SELECT EXTRACT(EPOCH FROM (now() - created_at)) FROM inventory_items`;
