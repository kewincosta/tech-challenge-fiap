import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { currentEntityManager } from '../../../../shared/infrastructure/database/typeorm-transaction-runner';

/**
 * Translates between the UUIDs that leave the process and the internal keys of `inventory_items`,
 * for the modules whose tables point at an inventory item (AD-013). It reads through the
 * transaction open on this async context, if any, so an item written earlier in the caller's
 * transaction resolves inside it (AD-008). A key that belongs to no item is `null` in the single
 * forms and absent from the maps.
 */
@Injectable()
export class InventoryItemKeyResolver {
  constructor(private readonly dataSource: DataSource) {}

  async toInternalId(externalId: string): Promise<string | null> {
    const rows: Array<{ id: string }> = await this.runner().query(
      `SELECT id FROM inventory_items WHERE external_id = $1`,
      [externalId],
    );
    return rows[0]?.id ?? null;
  }

  async toExternalId(internalId: string): Promise<string | null> {
    const rows: Array<{ external_id: string }> = await this.runner().query(
      `SELECT external_id FROM inventory_items WHERE id = $1`,
      [internalId],
    );
    return rows[0]?.external_id ?? null;
  }

  /** Keyed by external id, valued by internal key. */
  async toInternalIds(externalIds: string[]): Promise<Map<string, string>> {
    const rows: Array<{ id: string; external_id: string }> = await this.runner().query(
      `SELECT id, external_id FROM inventory_items WHERE external_id = ANY($1::uuid[])`,
      [externalIds],
    );
    return new Map(rows.map((row) => [row.external_id, row.id]));
  }

  /** Keyed by internal key, valued by external id. */
  async toExternalIds(internalIds: string[]): Promise<Map<string, string>> {
    const rows: Array<{ id: string; external_id: string }> = await this.runner().query(
      `SELECT id, external_id FROM inventory_items WHERE id = ANY($1::bigint[])`,
      [internalIds],
    );
    return new Map(rows.map((row) => [row.id, row.external_id]));
  }

  private runner(): EntityManager | DataSource {
    return currentEntityManager() ?? this.dataSource;
  }
}
