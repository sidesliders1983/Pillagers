# Pillagers Simulation Run #001 — Demography only

Status: design simulation, manually executed in chat.
Period: 1200–1220.
Purpose: test whether a small settlement can generate understandable multi-generational social structure before economy/resources are introduced.

## Start population

12 residents.

| Name | Age in 1200 | Household | Partner | Occupation |
|---|---:|---|---|---|
| Eirik | 42 | H1 | Sigrid | Farmer |
| Sigrid | 38 | H1 | Eirik | Farmer |
| Leif | 14 | H1 | — | — |
| Freya | 9 | H1 | — | — |
| Bjorn | 31 | H2 | Astrid | Hunter |
| Astrid | 28 | H2 | Bjorn | Fisher |
| Yrsa | 4 | H2 | — | — |
| Torsten | 51 | H3 | Runa | Woodcutter |
| Runa | 47 | H3 | Torsten | Farmer |
| Olaf | 22 | H4 | — | Fisher |
| Ingrid | 20 | — | — | — |
| Hakon | 17 | — | — | — |

Ingrid and Hakon intentionally start without household/occupation.

## Rules used

- Adult / work / partner eligibility begins at age 16.
- Partner matching happens once per year.
- Close family is excluded.
- New couples form a new household.
- Women age 18–40 in a partnership have a simple annual birth chance; after birth, 2-year cooldown.
- Men may rematch after a partner dies. Women do not rematch in this run.
- Natural mortality is low under 50 and rises thereafter.
- Occupations initially: Farmer, Hunter, Fisher, Woodcutter, Unassigned.
- Occupation assignment reacts to settlement need in a very simple way.
- Seeded randomness intended, but this run was manually simulated rather than executed by code.
- No Food/Materials consequences yet.

## Key events

1201
- Ingrid and Olaf form a partnership.
- H5 forms.
- Ingrid becomes Farmer.

1202
- Leif reaches adulthood and becomes Woodcutter.
- Hakon becomes Hunter.

1203
- Liv born to Ingrid and Olaf.

1204
- Arne born to Astrid and Bjorn.

1206
- Sven born to Ingrid and Olaf.

1207
- Freya reaches adulthood.
- Hakon and Freya form a partnership.
- H6 forms.
- Freya becomes Farmer.

1208
- Torsten dies at age 59.

1210
- Solveig born to Astrid and Bjorn.

1211
- Ivar born to Freya and Hakon.

1212
- Yrsa reaches adulthood.
- Leif and Yrsa form a partnership.
- H7 forms.
- Yrsa becomes Fisher.

1213
- Runa dies at age 60.
- H3 dissolves.

1214
- Alva born to Yrsa and Leif.

1216
- Eirik dies at age 58.
- Tove born to Freya and Hakon.

1217
- Kari born to Ingrid and Olaf.

1218
- Erik born to Yrsa and Leif.

1219
- Liv reaches adulthood and becomes Farmer.
- Sigrid dies at age 57.
- H1 dissolves.

1220
- Arne reaches adulthood and becomes Farmer.
- Arne and Liv form a partnership.
- H8 forms.

## State in 1220

Living population: 17.
Births during run: 9.
Deaths during run: 4.
Original founding households H1 and H3 have dissolved, but their lineages continue.

Notable outcome:
- Generational replacement emerged naturally instead of using the old “remove at 60 and spawn random child” prototype rule.
- Household and lineage proved to be separate concepts.
- Occupation loss on death became visible but had no economic consequence yet.
- Matchmaking exposed age-gap and kinship questions that needed clearer rules.

## Design conclusions from Run #001

1. Person identity should persist across life history.
2. Family graph and Household should remain distinct.
3. New births should have real parents and permanent history.
4. Occupations matter more when they feed an economy.
5. A future run should add Food and Materials without changing the starting cast.
6. First-cousin and deeper kinship handling should eventually become explicit.
