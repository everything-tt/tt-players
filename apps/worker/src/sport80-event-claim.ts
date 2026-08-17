import { sql, type Kysely } from 'kysely';

export interface Sport80EventClaimInput {
    eventId: string;
    eventName?: string;
    eventDate?: string | null;
    category?: string;
    force?: boolean;
    /** Internal policy refresh permission for a row observed as processed. */
    refreshProcessed?: boolean;
    /** processed_at observed by discovery; null means it observed a null timestamp. */
    refreshObservedProcessedAt?: string | null;
}

export interface Sport80EventClaimResult {
    claimed: boolean;
    status: 'pending' | 'processed' | 'failed';
}

function policyRefreshCondition(input: Sport80EventClaimInput) {
    if (!input.refreshProcessed) return sql<boolean>`false`;
    if (input.refreshObservedProcessedAt == null) {
        return sql<boolean>`sport80_event_scrape_state.processed_at IS NULL`;
    }

    const observedAt = new Date(input.refreshObservedProcessedAt);
    if (Number.isNaN(observedAt.getTime())) {
        throw new Error(
            `invalid Sport80 observed processed timestamp ${input.refreshObservedProcessedAt}`,
        );
    }
    return sql<boolean>`sport80_event_scrape_state.processed_at <= ${observedAt}`;
}

/**
 * Atomically claim one Sport80 event for result scraping.
 *
 * A normal duplicate never steals a processed row. A policy refresh may claim
 * the processed row only while it is still the same/older version observed by
 * discovery. A newer concurrent success therefore remains processed. Explicit
 * operator force intentionally overrides that protection.
 */
export async function claimSport80EventForScrape(
    database: Kysely<any>,
    input: Sport80EventClaimInput,
    claimTime: Date = new Date(),
): Promise<Sport80EventClaimResult> {
    const canRefreshProcessed = input.force
        ? sql<boolean>`true`
        : policyRefreshCondition(input);

    const claim = await database
        .insertInto('staging.sport80_event_scrape_state')
        .values({
            event_id: input.eventId,
            event_name: input.eventName ?? null,
            event_date: input.eventDate ?? null,
            category: input.category ?? null,
            status: 'pending',
            last_attempted_at: claimTime,
            updated_at: claimTime,
        })
        .onConflict((oc) =>
            oc.column('event_id').doUpdateSet({
                event_name: (eb: any) => eb.ref('excluded.event_name'),
                event_date: (eb: any) => eb.ref('excluded.event_date'),
                category: (eb: any) => eb.ref('excluded.category'),
                status: sql`case
                    when sport80_event_scrape_state.status = 'processed'
                     and not (${canRefreshProcessed})
                    then sport80_event_scrape_state.status
                    else 'pending'::scrape_status
                end`,
                last_attempted_at: sql`case
                    when sport80_event_scrape_state.status = 'processed'
                     and not (${canRefreshProcessed})
                    then sport80_event_scrape_state.last_attempted_at
                    else ${claimTime}
                end`,
                last_error: sql`case
                    when sport80_event_scrape_state.status = 'processed'
                     and not (${canRefreshProcessed})
                    then sport80_event_scrape_state.last_error
                    else null
                end`,
                updated_at: claimTime,
            }),
        )
        .returning('status')
        .executeTakeFirstOrThrow();

    return {
        claimed: claim.status !== 'processed',
        status: claim.status,
    };
}
