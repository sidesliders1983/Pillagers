# Individual Persona birthdays — #171

Status: delivery planning, exact childcare timing and public test boundaries approved by the owner. Implementation is opt-in pending the visual/performance review. The review opt-in is /fjord-play?birthdays=individual-v1, on a new campaign/browser session.

Base: main at a20bac1. The existing per-person fitting reuse from #170 is already present; its measured gains must not be credited to this calendar change.

## Canonical age

New calendar-enabled campaigns store an optional versioned lifecycle extension and an integer birthTick on each newly created Persona. A founder's date comes from a separate named identity stream, without advancing the founder/name/economy RNG. Collisions are valid and resolved in stable identity order.

Age means completed years at the current canonical time. For a founder aged 30 at Summer 800:500, a birthday at tick 250 means birthWinter 770; a birthday at 750 means birthWinter 769. These are literal historical birth years, chosen to preserve the generated initial age. CharacterDNA.age remains its initial generated identity value; presentation obtains the current age from the shared canonical function.

Death retains the existing deathWinter plus an optional exact deathTick for the new mode. Historical ages stop at that date. Family Tree departure cards use the full existing transfer-event timestamp, rather than only its year. Old narrative passages and event timestamps are never rewritten.

## Approved birth lifecycle

The existing yearly eligibility checks and fertility probability run once at tick 0, in their existing annual position. A success creates a saved pending delivery, not a living child or a ChildBorn event. The plan retains the parents and sampled child genetics, including dominant-legacy choices, and chooses a delivery tick from 1 through 999 using a separate named deterministic stream. Delivery creates the actual Persona at the actual current time and emits ChildBorn there; the stored birthTick matches that event exactly.

Food is checked at annual selection, as currently. A selected birth is not rolled again or silently dropped if stocks subsequently fall. A missing/dead mother cancels the pending delivery with an explicit factual record. Father's death, changed partnership or departure does not erase established parentage; required historical identity remains available. An away mother waits until she returns, and her child's birthday is the real deferred delivery date. A permanent maternal clan transfer carries the plan and required parent identities into the receiving clan. A moved household receives the child in the mother's current household.

Only the real delivery starts childcare and updates lastBirthWinter. Pending plans prevent another simultaneous scheduled birth for the same mother. Planned status must not be narrated as conception or childbirth, nor appear as a living Family Tree node.

## Childcare correction

The existing rules permit a mother to have another child after her saved cooldown even while providing care for an earlier child. They exclude assigned helpers and helpers who worked during the relevant annual interval. Preserve this policy; do not add a new requirement that maternal care must finish before fertility can resume.

Approved new-mode care ends after the configured number of complete years from delivery, at the same within-year tick. Existing saved childcareUntilWinter endpoints retain their old tick-0 meaning. Release/transfer of care preserves the remaining exact endpoint. Birth cooldown continues to count the existing complete blocked Winters and annual opportunities; no extra midyear fertility decisions are introduced.

## Tick engine and presentation

Annual economics, food/livestock consumption, mortality rolls, weather, career review, partnership review and five-Winter Saga publication stay at their existing annual boundaries. Each consults the canonical completed age at its execution time. Birthdays change immediate eligibility/productivity and visual age; they do not trigger extra mortality, career or partnership rolls.

Age is derived by the existing per-person queries, without mutating CharacterDNA.age or scanning the population separately for birthdays. No extra full-state clone is introduced for a birthday tick. Pending deliveries and exact care expiries are bounded due work. Process every crossed time in stable order, whether stepping individually, in mixed batches, across years or in CPU target clans.

FjordProjection already derives current visual DNA through personaAge. FjordModels.reconcile already fingerprints DNA; retain this to avoid new refits on unchanged ages. FamilyTreeIndex refreshes on the next real birthday; the remaining direct year-subtraction readers now use the shared age query (social event facts, expedition member UI and archived Family Tree cards).

## Compatibility and rollout

No schemaVersion bump and no migration/backfill of old Alpha saves. Missing calendar extension uses the legacy annual birth/age rules; old identities without birthTick retain tick-0 birthdays. New independent CPU clans follow the explicitly selected player calendar mode, with their own seed stream. New/restart retains the explicit mode; importing a legacy save does not opt it in.

Implement opt-in review activation first, then request the issue's required owner review before making it the new-campaign default. Existing campaigns keep their own mode and dates.

## Validation contract and evidence

Approved public seams: Simulation Core commands and canonical age projection; serialize/reconstruct and campaign restart; real CPU-clan progression and transfer; Fjord/browser presentation; repeatable Core and wardrobe measurements.

Work vertically after seam approval: preserve founder identities/initial ages; exact birthday boundaries and collisions; saved scheduled delivery; cancellation/transfer/care; mixed-step equivalence; historical age and UI; measurements and visual acceptance.

Use worked boundary examples and real commands. Cover missing/invalid optional fields, death before a birthday, fifth-birthday outdoor visibility, work/adult thresholds, greying after 45, and pending saves. Compare 1, 3, 500, 1,000 and multi-year advances with consecutive single ticks, including the Summer start and CPU clans. Round-trip legacy saves without adding fields.

Profile 10, 25, 50 and a larger population, with multiple CPU clans, reporting total year CPU and per-command/tick distributions. For fitting, use the retained real-house boundary/developed fixtures, same owned assets and GPU/graphics settings, and all three year speeds. Separate cached-main baseline, individual birthday spreading, and any forced-original-refit diagnostic; never double-credit #170. Report actual applied age changes, model refits, total fitting CPU, worst frames and retained resources. Preserve the historical 1.64–1.90 second report as historical evidence.

Complete build, character validation, relevant/full regression suite and current-head CI. Keep the PR draft while any required check is pending or failing, and while owner acceptance required by the issue remains outstanding.

Implementation and measured limitations: [owner review and numeric report](qa/persona-birthdays/report.md). The short-batch Core timing is approximately flat, but the single-1,000-tick no-overhead criterion is not proven. Individual dates remain opt-in pending owner visual/performance review.
