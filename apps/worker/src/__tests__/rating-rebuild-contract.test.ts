import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const rebuildSource = readFileSync(
    fileURLToPath(new URL('../rebuild-weekly-rating-history.ts', import.meta.url)),
    'utf8',
);
const workflowSource = readFileSync(
    fileURLToPath(
        new URL('../../../../.github/workflows/rating-rebuild.yml', import.meta.url),
    ),
    'utf8',
);

describe('full calculated-rating rebuild contract', () => {
    it('supports a validated all-history scope and emits a machine-readable result', () => {
        expect(rebuildSource).toContain("hasFlag('all')");
        expect(rebuildSource).toContain('FROM rating_rubber_classification');
        expect(rebuildSource).toContain("eligibility_reason = 'eligible'");
        expect(rebuildSource).toContain('--all cannot be combined with --start-date or --years');
        expect(rebuildSource).toContain('RATING_REBUILD=');
    });

    it('clears every derived rating table before replay and records failures', () => {
        expect(rebuildSource).toContain('DELETE FROM rating_current_rankings');
        expect(rebuildSource).toContain('DELETE FROM rating_checkpoints');
        expect(rebuildSource).toContain('DELETE FROM player_rating_weekly_history');
        expect(rebuildSource).toContain('DELETE FROM player_ratings');
        expect(rebuildSource).toContain("status = 'failed'");
    });

    it('guards production execution and restores all dependent read models', () => {
        expect(workflowSource).toContain('workflow_dispatch:');
        expect(workflowSource).toContain('REBUILD_RATINGS');
        expect(workflowSource).toContain('group: vps-production-ttp');
        expect(workflowSource).toContain('systemctl stop ttp-worker');
        expect(workflowSource).toContain('Ensure worker is running');
        expect(workflowSource).toContain('src/refresh-rating-audit-snapshot.ts');
        expect(workflowSource).toContain("grep -q '^RATING_REBUILD='");
        expect(workflowSource).toContain("grep -q '^RATING_AUDIT_SNAPSHOT='");
    });
});
