# Pillagers — Cattle & Weather (Game Simulator v0.3)

Status: scoped design baseline.

## Scope guardrail

Pillagers must remain a strategy game rather than an all-in-one life simulation.

> Simulate deeply where it creates meaningful decisions about named people and living assets. Abstract everything that would mainly add administration.

For the near term:
- personas: deep simulation;
- cattle: medium simulation;
- buildings: state/upgrades/upkeep;
- resources: integer stocks/work progress;
- environment: Region/Site modifiers;
- weather: one Winter-level risk roll;
- 3D: presentation.

Other production stays abstract. Do not individually simulate crops, fish populations, trees, animal mood, detailed feed, etc.

## Cattle only

v0.3 uses **cattle as the only livestock species**.

Do not add sheep, goats, pigs or chickens until cattle proves that livestock creates worthwhile gameplay.

## Cattle as a Farm module

Cattle are unlocked through a Farm-specific **Cattle Pen** module rather than an independent economy.

### Cattle Pen I

Initial design:
- costs Materials (balance TBD; current example 10);
- limited herd capacity (current example 4);
- includes starter herd: **2 cows + 1 bull**;
- requires an active Farm/Farmer context;
- enables cattle lifecycle and reproduction.

Only Pen I grants starter animals.

Pen II/III increase capacity but do not spawn animals.

After the starter herd, cattle enter through:
- reproduction;
- raids/pillaging;
- future explicitly designed systems.

There is no trade system for now.

## Cattle lifecycle

Keep cattle identity small:
- id;
- sex;
- birthWinter / age;
- parents where applicable;
- lifecycle stage: calf / adult / old;
- alive/dead.

Full cattle DNA is not required for the first v0.3 test. A simple inherited quality trait may be considered later only if it adds decisions.

### Economy

Cattle:
- consume Food;
- calves consume less than adults;
- adult cows provide modest ongoing Food;
- cow + bull allow reproduction up to Pen capacity;
- slaughter produces a one-off Food yield by life stage: Young 5, Young Adult 10, Adult 15 (adult yield configurable); the stage follows the saved age thresholds (defaults: under 1, 1–under 2, 2+ Winters) and the animal leaves the living herd;
- losing/slaughtering the only bull stops reproduction until another bull is acquired.

Core choice:

> Keep an animal for ongoing production + breeding, or slaughter it for immediate Food and lower future consumption.

Farming itself stays abstract: Farmers continue producing crop Food through the normal work-progress system.

## Weather

Weather is one seeded chance roll per **Region per Winter**, not a daily weather simulation.

Initial classes:
- Mild;
- Normal;
- Harsh;
- Severe.

Region profile may alter probabilities.

### Initial affected systems only

1. Farm/Food production.
2. Cattle Food consumption and exposure risk.
3. Persona mortality risk in tents.
4. Expedition/travel duration or risk.

Do not initially add weather-driven happiness, detailed disease, snow depth, clothing warmth or crop micro-simulation.

## Exposure

Bad weather primarily punishes insufficient preparation.

### Personas

Permanent houses largely protect residents.

Tents remain valid temporary housing, but Harsh/Severe Winters increase mortality risk for tent residents.

### Cattle

A Cattle Pen provides winter protection up to its capacity.

Exposed cattle may exist temporarily beyond protected capacity, but Harsh/Severe Winters increase their mortality risk.

Bad Winters can also increase cattle Food consumption.

## Winter resolution

At the start of a canonical Winter:

1. Determine/reveal seeded weather class for each relevant Region.
2. Give the player an opportunity to respond.
3. Resolve the Winter using weather modifiers.

Possible responses:
- prioritize housing for a tent household;
- slaughter cattle for immediate Food and lower herd consumption/exposure;
- postpone a raid;
- preserve resources.

Severe weather increases risk; it does not deterministically kill exposed personas/cattle.

This reinforces the canonical language that a persona has survived **X winters**.

## Current Harsh Winter economy

New campaigns stop all Food and Materials production during Harsh Winters, including cow output. Resident and livestock Food consumption is 150% of baseline. Round each category total upward to whole Food units: three adult cattle require 5 instead of 3 Food. Calves with a zero baseline still consume zero. Work progress is preserved. The announced Winter rules apply through annual resolution. Existing saves retain their stored weather profiles; disabling weather preserves baseline rules.
