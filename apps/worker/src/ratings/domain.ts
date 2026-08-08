export const DEFAULT_RATING_MODEL_KEY = 'global-singles-glicko2-v1';

export function toDateString(value: string | Date | null): string | null {
    if (!value) return null;
    if (typeof value === 'string') return value.slice(0, 10);
    return value.toISOString().slice(0, 10);
}
