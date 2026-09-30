# World UI simplification — issue #4

The persistent bottom toolbar is removed. The world canvas fills the viewport.
The quiet top-left heading shows Pillagers and Fjordside's inhabitant count.
Prototype metadata lives inside the development menu.

Two 44px controls at the top-right expose contextual help (?) and development
navigation (⋯: Character Lab, Home, Debug). Native disclosure panels support
keyboard and touch. Opening one closes the other. World interactions, Escape or
choosing a dev action dismiss the panels. Diagnostics has its own close button.
HUD controls and character cards account for device safe areas.

The selected inhabitant card preserves identity and five traits. It shows the
three largest nonzero heritage shares; `+ N minor ancestries` expands the remaining
shares without changing DNA. The Character Lab continues to display all shares.
The close target remains 44px and the card follows its resident.

No DNA, phenotype, naming, camera or movement algorithms change in this pass.
Validation includes the 24 existing model/control tests, strict TypeScript/build,
desktop pan/zoom/Home/debug, actual desktop/mobile character selection, menu/help
access and dismissal, ancestry expansion, responsive bounds and Character Lab
regression. Browser scripts are optional and require Playwright/Chromium.
