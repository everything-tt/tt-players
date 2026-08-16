const DEFAULT_MAX_SOURCE_EVENT_SPAN_DAYS = 366;

function parseIsoDate(value: string, field: string): number {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        throw new Error(`invalid ${field} date ${value}`);
    }
    const timestamp = Date.parse(`${value}T00:00:00Z`);
    if (Number.isNaN(timestamp)) throw new Error(`invalid ${field} date ${value}`);
    return timestamp;
}

export function enumerateCompleteSourceDates(
    startDate: string | null,
    endDate: string | null,
    maxSpanDays = DEFAULT_MAX_SOURCE_EVENT_SPAN_DAYS,
): string[] {
    if (!startDate) return [];
    if (!Number.isInteger(maxSpanDays) || maxSpanDays <= 0) {
        throw new Error('source event span guard must be a positive integer');
    }

    const start = parseIsoDate(startDate, 'start');
    const end = parseIsoDate(endDate ?? startDate, 'end');
    if (end < start) throw new Error(`source event end date ${endDate} precedes ${startDate}`);

    const dayMs = 24 * 60 * 60 * 1_000;
    const spanDays = Math.floor((end - start) / dayMs) + 1;
    if (spanDays > maxSpanDays) {
        throw new Error(
            `source event spans ${spanDays} days, exceeding explicit safety guard ${maxSpanDays}; refusing partial discovery`,
        );
    }

    return Array.from({ length: spanDays }, (_value, index) =>
        new Date(start + index * dayMs).toISOString().slice(0, 10),
    );
}
