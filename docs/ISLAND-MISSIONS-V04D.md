# Spatial Recon, Surveillance and Pillage v0.4D (#150)

Physical island campaigns use the existing expedition groups and canonical land routes. The four-direction Region graph remains the compatibility adapter for older campaigns; physical targets are versioned world/site references, not extra Region slots.

## Separate missions from home

A free group with living, eligible members can leave home on Recon, Surveillance or Pillage. An active Explore expedition cannot change into one of these missions. Its members must return first. Membership, childcare exclusion, away work/consumption, weather, mission success, casualties and carrying capacity reuse the existing Core rules.

| Mission | Normal duration | Normal Food per member | Success | Casualty risk per member |
| --- | ---: | ---: | ---: | ---: |
| Recon | 250 ticks | 2 | 80% | 2% |
| Surveillance | 400 ticks | 4 | 90% | 3% |
| Pillage | 500 ticks | 5 | 60% | 10% |

The existing weather multiplier extends duration and provisions, and adds its travel risk. Movement is the existing 2 metres per canonical tick divided by that travel-duration multiplier. Departure snapshots the resulting terms. Every member follows their own actual departure route and returns to their exact origin. The longest outward and return journeys plus at least one operation tick must fit the mission duration; otherwise departure is refused atomically. There is no teleport, route-priced extra Food, extra carrying capacity or maritime shortcut.

New physical mission orders use the same bounded eight-direction routing as fixed-pack Explore, with actual diagonal distances and no blocked-corner cutting. Existing saved mission routes retain their recorded geometry. The weather-adjusted speed and operation duration are unchanged.

The player reviews the actual Food total before confirming. Cancel in the dialog changes nothing. Confirm spends Food once; early return does not refund it. Recall walks back along the reached trail, including partial edges, and cancels the operation. Existing casualty/success resolution runs at actual homecoming, including recalled journeys; an incomplete operation grants no discoveries or recovered assets. A newly blocked outward step triggers a safe return; an impassable return is explicitly Stranded, without an invented homecoming or loot.

While any physical mission is active the existing Expedition Mode pacing applies: 10 minutes per 1,000 ticks, +1 Year disabled, normal pause available. The prior user pace resumes after the last mission. No hidden-tab catch-up or renderer-driven progress is added.

## Evidence and knowledge

- Recon can target already mapped land. Unknown terrain cannot disclose a site through a mission offer.
- Confirmed explorer positions and existing terrain LOS can create a saved, dated **unidentified settlement** marker. Walking does not identify the clan, reveal stocks, or grant Surveyed knowledge.
- A successful completed Recon identifies a settlement only if that party could observe it from its operation position. It publishes Scouted knowledge after returning home.
- **Surveillance requires a CPU clan identified by a returned successful Recon**, not merely a mapped cell or a sighted marker. It updates the same dated knowledge to Surveyed. Pillage requires an observed viable opportunity; Surveillance is optional before Pillage.
- Observations are taken at the completed on-site operation, not refreshed from remote state on return. A later Recon preserves an existing Surveyed level. Failed or cancelled missions never replace previous knowledge.
- Reports reference their canonical visit and return event IDs. The player receives coarse observations and actual outcome totals, never live remote stocks, names of unobserved people, traits or motives. Local terrain labels reuse the blueprint biome field when available; no second classifier or resource potential is invented.
- Visible rival actors are filtered by their own discovery cells. A directly observed tent or resident can appear even when the settlement's exact centre is unseen; that centre remains undisclosed until its own cell is known. Mapped ground alone does not refresh live actors or enemy information.
- Actual Pillage resolution reuses the existing one-category-per-survivor carrying rules: up to 10 Food, 5 Materials, one actual animal or one actual person, following the checked priority order. No assets are created for the report. Actual identities, ancestry archives and pending births use the established transfer contract. As in legacy missions, recovery debits the target's actual state at homecoming; intervening changes can exhaust an observed opportunity.

## Save contract and UI

The returned Pillage report lists actual recovered livestock and opens each
animal's card. Current species, age-appropriate role and breeding-age status
are separate from the immutable identity recorded at return. Capture history
and real Farmyard assignment remain available on the card. A report with no
livestock says so without inventing a reason. Loot uses the first living animal
in sorted-ID order; it does not target a breeding sex or age. Donor ownership
and simulation continue until return. See [#220 integration evidence](qa/livestock-integration-220/report.md).

`world.spatial.version = 3` composes an optional version-1 mission task into the existing saved movement record. `world.islandIntel.version = 1` stores only site sighting/report evidence and dated knowledge. Core does not duplicate the heightfield, invent a target clan, or mutate the four legacy Region slots. Existing version-1/2 spatial journeys and old regional missions retain their saved behavior.

Expeditions contains the reused group selector, **Recon mapped area**, and known settlement actions. Tap a known gold site ring in the 3D scene to open its actions; drag/pinch remain navigation outside explicit targeting. Tapping mapped land during Recon targeting opens the cost confirmation. Separate missions cannot receive Explore redirects; Return home remains available. Results appear after actual homecoming and also feed existing Chronicle/Clan Book resource accounting.

Known places explains why the selected group cannot depart: an away group must return first, or the player can choose another eligible group at home. **Return group home** is available beside that explanation for an active trip. Returning groups show a homecoming reminder. Sighted settlements explain that Surveillance and Pillage require a successful Recon to return home; disabled actions retain the reason in their title.

Validation and measurements are recorded in [the QA report](qa/island-missions/report.md). Browser touch emulation is not a physical iPad test.
