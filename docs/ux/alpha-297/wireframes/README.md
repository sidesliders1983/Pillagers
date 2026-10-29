# Proposed menu wireframes

These are source-based information-architecture proposals for #298, not actual
screenshots, implemented UI, device measurements or an alternative runtime shell.
The existing Context & Focus / Horizon owners remain. The source inventory and
before/after trees are authoritative about what already exists versus what is proposed.

- [Start, desktop](start-desktop.png) ([editable SVG](start-desktop.svg)) — three player actions; New game owns replay/advanced choices; ordinary settings separate from technical support.
- [Game menu, desktop](game-desktop.png) ([editable SVG](game-desktop.svg)) — current-session management; gameplay stays in existing contextual/navigation surfaces.
- [Start, landscape touch proposal](start-mobile-landscape.png) ([editable SVG](start-mobile-landscape.svg)) — secondary support remains secondary; no required diagnostic preflight.
- [Game menu, landscape touch proposal](game-mobile-landscape.png) ([editable SVG](game-mobile-landscape.svg)) — 44 px proposed rows and a scrollable menu. Lower items are not removed.

Desktop canvases are 1280×800; mobile diagrams are 852×393. These dimensions
are drawing coordinates, not claimed browser or physical-device observations.
Actual safe areas, touch hit targets, text scaling, keyboard/focus, scrolling and
portrait fallback remain in the deferred runtime protocol.

Give feedback is deliberately not shown as a working external link because no
owner-configured destination was found. Return to start is not shown as a working
session action until checkpoint/error/clock handling is implemented and verified.
No new renderer, graphical asset or gameplay framework is proposed.
