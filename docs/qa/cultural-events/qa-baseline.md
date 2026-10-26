# Cultural events: QA baseline and verification gates

Date: 2026-10-26. Authoritative baseline: `fb327996013b115bff985f7f87b7a69ff37eb24f`.
Branch/worktree: `codex/social-cultural-events-274`,
`D:/CodexSites/Pillagers/scratch/social-cultural-events-274`.
Node: v24.19.0. This is an initial audit, not cultural feature acceptance.

## Executed baseline

```text
node --test tests/mortality.test.mjs tests/weather.test.mjs tests/personality-life-events.test.mjs tests/resident-social.test.mjs
```

Result: **45 passed, 0 failed, 0 cancelled, 0 skipped** in 8,175.8046 ms.
Raw command output: `scratch/culture-qa/baseline-tests.txt`.
No new tests or runtime changes were made for this audit. User confirmation of the
new TDD seams is pending; existing tests establish baseline behaviour only.

The executed suites cover original death/kinship cleanup, real care and away
eligibility, legacy weather/RNG migration, outgoing-weather resolution, cattle
and resident exposure, split/batch/save/rollback social continuation, and
presentational encounter movement. They do not prove cultural sponsorship,
cohesion, new assets, browser usability or device performance.

## Initial requirement-to-evidence matrix (pre-implementation snapshot)

| Requirement | Existing authority / evidence to collect | Current cultural status |
| --- | --- | --- |
| #275 optional paid command | Public `applyCommand`; real quoted Food debit, one semantic event/contribution, no Materials/fire fuel change; duplicate request, conflict, insufficient stock and stale quote cases | Not implemented or tested |
| Real attendance | Public offer and committed `EventFacts` snapshots; alive/available adults, caregiver and actual expedition exclusions; duplicated names retain distinct IDs | Existing eligibility helpers audited; cultural use unverified |
| Compact saved state | Public serialize/reconstruct, finite cap, valid source/sequence references, malformed saves rejected; absent legacy state remains absent | Design proposal only |
| #276 real weather consequence | Actual annual settlement mortality using outgoing saved weather; reduce only exposure, preserve natural risk and existing roll | Existing baseline passes; cultural consequence unimplemented |
| Baseline/legacy parity | Disabled or absent culture must preserve existing complete outcomes/RNG; opening UI, Lore, audio or animations cannot award support | New parity evidence required |
| CPU independence | Own clan sponsorship never modifies another clan; a CPU gets no free state; equivalent earned state uses same resolver | New world/save evidence required |
| Factual history | Chronicle, Attention, Personal History and immutable already-published Clan Book chapters; actual IDs, time, paid cost and event-time people | Existing mappers require cultural integration |
| Fjord journey | Campfire context, review/decline/commit/readback; visible costs/reasons, recoverable rejection, no forced pause, camera and touch | Design audit only; browser verification unavailable |
| Canonical/media separation | Headless outcomes identical with missing/offscreen/reduced animation/audio; unavailable/dead actors cannot be staged later | New public projector/lifecycle evidence required |
| Meshy motion | Actual task journal plus downloaded hashes, compatible native rig, lazy shared clip-only runtime load; no eager body/texture or actor copies | Two generated FBXs staged; runtime compatibility/visual acceptance pending |
| ElevenLabs audio | Actual generation receipt and prepared hashes, listening and lifecycle evidence; one spatial group source inside existing budgets | Credential setup pending; no new SFX generated |
| Lighting | Actual fuel-gated existing light/halo, no free ignition or snow melt, no new light/shadow/render pass | Audit recommends unchanged existing lighting |
| Performance | Same-world/camera/DPR/quality baseline versus gathering, cold/warm/repeated start-end and replacement resource counts; real frame/GPU evidence where supported | Budgets proposed; no browser/device measurements |
| #277 occasion variants | Existing partnership/source and one celebration; generic ceremony reuses the shared transaction and benefit without invented faith | Follow-on work, not first-slice acceptance |
| #278 loss support | Actual committed collapse/displacement source, tied eligible helper, bounded attempt/accepted distinction and real consequence | Follow-on work; numerical consequence not approved |
| #279 defence | A real defender/attack resolver, then calibrated own-clan modifier | Prerequisite absent in audited simulation flow; do not add an offensive Pillage bonus |
| #280 arrivals/integration | Existing real Persona transfer plus separately approved narrow integration rule, after first culture path is accepted | Transfers exist; integration design/benefit remains gated |

