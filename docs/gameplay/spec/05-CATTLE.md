# 05 — Cattle (Simulator v0.3)

## CATTLE-001 — Farm module
**Status:** Canonical direction; values Prototype

> **As a player, I want cattle to be an optional Farm investment, so that livestock adds depth without becoming a separate management game.**

Rules:
- cattle only initially;
- require Cattle Pen;
- Pen I currently: cost 10, capacity 4, starter herd **2 cows + 1 bull**;
- Pen II/III increase capacity but spawn no cattle;
- no trade initially.

## CATTLE-002 — Living herd
**Status:** Canonical direction

> **As a player, I want cattle to reproduce and age as living assets, so that a herd has future value beyond current Food yield.**

Minimum state: id, sex, birthWinter/age, parents where applicable, calf/adult/old, alive/dead. Full animal CharacterDNA not required. Cow + bull enable reproduction within constraints.

## CATTLE-003 — Consumption/output
**Status:** Canonical direction; values Open

> **As a player, I want cattle to consume Food while providing ongoing value, so that a herd is an investment rather than free production.**

Cattle consume integer Food; calves less than adults; adult cows provide modest ongoing Food. Exact rates open.

## CATTLE-004 — Slaughter
**Status:** Canonical direction; prototype yields implemented

> **As a player, I want to slaughter cattle for immediate Food, so that I can sacrifice future production/breeding for survival now.**

Slaughter gives one-off integer Food by the saved age thresholds: Young (default under 1 Winter) = **5 Food**; Young Adult (default 1 to under 3 Winters) = **10 Food**; Adult (default 3+ Winters) = **15 Food**. The adult yield retains the saved configurable slaughterFood value. Young yields are fixed prototype values. The animal is permanently removed from the living herd. Losing/slaughtering last bull stops reproduction.

Current campaign defaults: Young below 1 Winter; Young Adult (heifer for females) from 1 to below 3; Adult from 3. Cow output and adult Food consumption start at 3; reproduction requires a cow and bull aged 3–12 in the same herd. The configured mortality age bands remain unchanged. Existing saves and restarts retain their saved age/fertility thresholds, including the former 2-Winter Adult boundary.
