# Clan Book v0.2A

Implementation for #103. The controlled baseline works without a model, paid service,
external endpoint or player installation. The original Chronicle and Raw Events remain.
Full narrative continuity/style work belongs to #104; optional model evaluation to #105.

## Calendar and frozen facts

New campaigns freeze names, occupations, existing partnerships, households, ship, cattle
and starting stocks at creation. The opening is published immediately. A separate
presentation identity/seed selects a bounded opening variant without consuming Core RNG.
Text, template/generator/style versions, checkpoint identity and facts are saved. Published
chapters are never regenerated or replaced when reopened or loaded.

An opening at Winter 800 is followed by chapters closing at 805, 810 and 815, after every
five complete annual resolutions. The calendar remains canonical: each Core Winter is a
year. Chapter accounting uses exclusive event-sequence boundaries, not year-label filters.
The closed checkpoint includes final-tick production, mortality, consumption, upkeep,
births, weather and stepWorld/mission returns from the completed boundary tick. Commands
issued afterwards at the same tick belong to the next interval. Demographic entries keep
their actual event-time Winter and recorded names/parents/causes; missing causes stay unknown.

GameplaySession observes long advances at each milestone and finishes the original total
advance, preserving partial ticks and the original aggregate stock trend. Public tests
compare complete Core JSON exactly against the unsplit command. Fifteen Winters produce
three separate frozen packages; later population/stock changes cannot rewrite earlier ones.

## Stock ledger

Each resource reconciles opening + production + other receipts - consumption/spending -
losses = closing. The table distinguishes resident and cattle production, actual consumption,
other spending, losses and unmet need, with event IDs and transaction purposes. Slaughter,
loot and salvage are receipts, never production. Construction, upgrades, paid upkeep and
expedition provisions are spending. Shortfalls and unpaid upkeep are not spent inventory.

Unknown unpaid-upkeep quantities are shown as Not recorded. Unknown transaction amounts
or unexplained stock residuals mark accounting incomplete. Numbers in incomplete tables
are explicitly recorded subtotals; prose does not claim they are exact totals. Existing
runtime has no Food spoilage rule; an actual FoodSpoiled event is classified as a loss.
No experimental balance values or historical measurement reports have been changed.

See [source/sink inventory](CLAN-BOOK-IMPLEMENTATION-AUDIT.md) for producer paths and fields.
CPU settlements' independent histories are not included in the player's totals.

## Reader and notifications

The opening and new chapters appear automatically in a shared, non-modal Clan Book reader.
The world continues behind it. Start/Pause remains usable above the contained reader;
opening, choosing chapters or closing never changes clock intent. Paused campaigns remain
paused. Hidden-tab, loading, explicit import and view-ownership safeguards remain in charge.
No offline time or reading-triggered catch-up is introduced.

Several due chapters use one chapter selector. New chapters queue without replacing the
currently displayed passage. Closing dismisses pending notifications together; unread
chapters remain in the saved book. Published, notified and read states are distinct.
Notification state is persisted before automatic presentation. The book is always available
from Menu in Fjord and Game settings in 2D. There is no required reading time or decision.
Keyboard Escape closes the reader, controls do not leak into camera navigation, and focus
returns to an available opener/menu. Touch controls are at least 44 pixels high; factual
appendices and the reader scroll within the viewport. No mandatory full-screen modal blocks
the manual clock controls. Automatic pop-up hiding remains a later settings enhancement.

## Save ownership and compatibility

GameplaySession owns the observer/book. The optional narrative extension is saved in the
existing Fjord campaign wrapper and shared 2D/Fjord local/active save. Canonical Core JSON
and its replay remain unchanged. Export the extended campaign to retain the book; canonical
JSON export intentionally contains only simulation data. Gameplay Lab's canonical-only
save path is accepted as the partial-history compatibility path, not a second journal.

Narrative imports bind to the complete canonical save identity, not only the game seed.
A stale future extension with an earlier Core save is rejected before mutation. Local paired
saves discard an unmatched narrative sidecar and use the explicit partial-history path.
Reload and 2D/Fjord handoff retain exact text and notification state. Rollback can remove
later chapters; the reader refreshes its selected passage even when the book ID is retained.

Legacy plain saves use only recorded founding events and explicit incomplete coverage;
they do not infer missing historical names/jobs from current residents and do not announce
a flood of retrospective chapters. Future observed intervals close on the original founding
cadence where recorded; partial first intervals remain labelled. If no founding or clan
initialization time exists, the observed import time is the explicit cadence origin.

There are no asynchronous model jobs in this foundation. The baseline is available
immediately and saved as final text. Any future writer must validate save/input identity
and cannot silently replace this published text or change notification/playback intent.
The identity fingerprint is a non-security consistency check, not authentication of
user-edited save files. Reader text is escaped, including names and recorded fields.

[Executed QA and limitations](../qa/clan-book/report.md).

## Housing reference correction (#112)

The settlement, management panels and new Lore use the shared resident-based housing
labels described in [the source map](HOUSING-NAMES-112-AUDIT.md). New Core events add
version-1 `housingNames` reference snapshots; they do not change simulation rules or IDs.
Fresh opening facts also freeze optional household `displayName` and `residenceName`.
Source identities remain available in a separate factual disclosure.

Composition never resolves an old event against today's occupants. Missing historical
labels have neutral fallbacks. Imports without optional opening labels remain valid.
Published text, checkpoint identity, notification state and reading state are preserved;
this fix does not rewrite already published chapters. The reader still leaves pacing alone.


## Unnamed longship presentation

Longships do not need a narrative name. New Chronicle entries and new Clan Book chapters use “Our longship was retained” or “Our longship was salvaged for N Materials”; the founding appendix labels the vessel “Our longship”. Technical vessel IDs remain in canonical events and the frozen facts for provenance and commands. Longship Chronicle templates use version 2. Previously published chapter text remains saved verbatim; loading does not rewrite the published past.
