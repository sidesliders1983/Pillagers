# ADR 0001: Persist deterministic prototype mechanics

Status: Accepted for Simulation Core v0.1B (#27).

The time/history-only v0.1A save contract must continue replaying identically. Economy and family rules additionally require balance settings, work remainders, player locks, building investment/debt, birth/care state and seeded random choices to survive saves.

Use an explicit version-1 mechanics extension on existing simulation schema 1, enabled by `createSettlement`. Persist the prototype configuration, integer work remainders, per-person controls and caregiver participation, and per-building debt/investment. Continue using the single saved `rngState`, CharacterDNA identity and birth-Winter-derived current age. Advance mechanics only through explicit commands and ticks.

This preserves v0.1A replay and makes split ticks and save/resume equivalent. It also keeps each save's prototype assumptions stable if defaults later change. Future incompatible mechanics changes require deliberate version migration rather than substituting new defaults. Legacy saves remain time/history-only until an explicit migration is designed.
