# QA-rapport: 10 personas, 50 Winters

Datum: 7 oktober 2026. Seed: 26. Core: Simulation Core v0.1A (#26).

Resultaat: **PASS**, 11/11 controles geslaagd.

Winter 800/tick 0 → Winter 850/tick 0; 50.000 ticks. 10 personas behouden. Food 20 en Materials 10 blijven gelijk. 64 events: 1 initialisatie, 10 eerste beroepsopdrachten, 3 wijzigingen in Winter 825, 50 Winter-events.

## Testopzet

Een QA-fixture breidt de bestaande clan uit van 3 naar 10 personas, met gesede DNA, een tweede huishouden en tent. Beroepsopdrachten doorlopen alle tien ondersteunde categorieën. Einar wisselt in Winter 825 van farmer naar woodworker; Liv stopt als herder en begint als smith. Elke jaarlijkse checkpoint valideert kalender, identiteit, leeftijd, DNA, voortgang en voorraden. Dezelfde scenario-run wordt herhaald, opgesplitst in 137/863 ticks en hervat na save/load in Winter 825.

## Controles

| Controle | Resultaat |
|---|---|
| 50 Winterstappen: kalender, 10 identiteiten, leeftijden en integer-invarianten bij elke stap | PASS |
| Exact dezelfde seed en commands leveren identieke canonieke state en events | PASS |
| 137 + 863 ticks per Winter zijn gelijk aan advanceWinter() | PASS |
| Save/load halverwege behoudt alle volgende uitkomsten | PASS |
| Geen wall-clock of ongesede randomness in initialisatie, stappen of save/load | PASS |
| Finale JSON roundtrip is byte-identiek | PASS |
| 50 Winter-events, 13 beroeps-events en unieke stabiele event-IDs | PASS |
| Beroepswissel bewaart oude periode en event-time leeftijd | PASS |
| Familie-, household-, residence- en buildingrecords blijven behouden | PASS |
| De oorspronkelijke invoer is niet gemuteerd | PASS |
| Bestaande 6 Simulation Core tests | PASS |

## Personas

| Naam | Leeftijd Winter 800 | Leeftijd Winter 850 | Eindberoep | Beroepsperiodes |
|---|---:|---:|---|---:|
| Einar | 32 | 82 | woodworker | 2 |
| Liv | 30 | 80 | smith | 2 |
| Astrid | 0 | 50 | fisher | 1 |
| Bjorn | 18 | 68 | hunter | 1 |
| Freya | 24 | 74 | textileWorker | 1 |
| Torsten | 41 | 91 | smith | 1 |
| Ingrid | 55 | 105 | woodworker | 1 |
| Olaf | 12 | 62 | boatbuilder | 1 |
| Sigrid | 7 | 57 | trader | 1 |
| Runa | 36 | 86 | leatherAndJewelleryMaker | 1 |

## Interpretatie en grenzen

Deze run bewijst de deterministische foundation, geen economische of demografische balans. Productie, consumptie, geboorte, sterfte en woningverval ontbreken in Pass A. Daardoor blijven alle personas leven, ook op 105 winters, en voorraden gelijk. Ook kinderen krijgen hier een beroep om de API te testen; leeftijdsregels voor werk zijn nog niet geïmplementeerd. DNA.age blijft een begin-snapshot; de actuele leeftijd komt uit personaAge. Geen tijdafhankelijke random mechanics worden in deze pass uitgevoerd.

## Reproduceren

Vanaf de repository-root: `node scripts/qa/run-simulation-50-winters.mjs`. De runner stopt met exitcode 1 als een controle faalt.

Bijlagen: results.json (50 jaarlijkse checkpoints), initial-state.json, commands.json, final-state.json en automated-tests.txt.

SHA-256 finale JSON: `b0efaf34d8c52712f5ec66ff132b46e508730b8492f771d36e9dfe899895de17`.

Deze runner voert de zes core-tests uit. De volledige repository-suite en app-build worden apart uitgevoerd bij oplevering; hun uitkomsten staan in het vastgelegde opleveringsrapport.

## Opleveringsvalidatie tegen main

Basis: main commit 5d87033e319f66cd8cf957291ee5924d46c06b67.

- Volledige testsuite op de PR-branch: **34/34 geslaagd**, 0 failures, 0 skips.
- TypeScript: `tsc --noEmit` geslaagd.
- Vite-productiebuild: geslaagd inclusief assetkopie, met de bestaande lokale assetkit en dependencies. De bestaande waarschuwing over bundelgrootte blijft.
- Alleen issue #26-code, tests, runner, testloader en documentatie zijn meegenomen. De 11 failures uit de eerdere character-werkcheckout horen niet bij deze schone PR-branch.
- QA-fixture gebruikt de CharacterDNA-versie van main; daardoor is de finale hash anders dan die van de eerdere character-werkcheckout. Replay binnen dezelfde codeversie is identiek.

De runner en zes core-tests zijn de reproduceerbare bewijsstukken; gegenereerde states/checkpoints/logs blijven onder het genegeerde artifacts/qa-pad.
