# Occupation profile calibration v0.3B — research design

Issue #85 compares A (current profiles/current scoring), B (differentiated profiles/current scoring), and C (differentiated profiles/limited mean-aware contrast). This work does not adopt new campaign defaults. No additional DNA traits, gender multipliers or production modifiers are proposed.

## Frozen input and comparison

Reuse the published #83 cohort: 1,000 founders from seeds 0–99 and its 655 observed descendants. Evaluate the identical people across all ten occupations and all three models. Descendants are a frozen inherited cohort, including deceased people, rather than survivors generated separately by each candidate.

Use seeds 0–99 for 25 Winters, each with default, seeded random and aptitude-aware command policies, under the base economy and the #77 experimental candidate (10% spoilage above two normal Winters of current Food demand). This gives 18 matched conditions per seed. Policies retain the existing allocation, housing, upgrades and cattle behaviour. The same policy algorithm may issue different commands in response to candidate scores and diverging populations; it does not mean identical command tapes or identical later RNG states.

Evaluate top-two and best–worst gaps, unchanged exploratory classifications from #83, per-role/per-person distributions and rankings, full occupation/trait correlation matrices, mean and paired Food/Materials production and stocks, shortages, population, occupations and switching. Treat the proposed 5–10 point median top-two gap as exploratory direction, not a pass gate. Keep Harsh and Severe separate, using current merged rules exactly once.

## Initial differentiated candidate

Vector order: physicality / agility / intelligence / cunning / temperament. Weights below follow the issue’s starting table. These are research candidates, not canonical values.

| Occupation | Weights | Preferred values | Identity |
|---|---|---|---|
| Farmer | .30/.10/.15/.05/.40 | .75/.35/.45/.20/.10 | Physical, steady repetitive land work; patience matters more than reactivity. |
| Herder | .10/.10/.15/.15/.50 | .35/.55/.40/.70/.05 | Calm handling and anticipating animal movement; distinct from crop labour. |
| Fisher | .15/.40/.10/.25/.10 | .50/.90/.35/.80/.35 | Dexterity and reading opportunities at the water’s edge. |
| Hunter | .25/.35/.05/.30/.05 | .85/.80/.30/.90/.60 | Mobile physical pursuit and tactical response; moderate reactivity, not maximum impulsiveness. |
| Textile Worker | .05/.45/.20/.05/.25 | .20/.90/.55/.15/.15 | Dexterous, patient repetitive weaving with low impulsiveness. |
| Smith | .40/.10/.35/.05/.10 | .95/.35/.90/.15/.45 | Force and technical control; neither high nimbleness nor maximal reactivity is necessary. |
| Woodworker | .30/.20/.35/.05/.10 | .80/.65/.65/.20/.20 | Physical, measured general construction and joinery. |
| Boatbuilder | .15/.15/.50/.10/.10 | .45/.55/.95/.65/.35 | Technical planning and anticipating structural constraints, distinct from forceful joinery. |
| Trader | .05/.10/.25/.45/.15 | .20/.40/.75/.95/.30 | Strategic negotiation and measured opportunism. |
| Leather/Jewellery Maker | .05/.35/.35/.15/.10 | .25/.60/.90/.70/.50 | Technical design and adaptive fine finishing; less repetitive high-dexterity weaving. |

Initial exploratory scoring on the frozen 1,000 founders gave A median top-two gap 2.34 points and B 3.145 points. Textile/Leather correlation fell from 0.981 to 0.278; Woodworker/Boatbuilder from 0.932 to 0.440. Under the unchanged #83 definitions, B had 128 specialists, 9 generalists, 42 poor fits and 821 mixed profiles. These preliminary figures need reproducible raw output, economy evaluation and final review before a recommendation.

## Save compatibility and later implementation

Current campaign configuration saves role weights/preferences and work remainders, but not a scoring formula identifier. Research saves must use an explicit experiment envelope carrying model, profile/mapping/source hashes and economy condition, and reject mismatched continuation. An eventual production change must separately review a saved aptitude model/version field: missing field resolves to legacy scoring, existing saved vectors and progress are retained, and only explicitly new campaigns use reviewed new defaults. Do not silently migrate existing campaigns to the global new formula. Candidate saves are QA files and must never be loaded into ordinary Gameplay Lab or /play as if canonical.

Before UI integration, use the same versioned scoring function for every gameplay occupation fit percentage, autonomous review and production. Character Lab currently has six illustrative roles; it must not be silently substituted for the ten gameplay roles. Innate fit remains distinct from actual productivity after age, shelter, care, switching, apprenticeship, upgrades and weather.
