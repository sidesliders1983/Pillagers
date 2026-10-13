# Summer 800 founding phase (#157)

## Activation

The owner accepted the Summer introduction on 2026-10-13 after reviewing the preview. New campaigns and both restart choices in `/fjord-play` now select `summer-800-v1` by default. On a browser with an active campaign, opening the route preserves that campaign: use **Menu → Campaign → New campaign from seed** for a fresh Summer landing. The earlier `?start=summer` review link remains usable but is no longer required.

## Canonical contract

An explicit `summer-800-v1` founding phase initializes the player and every independent CPU target clan directly at `{ winter: 800, tick: 500 }`. The existing calendar projects this as **Summer 800**. There is no hidden `AdvanceTicks`, extra production, work progress, RNG draw, birthday or annual outcome before arrival. Player stocks begin at **15 Food and 5 Materials**, with the existing longship and two adult cows plus one adult bull. CPU starting stocks retain their own existing rules.

Founder DNA, names, ages and birth winters remain seed-identical. Initial occupation-history start ticks are offset to the founding phase so the same seeded career experience does not acquire an unplayed half-year. Initial arrival, founding partnership and weather events and the opening Clan Book checkpoint all use tick 500. Commands issued at arrival use that same canonical time.

The first annual boundary at 801:0 occurs after **500 played ticks**. Production accrues for those 500 ticks; annual consumption, mortality/exposure, upkeep, births and weather resolution retain their full existing rules. Every later year lasts 1,000 ticks. The 1/3/5-minute choices therefore reach the first boundary after 30/90/150 seconds of active play. **+1 Year** retains its existing full 1,000-tick behavior (800:500 → 801:500); it is not a next-boundary button.

## Save and entry-point behavior

The phase is an optional versioned Core field. The default headless factory, standalone Gameplay Lab and fresh 2D campaign remain at 800:0. Existing saves without this field retain that baseline; unknown explicit phases are rejected. Import/load never replaces a saved clock with the default founding phase. The current phase survives save/load, explicit 2D ↔ 3D transfer and saved-rule restarts. A new game created in a Summer session retains its selected phase.

Fjord new/restart creation passes the explicit phase through the shared session factory. Loading an old campaign leaves it untouched; a subsequent explicit Fjord New/Restart action uses Summer. Geography selection, island recipes and historical worlds are unchanged.

## Scene and narrative

The normal seasonal projection supplies lighting, ground, foliage, structures and water at the first ready frame. Seasonal snow is absent at tick 500; the separate climate snow-retention study is unchanged. Loading contributes no simulated time, and the existing auto-start runs only after scene readiness. The annual weather panel is labelled **Year 800 · … annual weather**, distinguishing its saved annual rule from the seasonal HUD.

The frozen opening records a source-backed Summer arrival. The first five-Winter checkpoint is still 805:0, but its observed interval is 4.5 years (800:500 → 805:0). Its complete factual ledger reconciles that shorter interval; quiet prose does not call it five full elapsed years. Later chapter timing and “winters old” ages remain unchanged. Existing published books are not rewritten.

This updates #32's historical Winter-start baseline only for new Fjord campaigns. It does not change the authoritative clock, economy or lifecycle rules.

## Dependency on #153

The cinematic top-down loading sequence and camera flight in #153 have not been implemented. This slice establishes the canonical phase and verifies the existing loading/first-scene path. #153 must consume this actual saved phase for preview and arrival, retain the loading pause, and reveal no hidden CPU settlement details. No claim of cinematic acceptance is made here.

See [first-boundary measurements and browser review](qa/summer-founding/report.md). Default activation has owner approval; balance changes still require separate acceptance; historical reports retain their original settings.
