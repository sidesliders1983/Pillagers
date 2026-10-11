# Pillagers_Narrative_Style_v1 — initial writing brief

**Status:** Initial style direction for Lore v0.2, recorded 2026-10-11. The detailed example corpus and final wording need owner review in #104. This is not an already-trained model, measured style benchmark or approved collection of campaign stories.

See [the clan-book contract](../gameplay/spec/11-LORE-CLAN-BOOK.md), GP-001 and GP-002.

## Voice

A sober community chronicle with the rhythm of oral storytelling: concrete, restrained and human. The lives of named people and generations carry the story. Avoid generic epic grandeur, ornate prophecy and repetitive moral conclusions.

Write player-facing text in **English**, in past tense, with short to medium sentences and occasional measured repetition/alliteration. Preserve the exact cultural spelling of names. Ages and elapsed game years use **winter/winters**; calendar dates stay clear. Detailed resource totals belong in the appendix rather than overwhelming every paragraph.

## Factual boundary

Every factual clause must have recorded support or be a whitelisted fact-free transition. Do not invent thoughts, feelings, dialogue, witnesses, motives, causes, voyage history, marriage dates, teaching relationships, weather, victories, supernatural help or long-term consequences.

A founding partnership already exists; it is not a new wedding. A dead resident cannot act later. Two people with the same name are not interchangeable. A parent's profession does not prove mentoring. A work animation is not proof of a particular harvest or cut tree. Adjacency in the event log does not establish causality.

A quiet period may be described briefly. Do not fabricate adversity, emotion or a turning point to satisfy a word target. Numerical and identity fields are rendered by validated code, not approximated by the writer.

## Chapter construction

Prefer a small number of connected factual threads to a sentence-by-sentence dump of the event stream. Refer back to relevant older events when doing so changes how the reader understands continuity, but source those references from historical facts, not prior generated prose.

Vary the entry point, paragraph structure and ending. Avoid repeatedly opening with 'a new chapter', 'uncertain times', or similar filler. Repeated factual motifs can be intentional; identical chapter bodies and excessive recent openings/endings should be detected.

Initial length proposals: opening 150–250 words, subsequent chapter 250–450. Shorter truthful writing is preferable to padded or invented detail. Make paragraphs readable in the automatic story pop-up and the menu reader alike.

## Corpus to review in #104

Draft approximately ten passages spanning arrival, existing founding couples, births, ageing into work, death, housing, recorded scarcity/recovery, callbacks and quiet periods. Each synthetic example must ship with explicit input facts, expected source IDs and prohibited inferences; it must be labelled as a test/example, never actual campaign history.

Include positive and negative examples. Evaluate whether later chapters remain recognizably about the same families without becoming formulaic. Final corpus approval precedes treating examples as model instructions or trusted runtime paragraphs.

A local model may help an author draft candidate prose for review; do not publish its suggestions automatically. The controlled composer remains complete without a runtime model. Free-form model writing is a separate experiment under #105, not an exception to GP-002.
