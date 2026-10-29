# Proposed menu wireframes — revised after owner review

These are information-architecture proposals for #298, not actual game
screenshots, implemented controls, usability results or an alternative game shell.
They follow the [observed journeys and empathy hypotheses](../journey-empathy-maps.md)
and [review corrections](../review-response.md). Existing Context & Focus / Horizon
owners remain. Actual browser evidence is separately [indexed](../runtime/README.md).

- [Start, desktop](start-desktop.png) ([SVG](start-desktop.svg)): Continue/New/Load,
  Settings, one Help & support, quiet credits. Nested help keeps deliberate
  pre-start diagnostics/report access; New game owns arrival/replay/advanced options.
- [Game menu, desktop](game-desktop.png) ([SVG](game-desktop.svg)): Save/Load/Settings/
  Help first; conditional feedback; separate lower replacement section. Play/Pace/
  +1 Year stay in the header; there is no duplicate desktop Time submenu.
- [Start, landscape](start-mobile-landscape.png) ([SVG](start-mobile-landscape.svg)):
  no prominent diagnostics button. Help opens problem help and then Diagnostics.
- [Game menu, Horizon landscape](game-mobile-landscape.png) ([SVG](game-mobile-landscape.svg)):
  scroll retains lower entries. Compact Play/Pace in header; existing direct
  +1 Year overflow only on Horizon, preserving expedition restriction.

Give feedback is shown only as a conditional design destination: **no URL is
configured**. A dashed annotation is not a proposed dead button to ship. Return
to start is conditional on implementing and verifying safe session handoff.
Neither currently has a working ordinary in-game route in the inspected source.

Desktop drawing coordinates: 1280×800. Landscape: 852×393. They are not device
measurements. Ordinary settings stay out of Diagnostics; genuine corruption/storage
warnings stay immediate. No capability is deleted by simplifying the hierarchy.

The separate [throwaway flow prototype](../prototype/README.md) explores state and
back/cancel behavior. It answers a flow question, not an art/style redesign.
