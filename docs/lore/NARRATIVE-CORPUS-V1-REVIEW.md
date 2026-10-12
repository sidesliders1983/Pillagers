# Narrative wording review following the owner's voice reference

Status: revised English direction and conditional wording approved by the owner on 2026-10-11 for #104. Supersedes the first review examples. All examples are synthetic, not campaign records. Direction: [owner's complete reference](references/OWNER-NARRATIVE-VOICE-2026-10-11.md). Narrative facts come from the saved opening, supported events and reconciled interval accounts. Illustrative dialogue, named tools, debts, sheep, eyewitnesses and memories from the reference are not imported into the game.

## 1. The first homes

Inputs: arrival-800 names Eirik, Runa, Bjarni and Halla; frozen opening contains four tent households, three cattle, one longship, Food 30, Materials 5; couple-800 names Eirik/Runa as existing partners. Complete founding facts.

> Eirik, Runa, Bjarni and Halla arrived in Winter 800. Eirik and Runa were already partners. Their first households lived in tents; they had three cattle and one longship.
>
> Eirik worked as a woodworker, Runa as a farmer, Bjarni as a hunter and Halla as a fisher. The occupations belonged to the people who held them. Their names remained in the founding account as the household records changed.
>
> They began with 30 Food and 5 Materials. No permanent homes had yet been built.

Sources: arrival-800, couple-800, complete frozen opening including occupations and residence kinds. Omit absent clauses. No homeland, journey, courage or motive is implied. Names and roles here are examples.

## 2. A child of the founding household

Inputs: birth-803 names Sigrid, parents Eirik/Runa by ID; couple-800 links exactly those parents.

> Sigrid was born to Eirik and Runa in Winter 803. They had arrived together three winters earlier, already partners. Their names had stood beside one another at the founding. Now they stood beside their daughter's name.

Sources: birth-803, arrival-800, couple-800. Arrival together requires both IDs in the same founding party. No birth location, ceremony or feeling is invented.

## 3. The child took up work

Inputs: birth-803 for p5 Sigrid; work-819 for p5, age 16, smith. The narrative interval is 815–820.

> Sigrid became a smith in Winter 819. She had been born in Winter 803, to Eirik and Runa. Sixteen winters lay between the birth and the new occupation. The child named in that earlier chapter now had work of her own.

Sources: birth-803, work-819. “Earlier chapter” requires the birth to have been published there; otherwise say “earlier record”. No teacher, workshop, hammer or level of skill is supplied.

## 4. One house, later work

Inputs: build-804 for b1 named Eirik and Runa's home; upgrade-809 for b1 with that same designation, level 1.

> Eirik and Runa's home was completed in Winter 804. In Winter 809, it reached its first upgrade. The household's name returned beside the same building, five winters after its construction.

Sources: build-804, upgrade-809. Changed designations are stated as event-time names, never silently treated as continued occupancy. No comfort, pride or intent is implied.

## 5. A household moved

Inputs: move-810: h3 named Sigrid and Leif's household, destination label Sigrid and Leif's home; partnership-808 names same two IDs.

> Sigrid and Leif's household moved to Sigrid and Leif's home in Winter 810. They had become partners in Winter 808. The partnership came first; the change of residence followed two winters later.

Sources: move-810, partnership-808. No argument, negotiation, roof repair or wedding is invented. Ordering is not causality.

## 6. Food fell short

Inputs: complete reconciled ledger-835: unmet Food need 10, closing Food 0; interval consumption source IDs food-831 through food-835.

> There was no Food left at the close of Winter 835. Ten Food of need had gone unmet in the interval. What had been consumed and what had been missing were kept apart in the account.

Sources: ledger-835 and its transactions. No grain, starvation deaths, rations, blame or weather cause is inferred. Shortfall is not spent stock.

## 7. Food remained again

Inputs: prior ledger-835 as above; complete ledger-840: closing Food 24, unmet Food need 0.

> Five winters earlier, the account had closed without Food in stock. At Winter 840, 24 Food remained. No Food need had gone unmet in this interval.

Sources: ledger-835, ledger-840. No health recovery, triumph, lasting prosperity or cause is inferred. Missing accounting cannot support a zero-shortfall claim.

## 8. A death among the founders

Inputs: arrival-800 names Eirik p1; death-828 names Eirik p1, no cause.

> Eirik died in Winter 828. His name had appeared among the arrivals in Winter 800, twenty-eight winters earlier. His history ended here; the founding entry remained.

Sources: arrival-800, death-828. “His history ended” means observed life ended, not that historical references are removed. No illness, funeral, inheritance, grieving or last deeds are supplied.

## 9. Departure over the water

Inputs: expedition-826 names group The Western Crew, mission Pillage, Food provisions 15; return-827 recorded recovered Food 10 and Materials 5, actual casualties 0. No cargo objects are recorded.

> The Western Crew departed on a pillage expedition in Winter 826, carrying 15 Food. The return in Winter 827 brought 10 Food and 5 Materials. No casualties were recorded for that expedition.

Sources: expedition-826, return-827. No fight, sword, damaged ship, witnesses, bravery or trade debt is inferred. Exact mission identity links departure and return.

## 10. The herd and its home

Inputs: assignment-805 for animal a1 to named Farmyard Eirik and Runa's home; birth-809 for a2, mother a1, inherited same Farmyard. Cattle have canonical IDs but no personal names.

> A cow was assigned to the Farmyard at Eirik and Runa's home in Winter 805. Four winters later she had a calf. The calf was assigned to the same Farmyard as its mother.

Sources: assignment-805, birth-809 with matching mother and Farmyard IDs. Sex, offspring and assignment require recorded facts; neutral “An animal was born” otherwise. No health, happiness or shelter survival is inferred.

## 11. Five quieter winters

Inputs: complete observed interval 840–845; no supported births, deaths, partnership or housing events; reconciled ledger-845 records ordinary output/use.

> No births, deaths, new partnerships or changes of residence were recorded between Winter 840 and the completed boundary at Winter 845. Work and consumption continued. The account for these five winters was shorter.

Sources: complete observed interval and ledger-845. Categories are checked explicitly. No peaceful life, boredom, happiness, remote-clan absence or invented turning point.

## 12. A gap in the book

Inputs: imported plain campaign, no frozen founding identities; observed interval has incomplete resource accounting; build-804 is a supported earlier event.

> A home had been completed in Winter 804. The earlier construction could still be traced, though the imported book did not contain the complete founding households. The later Food and Materials account also had gaps. Missing names and quantities were left unstated.

Sources: build-804, import coverage, incomplete ledger. No current occupant, surviving building or reconstructed childhood is inferred.

## Paragraph and structure inventory

Arrival and existing couples; birth and its parents; older birth then occupation; construction then later building change; partnership then residence; shortage then a later complete account; founder then death; expedition then its own return; mother animal and calf; quiet interval; partial-history gap.

Use a small number of connected themes. Prefer names, dated actions and a relevant earlier event. Keep detailed resource arithmetic in the factual appendix. Vary theme order and paragraph structure with the saved narrative seed, never simulation RNG. Older callbacks stay separate from current-interval transaction totals. Retain published text on reload.

## Language and identity safeguards

Two people with the same name are matched by ID. Older clauses keep older names; a changed name needs an explicit recorded identity link. A transfer is not a death. A founding partnership is not a wedding. An occupation is not proof of mentoring. A building record is not proof of continued occupancy. Ambient animations, unsupported rituals, rumours and family versions produce no narrative fact.

The original twelve scenes offer a tone to work toward as more events become available. Their fictional content remains clearly attributed to the owner reference and never becomes the history of a live campaign.
