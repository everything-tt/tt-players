#### Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | Favourites and league-scope changes update silently, so users get little confirmation that the app state changed. |
| 2 | Match System / Real World | 2 | Terms like "Shared scope" and "H2H" assume product knowledge instead of speaking in plain match-day language. |
| 3 | User Control and Freedom | 3 | Core back paths exist, but quick undo for remove/save actions is missing. |
| 4 | Consistency and Standards | 3 | The visual system is cohesive, but the shell stacks several navigation patterns that compete for attention. |
| 5 | Error Prevention | 2 | List rows mix navigation and secondary actions, making mis-taps likely on mobile. |
| 6 | Recognition Rather Than Recall | 2 | Users must remember that a global league filter changes every tab after leaving the editor. |
| 7 | Flexibility and Efficiency | 2 | The shell lacks a fast repeat-use path such as recents, shortcuts, or a direct player lookup focus. |
| 8 | Aesthetic and Minimalist Design | 3 | The shell is calm and polished, but too many similar cards and explanatory layers dilute priority. |
| 9 | Error Recovery | 2 | Error states explain failures, but rarely suggest what the user should do next. |
| 10 | Help and Documentation | 1 | There is no real onboarding or contextual help for first-time users. |
| **Total** | | **22/40** | **Acceptable** |

#### Anti-Patterns Verdict

**LLM assessment**: This does not look like obvious AI slop. The restrained palette, careful footer navigation, and Apple-leaning chrome feel intentional. The weaker point is that the shell still reads like a refined mobile template more than a table-tennis tool. The home surface, utility copy, and menu hero could belong to many polished apps with only minor copy changes.

**Deterministic scan**: `npx impeccable detect --json apps/mobile/src/App.tsx` returned `[]` with exit code `0`, so the detector found no coded anti-patterns in the main shell file. A follow-up scan against `http://localhost:7474/#/tabs/home` timed out after 30s and still returned an empty array, so browser-side detector evidence is inconclusive. The detector missed several practical issues visible in code: anchor-as-button patterns in `apps/mobile/src/App.tsx` and `apps/mobile/src/TabFooterBar.tsx`, clickable icon-only secondary actions in player rows, and repeated hard-coded white/black values in `apps/mobile/src/app-shell.css`.

**Visual inspection**: In a live mobile viewport, the shell feels steady and premium at first glance. The footer is easy to parse and the main home actions are reachable, but the top-of-screen utility layer asks users to understand the app before doing anything with it.

#### Overall Impression

The shell has a solid premium base and better restraint than most sports-data apps, but it still spends too much of the first screen explaining structure instead of accelerating the most common match-day action. The single biggest opportunity is to reduce navigation and filter complexity so the app feels immediate rather than managed.

#### What's Working

- The bottom nav is clear, thumb-friendly, and visually stable in `apps/mobile/src/TabFooterBar.tsx` and `apps/mobile/src/app-shell.css`, which suits distracted match-day use.
- The tonal base matches the product brief well. The muted neutrals and restrained accenting make the data feel credible rather than playful.
- Loading, empty, and error states exist across the shell, which keeps the interface from feeling brittle even when data is missing.

#### Priority Issues

**[P1] Too many navigation layers before the user can act**
- **Why it matters**: The shell asks users to juggle footer tabs, header actions, a global scope concept, home shortcuts, and in-tab mode switches before they reach the real task.
- **Fix**: Collapse one navigation layer. Make one primary task dominant per tab, and demote the rest to secondary controls or deeper views.
- **Suggested command**: `/impeccable distill apps/mobile/src/App.tsx`

**[P1] "Shared scope" is product language, not user language**
- **Why it matters**: Users must translate an internal filter model before they understand why results change across tabs.
- **Fix**: Rename it to a plain-language league filter, surface it as a compact persistent chip, and explain its effect once instead of in multiple locations.
- **Suggested command**: `/impeccable clarify apps/mobile/src/App.tsx`

**[P1] Player list rows combine navigation with inline save/remove controls**
- **Why it matters**: One-handed users can easily tap the heart/remove affordance when they meant to open the player row.
- **Fix**: Separate secondary actions from the row tap target, or move them into a dedicated overflow or swipe action.
- **Suggested command**: `/impeccable harden apps/mobile/src/App.tsx`

**[P2] The home tab is polished but too generic for the job**
- **Why it matters**: Big counts and long descriptions do not help a returning user get to the next player, fixture, or rivalry quickly.
- **Fix**: Replace one stats block with recents, last-viewed players, or a more direct jump into the most-used flow.
- **Suggested command**: `/impeccable onboard apps/mobile/src/HomeTabContent.tsx`

**[P2] The app-controls menu breaks the grounded tone**
- **Why it matters**: The dark gradient hero in the side menu feels more like template drama than a tight utility surface.
- **Fix**: Flatten the menu into a quieter sheet, reduce decorative contrast, and make the filter control the visual priority.
- **Suggested command**: `/impeccable quieter apps/mobile/src/App.tsx`

#### Persona Red Flags

**Casey (Distracted Mobile User)**: Important shell controls sit at the top of the screen, while the league filter requires a context switch into an editor. The player rows also mix primary and secondary taps, which raises mis-tap risk during one-handed use.

**Jordan (First-Timer)**: "H2H", "Shared scope", and "player pool" are not self-explanatory. The app looks polished, but the first best action is not obvious enough within five seconds.

**Alex (Power User)**: The shell lacks a fast lane for repeat actions. There is no immediate recent-player access, no accelerated search-first landing, and too much shell framing around routine lookup tasks.

#### Minor Observations

- `apps/mobile/src/HomeTabContent.tsx` uses "Against your friend and enemy", which is looser and jokier than the otherwise precise tone.
- The shell duplicates theme access in both the header and the app-controls menu.
- Header subtitles are helpful, but verbose enough that they feel explanatory rather than directional.
- The app still leans on `href="#"` interaction patterns in multiple places, which weakens semantic clarity.

#### Questions to Consider

- Does this app need a `Home` tab at all, or should it open directly into the most common lookup task?
- If league filtering is global, why is it explained in several places instead of shown once as a compact persistent control?
- What would the shell feel like if the only goal were "find one player in under 10 seconds"?
