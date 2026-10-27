# Visiting trade v0.1A (#281)

Status: **opt-in prototype, awaiting owner review**. Ordinary campaigns and imported historical saves keep trade absent. Start a new Fjord campaign with `?trade=1` to opt in; the saved versioned state is authoritative after that. This is not default activation or approval of the new price coefficients.

## Existing owners and scope

Food and Materials use Core stocks. Hides use SpecialistStocks, only with saved livestock rules version 2. Equipment uses Smithery's **stored** counts; worn equipment, including items carried away, cannot be sold. Imports initialize only an empty missing owner before crediting the actual goods. No generic player trade inventory exists.

Supply and Craft are active visitor profiles. Livestock is gated pending actual animal delivery adapters; no living-animal import is implemented here. Horse retains its future 10-CU catalog identity with no inventory adapter, offer, spawn or assigned barter price. Off-map orders, provisions and horse gameplay belong to #282/#283. Current Longship movement, expedition Food and return cargo remain unchanged.

## Version 1 catalog and review rates

| Good | CU per unit | Internal barter value | Adapter |
| --- | ---: | ---: | --- |
| Food | 1 | 2 | Core |
| Materials | 1 | 3 | Core |
| Hides | 1 | 4 | Eligible specialist stock |
| Wooden Spear | 1 | 8 | Stored Smithery equipment |
| Wooden Shield | 2 | 12 | Stored Smithery equipment |
| Leather-reinforced Shield | 2 | 18 | Stored equipment, eligible rules |
| Horse (future) | 10 | Unset | Disabled |

These **internal valuation points are not coins** and are not a new stored resource. Cargo space never sets prices. The commercial cargo helper defaults to 10 CU and accepts mixed manifests (two shields + six Materials = 10 CU). It rejects empty manifests, unsupported/duplicate goods, nonpositive/fractional/excessive quantities and overflow. Visiting exchanges use neither the player's hold nor expedition provisions.

The merchant asks `ceil(received value × 1.25 × (1 − Trader discount) / payment-good value)` whole units. Discount is at most 10% of the unrounded asking rate, scaled linearly by the best eligible Trader's real occupation aptitude. Whole-unit rounding can erase an advantage or make its displayed percentage differ from 10%. Example: eight Food cost seven Materials ordinarily, six with a perfect available Trader. All supported exchanges retain positive value loss for the buyer, including the best rate, so an immediate reciprocal sequence cannot increase total catalog value at a fixed snapshot.

Negotiation requires a living adult Trader at home, without childcare or a committed physical mission. Ordinary membership in an idle group is not absence. The existing production switching penalty does not block negotiation. An away Trader supplies no advantage. Eligibility and the entire exact quote are rechecked at confirmation; a changed negotiator invalidates the old quote even if rounded payment is unchanged. No automatic role assignment, paid goods or added carrying space occurs.

## Visit policy and finite stock

The first ship arrives exactly two Winters after activation at founding; visits last one Winter. Subsequent arrivals are independently drawn three, four or five Winters after the previous arrival. All dates advance only through canonical ticks; there is no offline or UI-triggered progress.

The deterministic version-1 profile/lot draws use separate seed streams and no gameplay RNG. Supply offers eight Food for Materials and four Materials for Food, with an occasional spear entry. Craft offers a spear for Food and a wooden shield for Materials; eligible campaigns also offer two Hides for stored spears and a leather shield for stored wooden shields. Saved-rule eligibility provides limited relevance; stock shortages never force a Food rescue offer. Each entry starts with one to three lots, at most four entries per ship.

The visitor has one finite saved stock; each confirmed lot decrements once and the payment is credited to the same visitor. Received payment cannot add offers or replenish a sold-out entry. Opening/cancelling/reloading never draws again. The player confirms exact give/get quantities. Core checks current stock, campaign eligibility, the quote, visit and transaction sequence before any mutation. Matching accepted-request retries are no-ops after save/load and departure; conflicting retries are rejected.

The existing semantic event ledger records arrival, departure and exact exchanged goods. The ordinary five-Winter Clan Book accounts for traded Food/Materials as actual spending/other receipts, with zero unexplained difference. Hides and equipment remain specialist goods, not universal HUD resources. Save validation reconstructs the deterministic merchant history and rejects altered stock, offers, schedules or receipts. It does not duplicate the clan inventory. The Activity Center announces ships and links to the current visiting-trade window; the settlement and Longship context also expose the window. No extra canonical fleet vessel or port building is created. This slice uses ship icons and recorded arrival/departure cues rather than new 3D ship geometry.

## Review evidence and reproduction

- `node --test tests/trade-goods.test.mjs tests/visiting-merchants.test.mjs tests/merchant-session.test.mjs tests/merchant-panel.test.mjs tests/merchant-history.test.mjs`
- `node scripts/measure-visiting-trade.mjs` reproduces the 30-seed first-visit rate review and exact source hashes in `../qa/visiting-merchants-281/rate-review.json`.
- `node scripts/prepare-merchant-review.mjs` regenerates two real physical-island checkpoints. They explicitly begin with **100 Food / 40 Materials for UI QA**, retain ordinary CPU rules and use real crafting/visits. These are not affordability evidence or new founding defaults.

The first rate review observed 15 Supply and 15 Craft visits, 95 offers, 60 directly affordable offers and 15 quotes improved by at least one whole unit with the best eligible actual Trader. Missing gear and resources remain real refusals. At the first arrival, untraded runs retain exact domestic stocks, personas, gameplay RNG and autonomous CPU states against their control. This is a bounded first-visit calibration, not long-run economic balance or evidence of player enjoyment. Owner price/UX feedback and physical iPhone review remain separate acceptance gates.
