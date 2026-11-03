export const READ_SQL = `SELECT c.id FROM customers c JOIN users u ON u.id = c.user_id`;
