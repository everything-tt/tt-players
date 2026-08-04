import assert from 'node:assert/strict';
import test from 'node:test';
import {
  extractRulePreludes,
  getCanonicalFamilies,
  inspectCssSource,
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
