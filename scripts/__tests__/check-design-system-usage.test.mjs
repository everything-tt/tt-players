import assert from 'node:assert/strict';
import test from 'node:test';
import {
  extractRulePreludes,
  getCanonicalFamilies,
  inspectCssSource,
  inspectTsxSource,
} from '../check-design-system-usage.mjs';

test('extracts selectors inside media queries without treating declarations as selectors', () => {
  const selectors = extractRulePreludes(`
    .screen-root { color: red; }
    @media (max-width: 420px) {
      .screen-root .tt-list-item__title { white-space: normal; }
    }
  `);

  assert.deepEqual(selectors, [
    '.screen-root',
    '.screen-root .tt-list-item__title',
  ]);
});

test('recognises canonical component families but not similarly named app classes', () => {
  assert.deepEqual(getCanonicalFamilies('.screen-root .tt-list-item__title'), ['list']);
  assert.deepEqual(getCanonicalFamilies('.tt-player-metric-grid'), []);
  assert.deepEqual(getCanonicalFamilies('.tt-tournament-results-section'), []);
});

test('fails a new application override of design-system internals', () => {
  const result = inspectCssSource(
    'new-screen.css',
    '.new-screen .tt-segmented__btn { min-height: 32px; }',
  );

  assert.equal(result.failures.length, 1);
  assert.match(result.failures[0], /canonical segmented internals/);
});

test('tracks existing migration exceptions by selector family', () => {
  const allowed = inspectCssSource(
    'player-insights.css',
    '.tt-insights-summary .tt-metric__value { font-size: 22px; }',
  );
  assert.deepEqual(allowed.failures, []);
  assert.equal(allowed.exceptions.length, 1);

  const rejected = inspectCssSource(
    'player-insights.css',
    '.tt-insights-summary .tt-entity-hero__title { font-size: 22px; }',
  );
  assert.equal(rejected.failures.length, 1);
});

test('rejects canonical geometry token declarations outside the token owner', () => {
  const result = inspectCssSource('new-screen.css', ':root { --tt-row-height-compact: 48px; }');
  assert.equal(result.failures.length, 1);
  assert.match(result.failures[0], /canonical geometry tokens/);
});

test('rejects page-level top and bottom clearance overrides', () => {
  const direct = inspectCssSource(
    'new-screen.css',
    '.tt-new-screen-page { padding-bottom: 24px; }',
  );
  assert.equal(direct.failures.length, 1);
  assert.match(direct.failures[0], /page-level top\/bottom clearance/);

  const descendant = inspectCssSource(
    'about.css',
    '.tt-about-page .page-content { padding-top: 8px; }',
  );
  assert.ok(descendant.failures.some((failure) => /page-level top\/bottom clearance/.test(failure)));
  assert.ok(descendant.failures.some((failure) => /page-content top\/bottom shell clearance/.test(failure)));
});

test('rejects the legacy app-shell-content hook on detail and root screens', () => {
  const detail = inspectTsxSource(
    'NewDetailPage.tsx',
    '<div className="page-content app-shell-content">content</div>',
  );
  assert.equal(detail.failures.length, 1);
  assert.match(detail.failures[0], /AppPageContent\/design-system shell classes/);

  const root = inspectTsxSource(
    'App.tsx',
    '<main className="page-content app-shell-content tt-page-content tt-root-content">content</main>',
  );
  assert.equal(root.failures.length, 1);
  assert.match(root.failures[0], /legacy app-shell-content hook/);
});
