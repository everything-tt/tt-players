export function mergeTournamentPage<T extends { id: string }>(
  previous: T[],
  incoming: T[],
  reset: boolean,
): T[] {
  if (reset) return incoming;

  const existingIds = new Set(previous.map((item) => item.id));
  return [
    ...previous,
    ...incoming.filter((item) => !existingIds.has(item.id)),
  ];
}
