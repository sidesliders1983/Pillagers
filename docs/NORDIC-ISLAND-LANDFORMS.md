# Nordic island landforms — research for #133

Research date: 2026-10-13. This note distinguishes source findings from the small-scale game approximation. The generator does not simulate geological time, tectonics or glacier dynamics.

## What formed the reference landscapes?

| Reference | Supported finding | Implication for the generator |
| --- | --- | --- |
| Iceland | Volcanic construction supplied the land; repeated glaciations later excavated major valleys and fjords. A volcanic origin does not imply a smooth cone or circular coast. | Combine an elevated interior with selective valley incision and irregular headlands. |
| Norway | Much of the visible relief reflects repeated glacial erosion of an older landscape. U-shaped valleys and fjords coexist with less-eroded uplands and coastal lowlands. | A valley should continue into its inlet. Ridges should remain between valleys; low passes allow connections. |
| Denmark | Møn records glacial deformation, moraine ridges, meltwater depressions and later marine flooding/deposition. Læsø demonstrates island growth through sediment supply and shoreline change. | Broad low coastal ground is plausible, but these examples do not justify treating every Nordic island as a volcanic mountain. |

Iceland's geological institute describes both the volcanic foundation and the strong effect of Ice-Age glaciers on its present relief: [geomorphology](https://www.natt.is/en/geology/geomorphology), [volcanic activity](https://www.natt.is/en/geology/volcanic-activity). Its [Surtsey research](https://www.natt.is/en/research/monitoring-and-research/surtsey) provides an actual example of a newly erupted island and continuing erosion. It is a distinct case, not a universal explanation for Nordic islands.

The Norwegian Geological Survey describes glacial troughs, fjords, upland remnants and coastal processes in [Fredin et al. (2013), Glacial landforms and Quaternary landscape development in Norway](https://static.ngu.no/upload/Publikasjoner/Special%20publication/SP13_s5-26.pdf). The paper notes that the origin of the strandflat is complex and not completely resolved. NGU's [marine-landscape overview](https://www.ngu.no/om-geologi/ngus-kart-over-marine-landskap) also identifies the lowland/shallow-sea fringe outside many fjord mouths.

The Danish Geological Survey provides concrete island histories in [the Møn geological-map description](https://pub.geus.dk/en/publications/descriptive-text-to-the-geological-map-of-denmark-150-000-m%C3%B8n-151/) and [Hansen et al., Læsø coastal development](https://pub.geus.dk/en/publications/continuous-record-of-holocene-sea-level-changes-and-coastal-devel/). These sources support using glacial and coastal-depositional explanations alongside volcanic ones.

## Primary visual reference: older Icelandic fjords

The selected target is the older, glacially dissected basalt landscape of the Westfjords and Eastfjords. The nature authority's [Dynjandi account](https://www.ust.is/nattura/natturuverndarsvaedi/fridlyst-svaedi/vestfirdir/dynjandi-i-arnarfirdi/nattura/) describes accumulated lava layers forming a plateau, subsequently cut into deep fjords by glaciers. Its [Vatnsfjordur geology](https://www.ust.is/english/visiting-iceland/protected-areas/westfjords/vatnsfjordur/nature-and-geology/geology/) distinguishes the old basalt landscape from current volcanic activity. In the Eastfjords, [Nipa at Neskaupstadur](https://www.ust.is/english/visiting-iceland/protected-areas/east/neskaupstadur-public-park/) provides an example of layered basalt in a ridge between fjords and a lower coastal terrace shaped by the sea.

These sources support the **sequence** of construction, erosion and inundation. They do not supply the game's dimensions, probabilities, slope thresholds or exact numerical erosion profile.

## Translation into the v0.3b game landscape

1. One to three overlapping, elongated volcanic accumulation zones establish one broad basaltic landmass. Seeded rotation, lengths, widths, offsets, differing headings, coordinate warping and rolling bedrock relief make it asymmetric. There is no central cone or list of angular headlands.
2. Priority flooding resolves small depressions in a temporary routing surface. D8 downhill flow and upstream accumulation identify the major catchments. Two to four major outlet routes are selected by contributing area, drainage-route length and physical separation, not compass angles. Donor branches become tributaries of their actual parent route.
3. Erosion lowers the canonical field along these routes with broad U-shaped, asymmetric cross sections. Longitudinal floors descend toward the sea. The remaining uncut plateau creates the ridges; no independent mountain cones are placed. Tributary endpoints meet stored parent nodes.
4. The sea intersects these same lowered samples. Flooded downstream valleys become fjords; their landward continuations share the same network. Coastal abrasion/deposition is approximated by continuous elevation transforms whose slope and vertical reach vary spatially and with prior valley erosion. Low shelves can rise several metres above the water, rather than forming one near-sea-level band. Local smoothing removes drainage-cell artifacts before coast extraction. Small detached remnants up to 256 square metres are submerged; larger fragmentation is rejected, never repaired by a land bridge.
5. Only after terrain formation do queries look for connected lowland pockets and a substantial intervening ridge with walking/coastal access. These queries never write terrain. No rectangular settlement flattening, predetermined site coordinates, final house placement or rival reservation participates in this island generator.

## Intentional game-scale constraints

The 800 x 800m extent, 2m canonical grid, 8m drainage routing grid, metre-sized assets, at least 3,000 square metres per natural lowland pocket, and slope/ridge thresholds are bounded engineering choices. This is a landform approximation, not a glacier or lava-flow physics simulation and not a reconstruction of a particular Icelandic island.

Shape screens reject fragmented land, strongly regular rotational silhouettes, insufficient inlet incision, or missing connected compartments. These screens supplement the undecorated top-down and oblique review; they cannot certify geological realism. Final settlement placement, foundation fitting, reservations, scenery-aware routes and line-of-sight validation remain #134. Existing stored worlds retain their original geography.
