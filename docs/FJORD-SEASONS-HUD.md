# Fjord calendar seasons and compact header

Issue: [#109](https://github.com/sidesliders1983/Pillagers/issues/109).

## One canonical clock

FjordCalendar projects the existing Simulation Core time; it stores no state. With the
current 1,000 ticks per year, the date shows Winter at 0–249, Spring at 250–499, Summer
at 500–749 and Autumn at 750–999. Rollover starts Winter of the next year. Labels change
exactly at quarter boundaries. Northern Winter holds its full palette through tick 250.
Thaw starts after Spring begins: Winter → Spring during ticks 250–375, then Spring →
Summer during ticks 375–500. Summer/Autumn blends retain their original timing. These
visual phases are derived from the same saved tick; there is no second clock.

The label **Year length** offers 1, 3 or 5 **min per year**. **+1 Year** submits the existing
AdvanceWinter command. It advances one full year while preserving a partial tick, so
Spring 800 at tick 430 becomes Spring 801 at tick 430. Age remains expressed in Winters;
annual weather, economy, maintenance, mortality, cattle and fertility retain their existing
resolution. Seasons create no Core event or RNG draw. Save schemas and Chronicle remain unchanged.

The header and renderer receive the same normalized saved progress. Refresh caches it;
render frames do not snapshot or project Core again to determine a season. Pausing or
hiding a tab freezes canonical progress. Water/wind can retain their existing animation
clock without advancing calendar seasons. Import/load restore the saved season paused;
new/restart campaigns begin in Winter and use the existing scene-loading/autostart guards.
The shared 2D/3D session handoff retains season, selection, pacing and exact geography.

## Existing visual systems reused

| Existing source | Use in canonical Fjord |
| --- | --- |
| timeVisualization seasonBlend/seasonPresets | Winter-first quarter mapping and smooth Spring/Summer/Autumn/Winter palettes |
| WorldLighting seasonal mode | Seasonal sky, fog colour, sun colour/intensity and ambient intensity |
| SeasonTint | Existing ground/foliage multiplication and snow uniform; generated terrain's sand/rock/path child layers included |
| FjordWeather | Annual weather lighting delta composed onto the seasonal baseline |
| SharedSettlement/GameplaySession | Sole time ownership, commands, pace, visibility, load and handoff |
| Existing Fjord header/campaign action IDs | Stable controls with revised grouping and English year labels |

Annual weather changes lighting in proportion to the existing palette's Winter blend weight.
Colour deltas are applied in linear space relative to the approved day baseline, clamped to
valid colour channels. Sun/ambient intensity ratios and fog/exposure differences use the
same weight. This preserves darker Harsh/Severe weather without replacing the season palette.

Winter and the start of Spring retain the full winter weather adjustment. It fades during
the first half of Spring; by tick 375 Spring/Summer retain their seasonal baseline.
Autumn approaches Winter again. Snow
uses the original seasonal amount: Winter weight × 0.65. Weather severity does not add a
second snow layer. Disabling annual weather still shows all seasons and winter snow. The
weather information panel continues to show factual annual modifiers, including during
Spring/Summer; only presentation is seasonal. The same composed light reaches water.

Canonical houses (including Farmyard terrain and props), tents and the settlement campfire
also follow this snow amount. The existing native standard materials receive a world-up
surface mask: roofs, tent slopes, ground and upper stone/log surfaces gather snow; vertical
walls and downward faces retain their source texture colours. This is a colour overlay,
not simulated snow depth. The campfire spike adds a local visual heat multiplier and particle
flames: lit fires thaw over three active seconds; extinguished fires regain the seasonal
amount over six. Pausing freezes this transition; imported burning fires begin thawed. Residents, cattle and the longship are
excluded. Ordinary seasonal lighting continues to reach every model.

Each static instance owns its seasonal material copies while sharing the original textures
and geometry. Building, upgrading, Farmyard conversion and returning to a tent apply the
current season immediately, even while paused. Replacement/disposal restores the source
bindings and releases the seasonal copies. The same northern Spring thaw, weather-off
behaviour and canonical clock apply; Core state and saved assets are unchanged.

The original seasonal treatment adds no assets, dependencies or shadow allocation. The later
[campfire VFX spike](CAMPFIRE-VFX-SPIKE.md) adds its documented particle library. Tint materials
and light sources are reused between ticks/quarters. Explicit scene/quality changes retain their
existing resource ownership and disposal. Environment Lab and the prototype's manual
season/day-night modes continue to work independently of the canonical Fjord calendar.

## Stable HUD and menu

The date has separate fixed season/year slots at left. Four fixed KPI columns show Food,
Materials, all living residents (including indoors/away) and living cattle. Timing sits at right.
The desktop side columns are symmetric so the KPI group is centred; the text lengths of
seasons and counters do not reposition it.

At widths up to 1,100px, date and timing form a row above the KPI row. On narrow phones
up to 600px, the same Year length control moves into Menu; it is not duplicated or recreated.
Long counters wrap inside fixed KPI columns instead of overlapping neighbouring controls.
The canvas fills the remaining viewport. Safe-area insets are respected.

**+1 Year** sits in the top timing controls, after Year length and before Menu. At widths
up to 360px, timing gets its own row so the fixed calendar slots do not overlap the buttons.

**Menu** contains Year length on narrow phones, Quality, screen-awake preference,
view navigation and the existing Campaign save/load/export/import/new/restart controls.
It scrolls within the viewport. The main header shows no raw tick fraction; exact canonical
Winter/tick/scale remain in Developer diagnostics and the public canvas `data-time` description.
The public `data-calendar`, `data-weather` and `data-season-materials` descriptions support QA.
Menu fields remain mounted through clock refreshes. Header keyboard input cannot pan the
camera; Escape closes Menu and returns focus. Outside tapping closes it without swallowing
world input. Header buttons/selects/summaries use at least 44px height. The existing ▲/▼
management collapse and selection-driven reopen remain below the header.

The in-flight Lore #103/#106 work is separate: Clan Chronicle remains in management, and
this change does not substitute a new Clan Book implementation or history schema.

## Validation

Approved seams are the public canonical Fjord projection/shared session and browser rendering
and interaction. [QA evidence](qa/fjord-seasons-hud/report.md) records exact boundaries,
weather combinations, layout bounds, save/load/replay, touch and startup regressions.
Historical reports remain records of the rules and UI they originally measured.

Northern thaw correction evidence: [browser report](qa/fjord-season-thaw/report.md).
The original seasons/HUD report remains a record of the earlier transition timing.

## Falling precipitation

The Fjord now adds calendar-driven snow in Winter and rain in Autumn through the shared
Local effects setting. See [seasonal precipitation](FJORD-SEASONAL-PRECIPITATION.md) for
quality limits, accessibility, transitions and the distinction from economic weather rules.