## Audited Core boundaries and traps

- `SimulationCore.ts:201` validates the input, clones before command mutation and
  validates the result. Test atomic rejection through this public boundary, not
  by directly invoking a private transaction helper.
- `Mortality.ts:27` currently combines natural age-band risk with weather
  exposure. `Mechanics.ts:145-179` resolves outgoing mortality before selecting
  new weather. Snapshot the support eligibility before death cleanup; do not
  accidentally read the incoming Winter or spend multiple credits per person.
- `WorldExpeditions.ts:153` also resolves crew mortality. A settlement-only
  cohesion modifier must not change mission-return natural mortality, mission
  success, casualties or offensive Pillage rules.
- `EventFacts.ts:18` freezes actual participant IDs/names/ages. Historical
  attendance must remain readable after death, departure or changed names; save
  validation must distinguish historical snapshots from currently eligible actors.
- A zero-support baseline must not get a penalty. Cap/consumption validation must
  prevent negative stocks, stacked strength, fabricated receipts and save/load
  replenishment. Reject or clearly disclose a paid action with zero contribution.
- Duplicate replay needs a stable command/receipt identity. A repeated accepted
  request must not be reinterpreted as a new event after eligibility, stock or
  current weather has changed. A conflicting request must not share the receipt.
- The public offer should be read-only: repeated UI refresh, `canApplyCommand`,
  history reading and renderer frames cannot advance Core RNG or event sequence.
- Proposed rules (3 Food, 3-8 adults, two banked assessments, 25% exposure-only
  reduction) are **not yet owner-approved defaults**. The Harsh exposure change
  50 to 38 basis points is only 0.12 percentage points of absolute risk; Severe
  200 to 150 is 0.50 points. Relative exposure reduction is not a 25% reduction
  in total mortality, and mechanical effect is not evidence of player enjoyment.
- Clarify before tests whether support is consumed when all exposed residents
  already face clamped/guaranteed natural mortality, whether a saved quote freezes
  participant IDs or only revalidates eligibility, and the exact at-cap behaviour.

## Bounded calibration proposal (not executed)

Freeze version/config/policy/seed lists before measurement. Record the actual
source commit plus source, rule, policy and runner hashes. Do not select seeds
because they demonstrate a desired death or generate replacement event history.

1. **Controlled one-boundary comparisons:** use real public campaign/Core
   creation, weather configuration and paid sponsorship commands. A forced
   Harsh/Severe fixture is explicitly a controlled fixture, not an ordinary
   campaign observation. Compare no support, one paid gathering and two paid
   gatherings with the same saved outgoing weather, shelter, natural age risk,
   participant set and starting RNG. Use predeclared sequential seeds; start
   with 100 per adverse class, expand to 1,000 only if the mortality interval is
   too weak to interpret. Retain all seeds. Do not fabricate event seeds or
   mutate the campaign into a claimed real run. Record risk inputs as well as
   actual deaths, stock paid, support use and complete post-boundary hashes.
2. **Complete-strategy cohorts:** proposed first budget is seeds 1-32, ten
   Winters, three arms (96 campaigns): no sponsorship, one contribution when
   the bank is empty, and refill-to-cap. Use the same frozen domestic policy
   and a disclosed common Food reserve threshold; owner review should settle
   that threshold before execution. Every command remains valid or records its
   actual rejection. Do not inject Food, hide shortages or drop extinct clans.
3. Record annual population, Food/Materials, shortages, shelter/exposure,
   weather sequence, sponsorship opportunities/attempts/costs/participants,
   assessments consumed and expiry/cap state. Preserve per-seed paired deltas,
   both clans, failures and technical completeness. Report uncertainty and the
   share of runs without an eligible/affordable useful occasion.
