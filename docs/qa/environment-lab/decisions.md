# Agreed design and test boundaries

Issue #56, clarified with the user:
- Water is matte and calm, with restrained waves and shore foam.
- The Environment Lab opens the new fjord water directly. No Legacy/Candidate comparison control or split-screen comparison is required.
- The shared terrain, authored scenery, seed and lighting remain the reference.
- Fjordside integration remains a later pass.
- The explicit legacy quality fallback remains available for compatibility.

Confirmed test boundaries:
1. Visible lab controls: camera, day/night, water visibility, wave pause and quality.
2. The public water-depth query.

Tests should observe behavior at these boundaries. They must not inspect private state or shader source strings. Work added after confirmation follows one failing test, minimal implementation, then the next behavior. Earlier prototype checks were written before TDD was requested and are not presented as test-first work.
