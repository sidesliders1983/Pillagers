# Child proportions

The shared reference mesh grows towards its unchanged adult proportions at 18.
The six-year endpoint uses 62% adult leg length, 80% trunk length, 65% arm
length and hand size, and 69% foot size. Head shape and size remain unchanged.
Hands and feet scale uniformly for age only: no other phenotype deforms them.
Growth blends continuously through ages 6, 9, 12, 15 and 18, with remaining
child weights 1, .72, .43, .16 and 0. Ages below six currently use the same
six-year endpoint; this is not an infant anatomy model.

These are artistic approximations for the existing caricature, not clinical
ratios or a prediction of individual growth. Shorter child legs relative to
the trunk follow the trend reported in [longitudinal body-proportion research](https://pubmed.ncbi.nlm.nih.gov/21561299/).
The foot endpoint follows the approximate six/adult mean foot-length ratio
17.9/25.9 in [the 3–18-year foot-growth study](https://www.frontiersin.org/journals/public-health/articles/10.3389/fpubh.2024.1322333/full).
Arm and hand values are artistic fitting choices, rather than measured values
from that study. The head deliberately preserves the game's established design.

The same morph transforms joint bind positions and surfaces in every LOD.
Animation attenuation samples from the bind rotation every frame and applies
separate arm/leg amplitudes, avoiding cumulative damping and child arms losing
most of their swing merely because their stride is shorter.
