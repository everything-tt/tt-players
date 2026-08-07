import { FileMigrationProvider } from 'kysely';
import * as fs from 'fs/promises';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { validateMigrationOrder } from '../migration-preflight.js';

describe('migration preflight', () => {
    it('allows pending migrations after the executed prefix', () => {
        const pending = validateMigrationOrder(
            ['001_create_enums', '002_create_core_tables', '003_add_feature'],
            ['001_create_enums', '002_create_core_tables'],
        );
        expect(pending).toEqual(['003_add_feature']);
    });

    it('rejects a new migration inserted before an already executed migration', () => {
        expect(() => validateMigrationOrder(
            [
                '001_create_enums',
                '002_create_core_tables',
                '029_create_source_registry',
                '029_create_weekly_rating_history',
                '030_create_player_identity_decisions',
            ],
            [
                '001_create_enums',
                '002_create_core_tables',
                '029_create_source_registry',
                '030_create_player_identity_decisions',
            ],
        )).toThrow(
            'expected previously executed migration 030_create_player_identity_decisions to be at index 3',
        );
    });

    it('rejects missing previously executed migrations', () => {
        expect(() => validateMigrationOrder(
            ['001_create_enums', '003_add_feature'],
            ['001_create_enums', '002_create_core_tables'],
        )).toThrow('previously executed migration 002_create_core_tables is missing');
    });

    it('keeps repository migrations pending after the production 033 prefix', async () => {
        const provider = new FileMigrationProvider({
            fs,
            path,
            migrationFolder: path.join(import.meta.dirname, '..', 'migrations'),
        });
        const availableMigrations = Object.keys(await provider.getMigrations())
            .filter((migration) => migration.localeCompare('031_') >= 0);

        expect(validateMigrationOrder(
            availableMigrations,
            [
                '031_create_weekly_rating_history',
                '032_create_rating_replay_checkpoints',
                '033_capture_monthly_rating_checkpoints',
            ],
        )).toEqual([
            '034_create_user_sync_states',
            '035_create_api_read_models',
            '036_create_tournament_sources',
            '037_correct_tournament_lifecycle_statuses',
            '038_flatten_player_identity_chains',
            '039_restore_query_performance_indexes',
            '040_create_rating_audit_snapshots',
            '041_create_competition_embeddings',
            '042_create_rating_audit_foundation',
            '043_create_rating_player_coverage',
            '044_create_rating_source_quality',
            '045_create_current_rating_rankings',
            '046_create_scraping_pipeline_run_history',
            '047_separate_tournament_lifecycles',
            '048_alter_competition_embeddings_embedding_to_float8',
            '049_add_canonical_event_metadata',
            '049_create_rating_calculation_audit',
            '050_add_competition_entry_fee',
            '051_add_competition_categories',
        ]);
    });
});