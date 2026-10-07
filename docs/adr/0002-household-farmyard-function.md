# ADR 0002: Farmyard is a live household-home function

Status: Accepted following the confirmed Farmyard correction.

A Farmyard is not an independently built asset. A permanent household home has this function while at least one living resident has the farmer occupation. Tents cannot provide it. The function is derived from canonical residence/membership/occupation records rather than stored as a second mutable truth. Commands and Winter-boundary social changes emit function transitions and clear invalid cattle assignments. Livestock assignment remains an explicit per-animal decision; the four-animal capacity remains a soft cap.

The previous prototype stored separate Farmyard buildings and automatic herd assignment. Keeping that model would violate the corrected rule; converting those structures into free homes would add unintended housing. Landing save extension version 2 instead retires them on load, leaves resource stocks unchanged, unassigns their cattle and preserves their historical events with a migration fact. Version-1 source files remain unchanged; migrated version-2 saves do not migrate twice. A home's existing investments/upgrades survive loss of function.
