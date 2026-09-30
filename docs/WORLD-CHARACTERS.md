# Generated world residents

The world spawns ten adults with the same `generateCharacterDNA(seed)` function
used by Character Lab's Randomize character action. The world seed and stable
resident index derive each seed. Age is 18–80, gender uses the current male/female
model, traits use the configurator's 0–100% range, and all six heritage shares
are randomly drawn then normalized. Reloading reproduces those identities.

The same `generatePhenotype` and `Mannequin` render their appearance; the same
`characterName` derives their names from dominant heritage and seed. No DOM or
Character Lab scene is instantiated in the world. Movement remains the existing
bounded wandering system; jobs, heredity and saves remain out of scope.

Click/tap a resident to display their name, gender, age, five trait percentages
and six heritage percentages. A generous invisible pick silhouette helps touch
selection at RTS scale. The nearest scene mesh blocks selection through buildings.
The card follows the resident's projected head position and stays inside the
viewport, hiding when the resident leaves it. Its button, Escape or clicking/tapping
elsewhere dismisses it. Character taps consume camera navigation; ground taps
retain camera navigation. Swipes, drags and pinches never select a character.

Validation: `npm test`, `npm run build`, existing world and lab browser smoke
scripts, plus `node scripts/world-profiles-smoke.cjs` (Playwright/Chromium). The
profile script verifies actual desktop clicks and native mobile touches against
the seeded model's name, age/gender, trait and heritage rows, viewport bounds and
dismissal. It pauses browser animation only in the test to stabilize click targets.
Scenery assets remain excluded from Git and require the user's commercial license.
