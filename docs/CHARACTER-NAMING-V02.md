# Character Lab naming v0.2

Issue #3 adds a pure naming layer and applies it to `/character-lab`.

Culture is independent of normalized heritage. All six cultures have curated,
sex-specific patterns. The generator uses named seeded streams, with culture
anchoring 80% of ingredient draws and heritage contributing 20%. Only explicitly
curated donor stems cross compound grammar boundaries. Gaelic, Finnic and Sámi
instead use heritage-weighted local pattern families where free stem borrowing
would be unsuitable. These weights are art direction, not historical statistics.

Scandinavian culture uses explicit parent genitives with `son` / `dóttir`.
Other cultures currently use a given name only. Synthetic parent stems are
labelled in derivation metadata; a future caller can supply a father's given name
and genitive. The model supports a family name and earned epithet, without
implementing inheritance or life-event simulation.

This is a small, stylized game vocabulary, not a historically exhaustive database.
Modern Northern Sámi spellings are used, and the broad Baltic profile uses
Lithuanian-style endings. Generated compounds and cross-cultural loans are design
constructions and are not all historically attested. Finnic vocabulary and naming
variation were informed by the University of Helsinki's research:
[name database](https://blogs.helsinki.fi/personal-name-systems/name-database/),
[Old Karelian personal names](https://ojs.utlib.ee/index.php/jeful/article/view/jeful.2022.13.2.08).
Norse genitive conventions are checked against
[Old Norse names](https://www.vikinganswerlady.com/ONNames.shtml).

## Editor and serialization

The Identity panel shows the full name, culture selector, name variation seed,
Reroll name button and derivation JSON. Heritage/sex edits update the name live;
age and trait edits preserve it. Pinned comparisons retain their names.

Optional `CharacterDNA.naming = { culture, seed }` persists the cultural context
and name variation in copy/export/import. Legacy DNA without naming defaults to
Scandinavian culture and variation seed zero. Naming is cultural metadata beside
the biological fields; it does not affect phenotype or occupation fit.
The effective generator seed is unsigned `DNA.seed XOR naming.seed`. Reroll name
increments only the variation seed; Reroll seed changes appearance and name.
The derived name is recomputed, rather than stored as editable text.

## Validation

Node tests cover reproducibility, variation, normalized heritage, both sexes in
all six cultures, valid curated components, donor probabilities, local pattern
weighting, patronymics, optional parent context and JSON round trips/rejection.
The browser smoke checks culture/name-only rerolls leave phenotype unchanged,
configuration import, existing lab interactions and responsive mobile rendering.

Source: `src/characters/naming/`; no rendering or gameplay imports.