4. Equal seeds do not promise equal multi-year realized weather. Preventing a
   death can alter later family/RNG consumption. Report those traces and treat
   multi-year outcomes as complete strategies; do not install a new weather RNG
   stream or call the difference an isolated biological coefficient effect.
5. Require literal single-boundary expectations (proposed Harsh 50 to 38,
   Severe 200 to 150; natural risk unchanged), finite consumption and replay
   tests. Do not assert only that a formula equals itself or substitute expected
   theoretical deaths for actually executed Core outcomes.

Runs should be resumable per seed/arm with bounded output, explicit complete /
technical-failure / resource-limited status and no unbounded long-run expansion.
Publish full adverse outcomes, not only a favourable example.

## Later-slice gate evidence

`rg -n -i 'defen|attack|aggress' src/simulation` returned no matches (exit 1).
This search alone is not the dependency audit: current `WorldExpeditions.ts:24`
contains Recon/Surveillance/Pillage mission types, `:139-147` steps each target's
ordinary mechanics then resolves the player's scheduled missions, and target
validation (`:93`) prohibits nested target worlds. `IslandClans.ts` binds and
validates the rival site but adds no attack/defender resolution. No current
settlement-defence authority was found in these owning flows; #279 stays gated.

Actual Persona arrival already exists in `WorldExpeditions.ts:220-247`: the
transfer preserves the person/work record, archives lineage, creates an arrival
household and records `PersonaTransferredOut` / `PersonaTransferredIn`.
#280 is therefore not blocked on inventing a capture route; it is gated on the
accepted initial culture path and an approved narrow integration effect. A
captured person's attendance must not silently assert allegiance or loyalty.

## Verification limits

The available browser inventory contained no browsers and in-app creation was
reported unavailable. No substitute browser automation was installed or used.
This audit claims no rendered scene, audio listening, mobile layout, iPhone/iPad
memory, sustained frame rate or new-asset visual acceptance. Those remain
explicit later gates rather than inferred passes from headless tests.

## Subsequent owner decisions

After this baseline audit, the owner accepted the 3-Food, 3–8-adult, two-assessment,
25%-exposure-only coefficients as experimental values. This does not authorize ordinary
default activation before calibration and review. TDD seam confirmation is still pending.
The connected ElevenLabs Creative Flow route was subsequently verified to support SFX;
the initial separate-key gate is withdrawn. No sound generation is claimed by this baseline.

## Implementation and calibration continuation

The earlier sections are the original pre-implementation audit, not a claim about
current delivery. The owner subsequently confirmed the public TDD boundaries and
experimental coefficients. The current headless evidence is in
[calibration-report.md](calibration-report.md) and its linked frozen protocol,
manifest, summary and lossless raw delivery files.

- Executed 6,000 controlled one-boundary cases and 96 ten-year strategy campaigns,
  retaining every predeclared seed and adverse outcome; no technical failures.
- All 64 frozen dependency/config/runner byte identities remained unchanged.
- Food/Materials accounting, finite support accounting, CPU isolation, source-event
  continuity, canonical save roundtrips and a representative deterministic repeat passed.
- One added public calibration regression was red before the runner existed and is
  now green: actual 0/3/6 Food payments, identical one/two-support risk strength,
  a real seeded mortality difference and deterministic repeated output.
- A completed-case resume was executed: 600 initial jobs were recognized, zero rerun,
  and the complete raw hashes remained unchanged.
- Compact delivery is 2.56 MiB gzip versus 80,956,471 expanded raw bytes. Original
  plain JSONL remains on D:; gzip expansion identities were independently verified.

The controlled effect is measurable, but the 32-seed strategy interval includes
zero and heavy sponsorship mostly leaves extra support unused. Keep prototype
labelling and ordinary defaults unchanged pending owner playtesting/calibration.
No headless result proves browser, listening, touch, physical-device performance
or entertainment acceptance. #277/#278 and the #279/#280 prerequisite gates remain
part of the full epic, outside this first benefit-path measurement.
