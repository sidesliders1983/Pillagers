# Four-variant armor QA — #333

The issue now explicitly includes Leather Helmet and Iron-reinforced Body Armor.
They use the existing Headgear and Body Armor slots. Owner-approved rules are in
[Personal armor v0.1](../../../gameplay/PERSONAL-ARMOR-V01.md).

The current review save contains all nine genuinely crafted products. Fionnín
carries the Iron-tipped Spear, Iron-reinforced Shield, Iron-reinforced Body Armor
and Iron Helmet; the ally carries the Wooden Spear/Shield, Leather Body Armor
and Leather Helmet. The Leather-reinforced Shield is stored. Removing an item
returns it to actual stock before another resident can use it.

QA settings are explicit: ample initial supplies, stable human demographics,
accelerated labour, and **two Hides per eligible slaughter** (normal FjordSide:
one). Three actual animals supply all six recipe Hides. Actual mining supplies
Ore, ordinary paid work produces every item, and no finished stock is injected.
The prepared home/expedition files are normal paused player exports. The field
file travels to a mine; it is not already fighting. Use the home file's real
Pillage offer for the combined combat test; defenders/outcomes are not forced.

Generate into a separate directory while an older QA server is running:

    node scripts/qa/prepare-personal-armor-review.mjs --output scratch/personal-armor-review-333-variants

After the final built server is updated, open /qa/review.html, download a file,
then use Load game → Continue campaign. In Expeditions → Armor QA → Known places,
compare and transfer both variants in each slot. Check the same named residents
in the landscape and Character Card; away equipment must remain disabled.

Character Lab → Combat review offers both body and helmet variants. The direct
query armor=iron&helmet=leather loads the added pair; armor=leather&helmet=iron
loads the original pair. Field outfit loading preserves the chosen variant and
identity. Inspect Idle, Walk, Run, spear/shield actions and Fall from each side.

Evidence:

- [36 loadouts ×64 matched seeds](balance.md) and [actual outcomes/receipts](balance.json).
- [Source inventory](source-inventory.json), [two-round reproduction](source-reproduction.json),
  [prepared sources](prepared-sources.json), and [native integration](native-integration.json).
- 85 focused Core tests, six Smithery DOM tests, 96 native motion samples and
  36 new-pair hand-prop states/144 exact pair checks passed locally.
- Final clean built browser/rendering observations are added after the implementation
  is committed. Physical iPhone and combined owner acceptance remain separate.

Earlier two-item measurements under the parent QA directory remain historical;
they are not relabelled as four-variant measurements.
