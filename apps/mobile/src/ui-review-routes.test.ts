import { describe, expect, it } from 'vitest';
import {
  buildReviewRouteList,
  createScreenshotSlug,
  isReviewableUrl,
} from './ui-review-routes';

const baseUrl = 'https://deploy-preview-12--ttp-players.netlify.app/';

describe('UI review route helpers', () => {
  it('keeps same-origin app pages and rejects unsafe or irrelevant URLs', () => {
    expect(isReviewableUrl('/tabs/home', baseUrl)).toBe(true);
    expect(isReviewableUrl('https://deploy-preview-12--ttp-players.netlify.app/about', baseUrl)).toBe(true);

    expect(isReviewableUrl('/api/health', baseUrl)).toBe(false);
    expect(isReviewableUrl('/assets/app.js', baseUrl)).toBe(false);
    expect(isReviewableUrl('mailto:test@example.com', baseUrl)).toBe(false);
    expect(isReviewableUrl('https://example.com/tabs/home', baseUrl)).toBe(false);
  });

  it('creates stable readable slugs for screenshot names', () => {
    expect(createScreenshotSlug(`${baseUrl}`)).toBe('home');
    expect(createScreenshotSlug(`${baseUrl}tabs/players?query=Alice`)).toBe('tabs-players');
    expect(createScreenshotSlug(`${baseUrl}data-coverage`)).toBe('data-coverage');
  });

  it('deduplicates discovered routes and keeps the route list bounded', () => {
    const routes = buildReviewRouteList({
      baseUrl,
      discoveredUrls: [
        '/tabs/players',
        '/tabs/players?query=Alice',
        '/tabs/leagues',
        '/api/health',
        '/tabs/events',
        '/about',
        '/data-coverage',
      ],
      maxRoutes: 5,
    });

    expect(routes).toEqual([
      `${baseUrl}`,
      `${baseUrl}tabs/home`,
      `${baseUrl}tabs/players`,
      `${baseUrl}tabs/leagues`,
      `${baseUrl}tabs/events`,
    ]);
  });
});
