# Cultural occasion journey (#277)

This extends the accepted campfire gathering prototype from #275/#276 on a separate
`codex/cultural-occasions-277` branch. It does not activate ordinary campaign defaults
or modify the first prototype served on LAN port 5180.

## Player journey

| Player intent | Existing surface and visible choice | Canonical boundary |
| --- | --- | --- |
| Inspect community life | Select the settlement campfire. The culture section stays below the existing Light/Extinguish campfire controls. | Lighting fuel and cultural Food remain separate commands. |
| Choose an occasion | One Occasion select offers Storytelling & music, Communal ceremony and Wedding celebration. | Selection only changes the local view. All use the same Core culture transaction and support reserve. |
| Find a wedding occasion | Wedding reveals one Couple select containing actual recent partnership sources and real names. | Only new PartnershipFormed sources within one game year qualify. Founding partnerships are excluded. |
| Understand the occasion | The wedding card explains that the partnership already exists and links to its recorded source. | Reading the partnership does not recreate it, change its date or spend Food. |
| Consider sponsorship | Support gathering opens the existing compact in-card review with the selected occasion, real current roster and explicit 3 Food quote. | No modal, forced pause, extra HUD row or automatic annual prompt. |
| Decline | Not now, Escape or closing the card preserves the campaign and partnership. | No command, spending or penalty. |
| Sponsor | Sponsor commits the reviewed occasion, expected sequence, Food quote, attendance and wedding source ID through the existing session command queue. | Core revalidates eligibility atomically. The UI cannot choose different spouses or forge a source. |
| Observe/read | Accepted sponsorship reports the actual occasion and links to the real cultural event in Activity Center. | Shared CulturalGatheringHeld facts retain the real source, participants and cost. Existing partnership facts remain unchanged. |

## Wedding window and unavailable states

The owner selected the half-open interval from the new PartnershipFormed tick until
one complete game year later: `[source tick, source tick + ticksPerWinter)`. This is
an optional celebration window, not a partnership expiry or relationship penalty.

The public Core candidate projection controls availability. An absent, caring,
deceased or no-longer-current partner cannot be invented as an attendee. The review
shows changed availability and disables a stale quote. Reaching the one-year limit
or celebrating that source once disables another purchase; the partnership remains.
No founding couple is re-dated to create a wedding opportunity.

The Food cost, minimum/maximum actual attendance, two banked supports and the narrow
weather-exposure consequence remain the existing experimental configuration. There
is no ceremony-specific buff, new faith stock, fertility bonus, wedding purchase of
love, god, priesthood or invented ritual. A communal ceremony needs no partnership.

## Presentation and accessibility

The existing keyboard/touch card is reused, including safe-area bounds and 44px
controls. Couple names use the generated cultural spelling and HTML escaping. Names
are not shortened to invented bride/groom roles. Long labels stay in full-width
native selects rather than a new overlay. The separate review retains Sponsor and
Not now. Pending work is visible and rejection settles back to a usable review.

Only the selected partnership is submitted. A completed celebration does not
silently select another couple for another charge. Audio, animation, frame rate,
opening history and the campfire fire effect cannot create or confirm cultural facts.

## Verification scope

`tests/cultural-gathering-view.test.mjs` exercises the actual public Core, session,
SharedSettlement and FjordInterface DOM. The #277 additions cover selecting/declining
a communal occasion, its actual paid event, the real annual partnership to source-linked
wedding path, source navigation, unchanged partners, rejection of a repeated celebration,
founding exclusion and the exact one-year expiry. Earlier transaction, asynchronous
rejection, focus, keyboard, insufficient Food and support-cap journeys remain covered.

Run the focused and neighbouring public DOM journeys with:

```text
node --test tests/cultural-gathering-view.test.mjs tests/smithery-dom.test.mjs tests/first-steps-dom.test.mjs
node node_modules/typescript/bin/tsc --noEmit
```

DOM tests do not establish rendered mobile layout, WebGL appearance, physical-device
smoothness or listening acceptance. Those remain separate browser/device checks.
No formatter is configured; the changed source follows neighbouring formatting and
receives manual review plus `git diff --check`.
