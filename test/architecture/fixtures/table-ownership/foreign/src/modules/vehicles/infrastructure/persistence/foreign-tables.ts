export const FROM_SQL = `SELECT id FROM customers WHERE external_id = $1`;
export const JOIN_SQL = `SELECT v.id FROM vehicles v JOIN users u ON u.id = v.owner_id`;
export const INTO_SQL = `INSERT INTO services (name) VALUES ($1)`;
export const UPDATE_SQL = `UPDATE inventory_items SET quantity_on_hand = 0`;
