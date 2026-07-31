import { sql, type Kysely } from 'kysely';
import { bumpDataVersion, type Database } from '@tt-players/db';

interface CountRow {
    platform_id: string;
    league_count: string;
    competition_count: string;
    fixture_count: string;
    rubber_count: string;
    dated_rubbers: string;
    full_score_rubbers: string;
    missing_player_rubbers: string;
}

interface PlayerRow {
    platform_id: string;
    external_players: string;
    canonical_players: string;
}

interface ScrapeRow {
    platform_id: string;
    total_scrapes: string;
    failed_scrapes: string;
    latest_scraped_at: Date | null;
}

interface RegistryRow {
    platform_id: string;
    source_instances: string;
    source_resources: string;
    unhealthy_resources: string;
    latest_succeeded_at: Date | null;
    latest_fetched_at: Date | null;
}

interface ErrorRow {
    platform_id: string;
    last_error: string;
}

interface GlobalRow {
    canonical_players: string;
    rubbers: string;
    dated_rubbers: string;
    full_score_rubbers: string;
    missing_player_rubbers: string;
    pending_identity_suggestions: string;
}

function numberValue(value: string | number | null | undefined): number {
    return Number(value ?? 0);
}

function percentage(part: number, total: number): number {
    if (total === 0) return 0;
    return Math.round((part / total) * 1000) / 10;
}

function latestIso(...values: Array<Date | string | null | undefined>): string | null {
    let latest = 0;
    for (const value of values) {
        if (!value) continue;
        const timestamp = new Date(value).getTime();
        if (!Number.isNaN(timestamp)) latest = Math.max(latest, timestamp);
    }
    return latest === 0 ? null : new Date(latest).toISOString();
}

export async function refreshPlayerActiveLeagues(db: Kysely<Database>): Promise<number> {
    return db.transaction().execute(async (trx) => {
        await trx.deleteFrom('player_active_leagues').execute();

        const result = await sql<{ player_id: string; league_id: string }>`
            WITH active_players AS (
                SELECT
                    COALESCE(player.canonical_player_id, player.id) AS player_id,
                    season.league_id
                FROM rubbers rubber
                JOIN external_players player ON player.id = rubber.home_player_1_id
                JOIN fixtures fixture ON fixture.id = rubber.fixture_id
                JOIN competitions competition ON competition.id = fixture.competition_id
                JOIN seasons season ON season.id = competition.season_id
                WHERE rubber.deleted_at IS NULL
                  AND rubber.is_doubles = false
                  AND player.deleted_at IS NULL
                  AND fixture.deleted_at IS NULL
                  AND competition.deleted_at IS NULL
                  AND season.deleted_at IS NULL
                  AND season.is_active = true

                UNION

                SELECT
                    COALESCE(player.canonical_player_id, player.id) AS player_id,
                    season.league_id
                FROM rubbers rubber
                JOIN external_players player ON player.id = rubber.away_player_1_id
                JOIN fixtures fixture ON fixture.id = rubber.fixture_id
                JOIN competitions competition ON competition.id = fixture.competition_id
                JOIN seasons season ON season.id = competition.season_id
                WHERE rubber.deleted_at IS NULL
                  AND rubber.is_doubles = false
                  AND player.deleted_at IS NULL
                  AND fixture.deleted_at IS NULL
                  AND competition.deleted_at IS NULL
                  AND season.deleted_at IS NULL
                  AND season.is_active = true
            )
            INSERT INTO player_active_leagues (player_id, league_id, updated_at)
            SELECT player_id, league_id, now()
            FROM active_players
            RETURNING player_id, league_id
        `.execute(trx);

        return result.rows.length;
    });
}

