import type { Kysely } from 'kysely';

/**
 * Pending implementation. The regression tests on this branch define the
 * required chain-flattening behaviour before the production migration lands.
 */
export async function up(_db: Kysely<any>): Promise<void> {}

export async function down(_db: Kysely<any>): Promise<void> {}
