# Home improvements and accessible expeditions · #180

The real `/fjord-play` uses direct home specialization and upgrade controls. Expeditions is a global group overview, with an inline resident checklist, independent of the selected home, resident or animal.

## Review

Open the [QA launcher](https://acer-railway-fact-smaller.trycloudflare.com/playtest/). Existing starting, developed and winter scenarios retain their original discovery settings.

- **Funded starting scenario:** build an ordinary home, open Change specialization and choose an occupation icon. The home keeps its residents' occupations. Inspect the cost, matching-work bonus and annual upkeep before upgrading.
- **Exploration & rival clan:** a fresh, paused Summer 800 campaign with seed 32, normal starting resources, one hidden living rival and a ready group of two eligible founders. Start Expedition confirms the ordinary Food cost; Explore Area chooses a real land destination. Start the clock to travel and Return Home to recall the group.
- **New campaign options:** the Campaign menu exposes Enable exploration & rival clan. This applies to a new island campaign; changing the checkbox alone leaves the active campaign unchanged.

The exploration scenario is prepared through the normal SharedSettlement and FjordCampaign factories. Group creation and membership use existing Core commands. [Preparation provenance](../integrated-playtest-180/exploration-scenario.json) records those commands and the delivered save hash. No extra stock, range, endurance, vehicles or enemy knowledge is granted.

## Home behavior

The compact card separates household membership, building specialization and upgrade level. Resident identities remain available through the household disclosure. The specialization chooser uses the existing occupation icons and includes Unspecialized. Changing specialization retains upgrade level, upkeep, occupations and the independent farmyard function.

Upgrade cost, bonus, maintenance and eligibility come from the active campaign configuration and Core. The resident productivity disclosure previews the actual work rules. Roles without production output and residents who currently cannot work are shown factually. Empty homes show zero charged upkeep and the maintenance that applies when occupied. Missing specialization, insufficient Materials and maximum level have explicit states.

Ordinary specialization and upgrade actions commit directly. Salvage and other consequential management remain under More management with the existing consequence review. Repeated clicks on an obsolete upgrade level are revalidated before commit. UpgradeBuilding joins the existing zero-time atomic management transaction; a failed later command still commits nothing.

| Journey from the world | Target clicks |
|---|---:|
| Select home → Change specialization → occupation icon | 3 |
| Select specialized home → Upgrade | 2 |
| Select home → specialize → first upgrade | 4 |

Group checklists use canonical expedition eligibility. Hidden expedition rosters and hidden home controls are not rebuilt on simulation ticks; destination cleanup still runs when a journey ends.

## Verification

[Browser observations](observations.json) record source hashes and real normal-build interactions, including world picking, home upgrades, existing-save preservation, explicit new-campaign discovery, inline group edits, Food confirmation, physical travel and return. Screenshots cover the home at desktop and 1024 × 636, and ready/returned expeditions. This is browser emulation, not physical-device acceptance.

[29 focused regression tests](focused-tests.txt) pass with zero failures or skips. TypeScript, the normal Vite build, script syntax and diff checks pass. The browser additionally tests a deliberately obsolete upgrade button and verifies that it spends no Materials.

[Desktop home card](home-level-I-desktop.jpg) · [1024 × 636 home card](home-level-I-ipad.jpg) · [Ready exploration group](expedition-ready.jpg) · [Returned expedition](expedition-returned.jpg)

```powershell
node scripts/qa/prepare-exploration-playtest-180.mjs
node --test --test-concurrency=2 tests/home-improvements.test.mjs tests/work-plan.test.mjs tests/island-clans.test.mjs tests/expedition-mode.test.mjs
npm run build
node scripts/qa/fjord-playtest-server.mjs
$env:QA_ORIGIN = 'http://127.0.0.1:5199'
node scripts/qa/check-home-expeditions-180.mjs
```

No gameplay balance, world-generation, saved-state schema or asset-pipeline changes are introduced. Earlier visual and performance reports remain records of their original source revisions. The existing build chunk-size advisory remains. Formatting is reviewed manually because this repository has no configured formatter.
