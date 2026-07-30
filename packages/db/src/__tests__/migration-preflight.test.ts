import { describe, expect, it } from 'vitest';
import { validateMigrationOrder } from '../migration-preflight.js';

describe('migration preflight', () => {
    it('allows pending migrations after the executed prefix', () => {
        const pending = validateMigrationOrder(
            [
                '001_create_enums',
                '002_create_core_tables',
                '003_add_feature',
            ],
            [
                '001_create_enums',
                '002_create_core_tables',
            ],
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
            [
                '001_create_enums',
                '003_add_feature',
            ],
            [
                '001_create_enums',
                '002_create_core_tables',
            ],
        )).toThrow('previously executed migration 002_create_core_tables is missing');
    });
});
