# FjordSide design style

This is the current visual contract for FjordSide and its labs. The owner approved the twilight start screen and requested the same style throughout the app. The runtime source of truth is [`src/ui/fjord-theme.css`](../src/ui/fjord-theme.css). Existing `--fjord-*` and entry `--menu-*` hooks resolve to that shared palette.

## Palette and surfaces

| Role | Token | Value / use |
| --- | --- | --- |
| Primary text | `--fs-text` | `#F4F8FA`: titles, names, actions and values |
| Supporting text | `--fs-muted` | `#C8D6DC`: hints, metadata and descriptions |
| App fallback | `--fs-canvas` | `#091D28` |
| Solid inner surface | `--fs-surface-solid` | `#071920`: sticky/nested content when transparency would overlap text |
| Main panel | `--fs-panel` | `rgba(7,25,32,.94)` |
| Card / ordinary control | `--fs-card` | `rgba(14,37,46,.92)` |
| Input | `--fs-input` | `#132F3A` |
| Hover | `--fs-hover` | `#203C47` |
| Selected / primary fill | `--fs-selected` | `#183A40` |
| Control border | `--fs-border` | `#789098` |
| Quiet divider | `--fs-divider` | 50% border color; decorative, not the only control boundary |
| Accent | `--fs-accent` | `#D8AE60`: selected borders, icons and restrained ornaments |
| Keyboard focus | `--fs-focus` | `#A9EDFF`: visible 3px outline, separate from gold selection |
| Warning / critical | `--fs-warning` / `--fs-danger` | `#F5D9AD` / `#FFB0A3`, with text/icon cues |
| Success | `--fs-success` | `#CBE9A0`, paired with a meaningful label |

Apply alpha to the **background color**, not to a whole panel: text and icons remain fully opaque. Use the 94% panel for HUD groups, management, books, menus, dialogs and floating controls; 92% cards for grouped choices. Solid inner surfaces are appropriate for nested/sticky sections. Do not stack transparent text containers or add backdrop blur. Panel colors stay readable over bright snow and water; secondary text over even pure white scenery under the panel is approximately 10.37:1, and its essential control border 4.59:1. Preserve at least 4.5:1 normal text and 3:1 large text/control contrast when adding variants.

Entry actions start neutral, with no forced action focus or selected-looking default card. A panel heading may receive silent reading focus for screen-reader context; its next interactive control receives the visible outline when reached with Tab.

Gold is an accent, not the default label color. Actions, names and headings use white; metadata uses cool white. Selected controls use both a gold boundary and their existing pressed/selected state. Hover has its own darker fill. Keyboard focus is cyan and must remain visible independently of selection. Disabled controls use `--fs-disabled-opacity` (.65) and retain native disabled semantics.

## Type, shape and interaction

- Body and controls: `--fs-font-body` (system UI); major headings: `--fs-font-heading` (Georgia). Retain monospace for diagnostics/code and cultural spelling for names. No new font downloads.
- Corners: `--fs-radius-control` 9px, `--fs-radius-card` 14px, `--fs-radius-panel` 18px. Circular markers, meters and scene geometry retain their meaningful shapes.
- Elevation: shared small/panel shadows. No extra render loop, WebGL scene, postprocessing or blur for UI styling.
- Maintain existing layout, scroll ownership, safe areas, focus restoration, accessible names and touch behavior. Shared native controls default to 44 CSS px; component-specific compact scene/HUD controls retain their established layout and hit areas.
- The shared twilight image and its local scrim belong to the **entry screen**. The running game and labs keep their actual rendered scene; inheriting the style must not download the entry artwork there.

## Data and scene exceptions

UI styling does not recolor terrain, water, models, DNA hair/skin swatches, or weather overlays. A data-color readout uses its actual color in a swatch next to a white text value; do not use potentially dark trait colors as the label itself. Food/Materials production labels retain their distinct colors. Map symbols and family edges retain their encoded meaning and shape; related and deceased residents remain distinguishable by their existing cues. Scalar meters use `--fs-chart-fill`, `--fs-chart-track` and `--fs-chart-reference`; low supplies remain a warning, not an ordinary accent.

The initial HTML loader and web manifest use matching fallback/theme colors before CSS loads; keep these metadata values aligned when changing `--fs-canvas`.

The same rules apply to entry/recovery, the live desktop/mobile HUD, Settlement and resident/house details, expeditions, Activity Center, Clan Book/Family Tree, merchant/mining, loading, ceremonies/cinematics, performance/audio controls, Character/Meshy/Asset/Environment/Water/Gameplay Labs and the older settlement/world views.

## Making future changes

Import the shared theme through the owning root stylesheet, choose tokens by role and reuse the existing component owner. Do not introduce a second local palette or desktop-only color override. Update this document with intentional visual-contract changes. New semantic/data colors need an explicit meaning and a readable contrast, rather than being replaced by the decorative accent.

Use real browser checks on representative desktop, portrait and short landscape layouts, including selected/hover/focus/disabled states, text over bright scenery and nested panels. Verify behavior through the existing public menu, book, campaign and scene contracts. Do not add tests that assert CSS text against itself or alter gameplay merely to demonstrate a style.

## Desktop start background motion

The owner-approved start artwork may animate aurora/cloud movement and water reflections on desktop (at least 1100 CSS px, hover and fine primary pointer). Use the fixed reviewed preset and the soft diagonal shoreline mask in `src/fjord-play/entry-motion/`. The Settings switch is a browser-local presentation preference. Reduced motion, touch layouts, unsupported graphics and asset/context failure retain the static image. The lightweight decorative owner pauses while hidden and releases all graphics resources before campaign loading; it adds no renderer work to the running world. Other UI surfaces retain the shared CSS-only styling contract.
