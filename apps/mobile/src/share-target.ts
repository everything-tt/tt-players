export interface ShareTarget {
  title: string;
  text: string;
  url: string;
}

type SharePlayer = {
  id: string;
  name: string;
};

function canonicalUrl(origin: string, path: string): string {
  return `${origin.replace(/\/+$/, '')}${path}`;
}

function entityPath(segment: string, id: string): string {
  return `/${segment}/${encodeURIComponent(id)}`;
}

export function buildHomeShareTarget(origin: string): ShareTarget {
  return {
    title: 'TT Players',
    text: 'Explore table tennis players, teams, results, and tournaments on TT Players.',
    url: canonicalUrl(origin, '/'),
  };
}

export function buildPlayerShareTarget(origin: string, playerId: string, playerName: string): ShareTarget {
  return {
    title: `${playerName} | TT Players`,
    text: `View ${playerName}'s table tennis profile on TT Players.`,
    url: canonicalUrl(origin, entityPath('players', playerId)),
  };
}

export function buildTeamShareTarget(origin: string, teamId: string, teamName: string): ShareTarget {
  return {
    title: `${teamName} | TT Players`,
    text: `View ${teamName}'s results, form, and squad on TT Players.`,
    url: canonicalUrl(origin, entityPath('teams', teamId)),
  };
}

export function buildTournamentShareTarget(origin: string, eventId: string, eventName: string): ShareTarget {
  return {
    title: `${eventName} | TT Players`,
    text: `View ${eventName}'s results and players on TT Players.`,
    url: canonicalUrl(origin, entityPath('tournaments', eventId)),
  };
}

export function buildH2HShareTarget(origin: string, first: SharePlayer, second: SharePlayer): ShareTarget {
  const [playerA, playerB] = [first, second].sort((a, b) => a.id.localeCompare(b.id));
  return {
    title: `${playerA.name} vs ${playerB.name} | TT Players`,
    text: `Compare ${playerA.name} and ${playerB.name} head to head on TT Players.`,
    url: canonicalUrl(
      origin,
      `/h2h/${encodeURIComponent(playerA.id)}/${encodeURIComponent(playerB.id)}`,
    ),
  };
}

export function formatShareText(target: ShareTarget): string {
  return `${target.title}\n${target.text}\n${target.url}`;
}

export function buildWebShareLinks(target: ShareTarget) {
  const title = encodeURIComponent(target.title);
  const text = encodeURIComponent(target.text);
  const url = encodeURIComponent(target.url);
  const message = encodeURIComponent(`${target.text}\n${target.url}`);

  return {
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${url}&quote=${text}`,
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${url}&summary=${text}&title=${title}`,
    mail: `mailto:?subject=${title}&body=${message}`,
    twitter: `https://twitter.com/intent/tweet?url=${url}&text=${encodeURIComponent(`${target.title}\n${target.text}`)}`,
    whatsapp: `https://wa.me/?text=${encodeURIComponent(formatShareText(target))}`,
  };
}

export async function shareTarget(target: ShareTarget): Promise<string | null> {
  try {
    if (typeof navigator.share === 'function') {
      await navigator.share(target);
      return 'Shared';
    }

    const fallbackText = formatShareText(target);
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(fallbackText);
      return 'Share link copied';
    }

    window.prompt(target.title, fallbackText);
    return 'Copy the share link from the prompt';
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return null;
    window.prompt(target.title, formatShareText(target));
    return 'Copy the share link from the prompt';
  }
}
