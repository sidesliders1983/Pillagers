# Preserve pre-mortality save rules

Accepted for #41. Mechanics version 2 stores the mortality curve explicitly. Version-1 saves migrate with zero mortality, retaining their economics and RNG stream; only new campaigns enable the prototype curve. Enabling mortality implicitly in old saves would alter both resident survival and later random decisions, breaking their saved assumptions and replay. Time/history-only saves remain unchanged.
