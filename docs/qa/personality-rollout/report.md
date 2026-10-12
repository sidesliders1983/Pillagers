# Personality Life Events · new player rollout

Owner follow-up on PR #124, 12 October 2026: the existing social behavior defaults on for new player campaigns in Gameplay Lab and shared 2D/Fjord sessions. Core/CPU defaults, saved-rule restart, old imports, probabilities and consequences are preserved. Public creation-path tests cover default/on/off, actual shared handoff and unchanged imported book history. Browser checks cover actual default-on setup, explicit opt-out, legacy import/restart and a genuinely new campaign.

The historical 204-pair study remains unchanged; a dated clarification corrects childcare wording and records the superseding rollout direction. Five-Winter care and two complete Winters birth cooldown are separate settled rules.

Validation: 77 targeted creation/session/reader/bridge/weather tests passed; production build passed. Actual Gameplay Lab (1440/390 px), 2D and Fjord creation/import buttons passed in desktop Edge with touch emulation. Existing character validation and full tests remain required in CI at the changed head. No formatter configured; manual review and git diff --check.
