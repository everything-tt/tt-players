import { describe, expect, it } from 'vitest';
import { evidenceConfidence, percentage } from '../routes/h2h-analysis.js';

describe('H2H analysis helpers', () => {
  it('calculates rounded percentages and handles empty samples', () => {
    expect(percentage(2, 3)).toBe(67);
    expect(percentage(0, 0)).toBe(0);
  });

  it('grades evidence confidence from sample size and shared opponents', () => {
    expect(evidenceConfidence(8, 2)).toBe('low');
    expect(evidenceConfidence(14, 2)).toBe('medium');
    expect(evidenceConfidence(30, 5)).toBe('high');
    expect(evidenceConfidence(30, 4)).toBe('medium');
  });
});
