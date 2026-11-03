/**
 * The module that owns each table. Only the owner queries a table (AD-013); the schema and its
 * foreign keys are shared, the data is not.
 *
 * The check reads the migrations too: a table a migration creates and this map lacks fails the
 * build, so every new table gets an owner when it is made.
 */
export const TABLE_OWNERS: Readonly<Record<string, string>> = {
  users: 'identity',
  roles: 'identity',
  permissions: 'identity',
  user_roles: 'identity',
  role_permissions: 'identity',
  sessions: 'identity',
  refresh_tokens: 'identity',
  customers: 'customers',
  vehicles: 'vehicles',
  services: 'services',
  inventory_items: 'inventory',
  stock_movements: 'inventory',
  stock_movement_transitions: 'inventory',
  work_orders: 'work-orders',
  work_order_services: 'work-orders',
  work_order_parts: 'work-orders',
  work_order_events: 'work-orders',
  work_order_budgets: 'work-orders',
  work_order_stock_steps: 'work-orders',
  customer_account_steps: 'customers',
  // Written by TypeORM's migration runner, not by a migration. No module queries it.
  migrations: 'shared',
};
