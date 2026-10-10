# Fjord visual lifecycle and weather v0.5C

Issue: #89. Extends the shared interactive settlement from #88.

## Canonical authority

The Fjord presents the existing Simulation Core. Births, deaths, cattle stages, shelter,
occupations, building levels, stocks and annual weather all come from canonical inspection
and commands. Presentation adds no RNG, lifecycle/economy rules or save schema changes.

## Residents and cattle

Present living residents receive one static existing Human_LOD2 instance. Canonical age uses
birthWinter, never the age stored in the original DNA. Presentation scale grows linearly
from 40% at birth to 100% at 16 Winters (70% at eight). The same model instance and position
remain during growth. This is uniform scale, not anatomical morphing or an outfit system.

Cattle reuse baby, young-adult, adult-female and adult-male source assets, selected by the
Core's configured age stages and sex. Render descriptions retain actual age, parents,
Farmyard assignment, shelter and overcrowding. Death and slaughter remove active instances;
the shared management panel retains history and ancestry. Dead residents/animals release
outdoor reservations without moving surviving instances. Empty tent plots and obsolete
assignment points also release their presentation reservations; empty physical buildings remain.
Residents away on expeditions remain canonical but correctly have no local render instance.

Building level mappings and active Farmyard source yards remain those of v0.5A/B. Empty
physical buildings remain visible while they exist in Core. Salvage/collapse removes them.
Tents retain grass; permanent homes create soil and safe connecting paths. Source fallback
limits remain explicit: static shared humans, FarmHut yard at FarmHomestead level, a yard
marker for higher levels, and metric placeholders when a model is unavailable.

## Weather presentation

Mild uses warmer/clearer lighting; Normal retains the existing day baseline. Harsh uses
cooler lighting, closer fog and 35% of the existing winter material treatment. Severe uses
darker lighting, closer-starting fog and the full winter treatment. The outer mist cutoff
leaves silhouettes visible from the starting camera, with deliberately strong mist during bad
weather. Weather disabled restores the Normal baseline with no snow treatment. These are presentation presets, not weather rolls
or a new seasonal clock. WorldLighting and SeasonTint are reused, including the existing
snow uniform; water receives the same actual lighting and camera as the environment.

The Winter forecast displays the actual production/consumption modifiers and exposed
resident/cattle counts. Shelter warnings follow configured exposure mortality. Visual
weather never supersedes these factual Core values.

## Resident and cow production feedback

New ResourceProduced events supply resident ID, resource and exact integer units. Existing
CattleFoodProduced events supply the producing cow ID and exact Food units. Only eligible
adult female cattle produce according to Core; bulls and calves never receive production
feedback. A short world-anchored English label shows only +N Food or +N Materials, without
a name. Food and Materials have distinct muted colors. Work progress alone, consumption,
loot and slaughter/salvage never create a production popup.

Normal ticking displays +1 when one integer unit is awarded. A Winter jump displays the
exact +N awarded during that batch. Batches aggregate by producer kind, identity and resource.
At most six labels display concurrently; additional
awards queue or merge without losing attribution or units. Labels drift upward by 36 screen
pixels and gradually fade from full opacity to zero over 2.8 seconds of real time. Each label
retains its actual resident/cow identity and world anchor; nearby labels separate vertically. The latest known producer anchor remains
available when that producer dies in a large command batch. If no model anchor ever existed,
the factual output appears at the canvas edge instead of fabricating a living model.

A new page, explicit load/import/restart and a 2D/3D handoff establish a new event baseline.
Old resident/cow production history does not replay. Pause stops simulation production while existing visual effects
may finish fading. The production cursor, pending effects and diagnostic totals are ephemeral
and never become canonical save data. The selected resident's aptitude/productivity remains
in the shared management panel.

## Verification

Approved seams: public Core production events/Fjord projection, and browser lifecycle,
weather and production interaction. The multi-Winter run compares each actual rendered ID
and cattle stage to Core, plus separate cumulative resident and cow awards against factual events.

Evidence and reproduction commands: [visual lifecycle QA](qa/fjord-lifecycle/report.md).
Physical iPad Safari remains a separate check from Chromium touch/tablet emulation.
