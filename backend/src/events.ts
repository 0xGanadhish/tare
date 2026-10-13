import type { Network } from '../../shared/networks';

export interface EventRow {
  network: Network; vault: string; owner?: string | null; type: string; message: string; txHash?: string | null; confidence?: number | null;
}

/** Watch feed row. Addresses are stored lowercase so lookups don't depend on checksum casing. */
export async function addEvent(db: D1Database, e: EventRow, at = new Date()): Promise<void> {
  await db.prepare('INSERT INTO events (network, id, owner, vault, type, message, tx_hash, confidence, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(e.network, crypto.randomUUID(), e.owner?.toLowerCase() ?? null, e.vault.toLowerCase(), e.type, e.message, e.txHash ?? null, e.confidence ?? null, at.toISOString())
    .run();
}
