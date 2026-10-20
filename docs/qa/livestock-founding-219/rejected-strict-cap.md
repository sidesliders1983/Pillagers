# Rejected pilot: strict birth capacity

The initial measured candidate is preserved under `measurement/` at source revision `e657ef4`. It proposed the feeding guard plus a strict requirement for one free offspring space, using four cattle-equivalent outdoor spaces. Its new-species probabilities were chicken 25%, pig 35%, sheep/goat 30%, goose 20%; pig/sheep/goat retained a two-year minimum interval. None of these values became shipping defaults.

Before that batch, the one-seed 40-year pilot also exposed an unsuitable QA management policy that retained surplus adult males. The corrected policy uses real slaughter to preserve breeding space and retain replacements. Those exploratory scratch runs are not counted as the final matrix.

The two-seed opening of the scheduled 630-case batch reproduced repeated herd loss even under the corrected policy. The hard birth ceiling could leave three founding breeders and a young male occupying every slot until the females were too old to reproduce. The short fertile windows and low chances in several new profiles also left little replacement margin. This candidate is rejected; completing hundreds more cases would not make that known limitation a suitable recommendation.

The batch was explicitly stopped with SIGINT. Its manifest deliberately retains `finishedAt: null`: completed raw observations remain recorded with their actual years and hashes, and uncompleted jobs are **not** counted as successful measurements. The final report states the exact completed count. No raw observation or historical report is rewritten to describe the replacement candidate.

The next measured candidate changes only experimental inputs: retain the feeding guard and weighted overcrowding, remove the hard birth ceiling, raise chicken/goose birth chances to 45%/35%, and use a one-year interval for pigs/sheep/goats (pig chance 40%). Existing cattle coefficients remain unchanged. All other proposed profile values remain the same. These are a replacement trial, not an activated gameplay decision. The fresh matrix is recorded separately in `measurement-soft-v2/`.
