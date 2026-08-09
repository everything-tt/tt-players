import { describe, expect, it } from 'vitest';
import {
    manualTournamentUrlHash,
    normalizeManualTournamentUrl,
} from '../routes/manual-tournament-submissions.js';

describe('manual tournament submission URL handling', () => {
    it('canonicalizes Google Forms view URLs so tracking parameters do not create duplicates', () => {
        expect(normalizeManualTournamentUrl(
            'https://docs.google.com/forms/d/1HdR8UAiSs0b5BsvGG28x_MVpJwYk6stUkDbVgWfcui4/viewform?ts=6a4e128d&edit_requested=true#section',
        )).toBe(
            'https://docs.google.com/forms/d/1HdR8UAiSs0b5BsvGG28x_MVpJwYk6stUkDbVgWfcui4/viewform',
        );
    });

    it('preserves meaningful query parameters on ordinary HTTPS links while removing fragments', () => {
        expect(normalizeManualTournamentUrl(
            'https://example.com/tournament-entry?id=42#entry',
        )).toBe('https://example.com/tournament-entry?id=42');
    });

    it('rejects non-HTTPS URLs', () => {
        expect(() => normalizeManualTournamentUrl('http://example.com/form')).toThrow(
            'Only HTTPS tournament links are supported',
        );
    });

    it('rejects URLs containing embedded credentials', () => {
        expect(() => normalizeManualTournamentUrl('https://user:secret@example.com/form')).toThrow(
            'Tournament links must not contain embedded credentials',
        );
    });

    it('generates a stable source hash for a canonical URL', () => {
        const url = 'https://example.com/tournament-entry?id=42';
        expect(manualTournamentUrlHash(url)).toBe(manualTournamentUrlHash(url));
        expect(manualTournamentUrlHash(url)).toHaveLength(64);
    });
});
