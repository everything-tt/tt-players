import { describe, expect, it } from 'vitest';
import {
  buildH2HShareTarget,
  buildHomeShareTarget,
  buildPlayerShareTarget,
  buildTeamShareTarget,
  buildTournamentShareTarget,
  buildWebShareLinks,
  formatShareText,
} from './share-target';

const origin = 'https://tt-players.example';

describe('share targets', () => {
  it('shares the canonical app home without tab state', () => {
    expect(buildHomeShareTarget(origin)).toEqual({
      title: 'TT Players',
      text: 'Explore table tennis players, teams, results, and tournaments on TT Players.',
      url: `${origin}/`,
    });
  });

  it('builds stable entity deep links', () => {
    expect(buildPlayerShareTarget(origin, 'player 1', 'Jane Doe').url)
      .toBe(`${origin}/players/player%201`);
    expect(buildTeamShareTarget(origin, 'team/1', 'Central TTC').url)
      .toBe(`${origin}/teams/team%2F1`);
    expect(buildTournamentShareTarget(origin, 'event 1', 'Summer Open').url)
      .toBe(`${origin}/tournaments/event%201`);
  });

  it('builds an order-independent H2H deep link', () => {
    const first = buildH2HShareTarget(origin, {
      id: 'b',
      name: 'Beta',
    }, {
      id: 'a',
      name: 'Alpha',
    });
    const second = buildH2HShareTarget(origin, {
      id: 'a',
      name: 'Alpha',
    }, {
      id: 'b',
      name: 'Beta',
    });

    expect(first).toEqual(second);
    expect(first.url).toBe(`${origin}/h2h/a/b`);
    expect(first.title).toBe('Alpha vs Beta | TT Players');
  });

  it('uses the same target metadata for web fallbacks', () => {
    const target = buildPlayerShareTarget(origin, 'player-1', 'Jane Doe');
    const links = buildWebShareLinks(target);
    const fallbackText = formatShareText(target);

    expect(fallbackText).toContain(target.title);
    expect(fallbackText).toContain(target.text);
    expect(fallbackText).toContain(target.url);
    expect(decodeURIComponent(links.twitter)).toContain(target.title);
    expect(decodeURIComponent(links.twitter)).toContain(target.text);
    expect(decodeURIComponent(links.twitter)).toContain(target.url);
    expect(decodeURIComponent(links.mail)).toContain(target.title);
    expect(decodeURIComponent(links.mail)).toContain(target.text);
    expect(decodeURIComponent(links.mail)).toContain(target.url);
  });
});
