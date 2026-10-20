# Explore pack increase — #231

Base: `82f8797d9a3f72174f6b0d21d5f0ae805c84d217`, branch `codex/explore-pack-231`.
This is a small production balance change, separate from the livestock study
and the deferred transport expansion. No historical measurement output is edited.

## Behavior

New ordinary Starts spend 8 Food per actual participant once, permanently, and
provide 2,000 active ticks at the unchanged 250 ticks per Food/person. Prices for
one/two/four participants are 8/16/32 Food. An ordinary pack never uses the QA
override. The UI imports its default from Core; quotes, affordability and saved
supply displays retain their existing authoritative offer/projection paths.

Provisions version 2 records the new ordinary pack. Version 1 retains exactly
2 Food for old ordinary missions, including already paid Prepared missions.
Marked QA packs in either version retain their recorded 1–10 budget. Unknown
versions, wrong ordinary prices and inconsistent per-member balances still fail.
Subsequent new Starts in a preserved campaign buy eight; loading never refills,
recharges or rewrites an old pack. Old frozen replays remain tied to their original
source/rules rather than being relabelled as new eight-Food runs.

Consumption, casualty losses, discarded unused supplies, redirects, homeward
reserve, travel speed and separate mission rules are unchanged. Founding Food
remains 15: a two-person start needs 16 and is initially refused.

## Executed checks

- A failing public Start test first observed the old 2-Food quote, then passed
  after the canonical change. **55 focused tests passed**, no failures or skips:
  expedition mode, spatial movement, island missions, world expeditions and
  campaign session. [Raw output](tests.txt).
- The saved [legacy fixture](legacy-prepared.json) was captured through the
  pre-change Core. Its ordinary Prepared pack was generated at the main base;
  the explicit ten-Food QA fixture used the unchanged historical SpatialExpeditions
  blob `88188fd14fb8dda5f85bd31ad0e9db8e7f6bc444`. Both load unchanged and continue
  consuming their original budgets. New eight-Food missions also survive load.
- Production build/public assets/TypeScript passed; the existing large-chunk
  warning remains. [Build output](build.txt). Character validation including
  explicit Lab previews passed: [output](characters.txt).
- Browser inspection used the actual ExpeditionPanel and GameplaySession on a
  bounded QA fixture. Desktop 1280×800 quoted 16 for two; cancel spent nothing,
  confirm reduced 64 to 48 and showed 2,000 ticks with `QA override: false`.
  Phone 390×844 quoted 32 for four and reduced 64 to 32, also 2,000 ticks.
  Tablet 1180×820 quoted 16. Phone/tablet had no horizontal overflow. The original
  15-Food fixture refused two participants with “16 Food (15 available)”.
  This is responsive browser evidence, not physical-device performance acceptance.
  [Desktop](desktop-confirm.jpg), [tablet](tablet-confirm.jpg), [phone](phone-confirm.jpg).
- Source formatting was reviewed manually and `git diff --check` passed; the
  project has no configured automatic formatter. CI is reported separately on
  the PR; these local results do not claim completion of the full CI suite.

## Matched real-route smoke

The [bounded runner](../../../scripts/qa/check-explore-pack-231.mjs) regenerates
the existing `island-pool-v2` fixtures 7 and 18, with the same foundations and
campfire exclusions as Fjord. It uses 15 starting Food, Summer 800, normal Core
stepping including the real CPU, and disables persona mortality/fertility and
weather only to isolate ration timing. One member carries either an explicitly
paid two-Food QA pack or the ordinary eight-Food pack. The same short mapped
destination is chosen through real offers in both arms. No world route is
fabricated and no rival coordinates choose the player's target.

| Island fixture | Paid Food | Return starts after | Home by | Reason |
| --- | ---: | ---: | ---: | --- |
| 7 | 2 | 490 ticks | 498 ticks | Low supplies |
| 7 | 8 | 1,990 ticks | 1,998 ticks | Low supplies |
| 18 | 2 | 490 ticks | 498 ticks | Low supplies |
| 18 | 8 | 1,990 ticks | 1,998 ticks | Low supplies |

At each first ten-tick return observation, 10 active ticks remained and 10 were
reserved for the confirmed return. Both arms returned physically, with one
upfront pack purchase. The same mapped-area Recon offer still charged 2 per
participant. [Raw results and hashes](physical-smoke.json), [log](physical-smoke.log).

An **observer-only** direct route query to the reserved rival site found a route
on 7 and reached the existing 40,000-node search limit on 18. It did not dispatch
a mission or reveal a site to the player. A search-limit refusal does not prove
impassability. Existing focused tests separately reject actual water/cliff routes.
Unknown-site knowledge gates remain in effect. This result is not a fix or a new
reproduction of the historical 211 Recon refusals; that navigation follow-up
remains under #151 / physical missions. No livestock matrix was rerun.

## Reproduce

```powershell
pnpm install --frozen-lockfile
node --test tests/expedition-mode.test.mjs tests/spatial-expeditions.test.mjs tests/island-missions.test.mjs tests/world-expeditions.test.mjs tests/campaign-session.test.mjs
node scripts/qa/check-explore-pack-231.mjs
pnpm build
node scripts/validate-public-assets.mjs --tracked
node scripts/validate-characters.mjs --lab-previews
```

[Browser review fixture](review.html). Its funded controls are explicitly QA-only;
ordinary game founding stocks have not increased. The existing test-supplies
browser script was updated for the new default; browser observations above used
the current review fixture through the in-app browser, not that script.