export async function buildSourceQualitySnapshot(db: Kysely<Database>) {
    const [platforms, counts, players, scrapes, registry, errors, global] = await Promise.all([
        db.selectFrom('platforms')
            .select(['id', 'name', 'base_url'])
            .orderBy('name', 'asc')
            .execute(),
        sql<CountRow>`
            SELECT
                l.platform_id,
                COUNT(DISTINCT l.id)::text AS league_count,
                COUNT(DISTINCT c.id)::text AS competition_count,
                COUNT(DISTINCT f.id)::text AS fixture_count,
                COUNT(r.id)::text AS rubber_count,
                COUNT(r.id) FILTER (
                    WHERE COALESCE(r.played_at, f.date_played) IS NOT NULL
                )::text AS dated_rubbers,
                COUNT(r.id) FILTER (WHERE r.score_source = 'games')::text AS full_score_rubbers,
                COUNT(r.id) FILTER (
                    WHERE r.home_player_1_id IS NULL OR r.away_player_1_id IS NULL
                )::text AS missing_player_rubbers
            FROM leagues l
            LEFT JOIN seasons s ON s.league_id = l.id AND s.deleted_at IS NULL
            LEFT JOIN competitions c ON c.season_id = s.id AND c.deleted_at IS NULL
            LEFT JOIN fixtures f ON f.competition_id = c.id AND f.deleted_at IS NULL
            LEFT JOIN rubbers r ON r.fixture_id = f.id AND r.deleted_at IS NULL
            WHERE l.deleted_at IS NULL
            GROUP BY l.platform_id
        `.execute(db),
        sql<PlayerRow>`
            SELECT
                platform_id,
                COUNT(*)::text AS external_players,
                COUNT(DISTINCT COALESCE(canonical_player_id, id))::text AS canonical_players
            FROM external_players
            WHERE deleted_at IS NULL
            GROUP BY platform_id
        `.execute(db),
        sql<ScrapeRow>`
            SELECT
                platform_id,
                COUNT(*)::text AS total_scrapes,
                COUNT(*) FILTER (WHERE status = 'failed')::text AS failed_scrapes,
                MAX(scraped_at) AS latest_scraped_at
            FROM staging.raw_scrape_logs
            GROUP BY platform_id
        `.execute(db),
        sql<RegistryRow>`
            SELECT
                si.platform_id,
                COUNT(DISTINCT si.id)::text AS source_instances,
                COUNT(sr.id)::text AS source_resources,
                COUNT(sr.id) FILTER (WHERE sr.consecutive_failures > 0)::text AS unhealthy_resources,
                MAX(sr.last_succeeded_at) AS latest_succeeded_at,
                MAX(sr.last_fetched_at) AS latest_fetched_at
            FROM source_instances si
            LEFT JOIN source_resources sr
              ON sr.source_instance_id = si.id
             AND sr.enabled = true
            WHERE si.enabled = true
            GROUP BY si.platform_id
        `.execute(db),
        sql<ErrorRow>`
            SELECT DISTINCT ON (si.platform_id)
                si.platform_id,
                sr.last_error
            FROM source_instances si
            JOIN source_resources sr ON sr.source_instance_id = si.id
            WHERE sr.last_error IS NOT NULL
            ORDER BY si.platform_id, sr.last_fetched_at DESC NULLS LAST, sr.updated_at DESC
        `.execute(db),
        sql<GlobalRow>`
            SELECT
                (SELECT COUNT(DISTINCT COALESCE(canonical_player_id, id))
                 FROM external_players WHERE deleted_at IS NULL)::text AS canonical_players,
                (SELECT COUNT(*) FROM rubbers WHERE deleted_at IS NULL)::text AS rubbers,
                (SELECT COUNT(*)
                 FROM rubbers r
                 LEFT JOIN fixtures f ON f.id = r.fixture_id
                 WHERE r.deleted_at IS NULL
                   AND COALESCE(r.played_at, f.date_played) IS NOT NULL)::text AS dated_rubbers,
                (SELECT COUNT(*) FROM rubbers
                 WHERE deleted_at IS NULL AND score_source = 'games')::text AS full_score_rubbers,
                (SELECT COUNT(*) FROM rubbers
                 WHERE deleted_at IS NULL
                   AND (home_player_1_id IS NULL OR away_player_1_id IS NULL))::text AS missing_player_rubbers,
                (SELECT COUNT(*) FROM player_identity_decisions
                 WHERE status = 'suggested')::text AS pending_identity_suggestions
        `.execute(db),
    ]);

    const countByPlatform = new Map(counts.rows.map((row) => [row.platform_id, row]));
    const playersByPlatform = new Map(players.rows.map((row) => [row.platform_id, row]));
    const scrapesByPlatform = new Map(scrapes.rows.map((row) => [row.platform_id, row]));
    const registryByPlatform = new Map(registry.rows.map((row) => [row.platform_id, row]));
    const errorsByPlatform = new Map(errors.rows.map((row) => [row.platform_id, row.last_error]));

    const sources = platforms.map((platform) => {
        const count = countByPlatform.get(platform.id);
        const player = playersByPlatform.get(platform.id);
        const scrape = scrapesByPlatform.get(platform.id);
        const sourceRegistry = registryByPlatform.get(platform.id);
        const rubbers = numberValue(count?.rubber_count);
        const unhealthyResources = numberValue(sourceRegistry?.unhealthy_resources);
        const latestActivityAt = latestIso(
            sourceRegistry?.latest_succeeded_at,
            sourceRegistry?.latest_fetched_at,
            scrape?.latest_scraped_at,
        );
        const health = unhealthyResources > 0
            ? 'degraded' as const
            : latestActivityAt
                ? 'healthy' as const
                : 'unobserved' as const;

        return {
            platform_id: platform.id,
            name: platform.name,
            base_url: platform.base_url,
            health,
            leagues: numberValue(count?.league_count),
            competitions: numberValue(count?.competition_count),
            fixtures: numberValue(count?.fixture_count),
            rubbers,
            dated_rubbers_pct: percentage(numberValue(count?.dated_rubbers), rubbers),
            full_score_rubbers_pct: percentage(numberValue(count?.full_score_rubbers), rubbers),
            missing_player_rubbers: numberValue(count?.missing_player_rubbers),
            external_players: numberValue(player?.external_players),
            canonical_players: numberValue(player?.canonical_players),
            total_scrapes: numberValue(scrape?.total_scrapes),
            failed_scrapes: numberValue(scrape?.failed_scrapes),
            source_instances: numberValue(sourceRegistry?.source_instances),
            source_resources: numberValue(sourceRegistry?.source_resources),
            unhealthy_resources: unhealthyResources,
            latest_activity_at: latestActivityAt,
            last_error: errorsByPlatform.get(platform.id) ?? null,
        };
    });

    const globalRow = global.rows[0];
    const globalRubbers = numberValue(globalRow?.rubbers);
    return {
        generated_at: new Date().toISOString(),
        summary: {
            providers: sources.length,
            healthy: sources.filter((source) => source.health === 'healthy').length,
            degraded: sources.filter((source) => source.health === 'degraded').length,
            unobserved: sources.filter((source) => source.health === 'unobserved').length,
            leagues: sources.reduce((total, source) => total + source.leagues, 0),
            competitions: sources.reduce((total, source) => total + source.competitions, 0),
            canonical_players: numberValue(globalRow?.canonical_players),
            rubbers: globalRubbers,
            dated_rubbers_pct: percentage(numberValue(globalRow?.dated_rubbers), globalRubbers),
            full_score_rubbers_pct: percentage(numberValue(globalRow?.full_score_rubbers), globalRubbers),
            missing_player_rubbers: numberValue(globalRow?.missing_player_rubbers),
            pending_identity_suggestions: numberValue(globalRow?.pending_identity_suggestions),
            unhealthy_resources: sources.reduce(
                (total, source) => total + source.unhealthy_resources,
                0,
            ),
        },
        sources,
    };
}

export async function refreshApiReadModels(
    db: Kysely<Database>,
    log: (message: string) => void = () => undefined,
): Promise<void> {
    const membershipCount = await refreshPlayerActiveLeagues(db);
    log(`read-models: refreshed ${membershipCount} active player-league memberships`);

    const snapshot = await buildSourceQualitySnapshot(db);
    const generatedAt = new Date(snapshot.generated_at);
    await db
        .insertInto('source_quality_snapshots')
        .values({
            key: 'global',
            content: snapshot,
            generated_at: generatedAt,
            updated_at: generatedAt,
        })
        .onConflict((conflict) => conflict.column('key').doUpdateSet({
            content: snapshot,
            generated_at: generatedAt,
            updated_at: generatedAt,
        }))
        .execute();

    await Promise.all([
        bumpDataVersion(db, 'source-quality'),
        bumpDataVersion(db, 'player-results'),
    ]);
    log('read-models: refreshed source quality snapshot');
}
