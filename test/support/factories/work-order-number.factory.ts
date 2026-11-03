// A work order number is six letters or digits, a dash and four digits, and the pattern accepts any
// four digits as the year. The test database is never truncated, so a number drawn from six
// characters alone ends up colliding with an older row (`ux_work_orders_number`). The random year
// widens the space to about 2e13.
export function uniqueWorkOrderNumber(): string {
  const prefix = Math.random().toString(36).slice(2, 8).toUpperCase().padEnd(6, '0');
  const year = 1000 + Math.floor(Math.random() * 9000);
  return `${prefix}-${year}`;
}
