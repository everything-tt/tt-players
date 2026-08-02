import { expect, test } from '@playwright/test';

interface PlayerSearchResponse {
  data: Array<{ id: string; name: string }>;
}

test('traces the player hero padding cascade', async ({ page }) => {
  const previewUrl = process.env.PREVIEW_URL?.replace(/\/$/, '');
  if (!previewUrl) throw new Error('PREVIEW_URL is required');

  await page.addInitScript(() => {
    localStorage.setItem('tt_players_league_onboarding_complete', 'true');
    localStorage.setItem('tt_players_selected_league_ids', JSON.stringify([]));
    localStorage.setItem('TTPlayers-Theme', 'light-mode');
  });

  const params = new URLSearchParams({ q: 'Wudong Liu', limit: '10', offset: '0' });
  const response = await page.request.get(`${previewUrl}/api/players/search?${params.toString()}`);
  expect(response.ok()).toBe(true);
  const lookup = await response.json() as PlayerSearchResponse;
  const player = lookup.data.find((item) => item.name === 'Wudong Liu') ?? lookup.data[0];
  expect(player).toBeTruthy();

  await page.goto(`${previewUrl}/tabs/players/player/${player!.id}`, { waitUntil: 'domcontentloaded' });
  const hero = page.locator('.tt-player-profile-hero');
  await expect(hero).toBeVisible({ timeout: 30_000 });

  const cascade = await hero.evaluate((element) => {
    const matchingRules: Array<{ href: string; selector: string; cssText: string }> = [];
    for (const sheet of Array.from(document.styleSheets)) {
      let rules: CSSRuleList;
      try {
        rules = sheet.cssRules;
      } catch {
        continue;
      }
      const visit = (ruleList: CSSRuleList) => {
        for (const rule of Array.from(ruleList)) {
          if (rule instanceof CSSStyleRule) {
            try {
              if (element.matches(rule.selectorText) && (
                rule.style.padding
                || rule.style.paddingLeft
                || rule.style.paddingRight
              )) {
                matchingRules.push({
                  href: sheet.href ?? 'inline',
                  selector: rule.selectorText,
                  cssText: rule.style.cssText,
                });
              }
            } catch {
              // Ignore unsupported selectors.
            }
          } else if ('cssRules' in rule) {
            visit((rule as CSSGroupingRule).cssRules);
          }
        }
      };
      visit(rules);
    }

    const style = getComputedStyle(element);
    return {
      className: element.className,
      paddingLeft: style.paddingLeft,
      paddingRight: style.paddingRight,
      matchingRules,
    };
  });

  console.log(`PLAYER_HERO_PADDING_CASCADE ${JSON.stringify(cascade)}`);
  expect(cascade.paddingLeft).not.toBe('0px');
});
