# Loading progress #259 — validation receipt

Based on main `d42b87883ea5dc428bcb2252cd85b3cee39224ce`. No Core, save schema, generator
output, original model, dependency, visual quality or timeout setting was changed.

## Automated checks

Local results (Windows/Node 24): production asset validation + strict TypeScript + Vite build pass;
15 current focused progress/DOM/entry checks pass, zero failures/skips. Manual formatting review and
`git diff --check` pass; this repository has no configured automatic formatter.

The broad local run completed 1,167 tests: 1,156 passed, one failed, ten pre-existing optional-source
checks skipped. The sole failure was `female-hair.test.mjs:33`: the provenance hash expected the
committed LF pipeline script, while Windows checkout had CRLF. It reproduces in the preceding
lighting worktree. Main's exact script blob hashes to the recorded receipt; restoring those exact
unchanged bytes locally makes the failing check pass. No script, receipt, assertion or gate was
changed in Git to obtain that result. The current focused run also includes the worker retry test
added after the broad run. Exact-head GitHub validation is required separately; do not infer a
green all-tests run from the focused result or omit the inherited skips.

- Controlled progress tests: no timer credit; distinct attempt resets; duplicate/nested worker
  work cannot inflate progress; asset counts do not imply equal cost; fixed GPU denominator;
  all modes reserve handoff; cancelled/failed late work cannot reach 100%.
- Actual IslandLoading DOM/lifecycle: stage is set before delayed asset work; successful envelope
  completion updates the native accessible progress element; bounded compiler failure; context
  failure/cancel retains its reason; model work drains; worker retry retains seed and fences stale
  callbacks. JSDOM checks semantics, not layout or WebGL.
- Existing campaign-start/save ownership and generation contracts remain part of full validation.
- `overhead.json` is a synthetic CPU observer comparison with exact module SHA, not a renderer
  benchmark or a measurement of the owner's reported long load. No extra GPU resources are used.

## Browser/device evidence — pending, not passed

The browser control inventory returned `apps: []`, `browsers: []` during this implementation.
No screenshots, actual graphics compilation, physical iPhone/iPad load time or peak browser
memory was measured. HTTP/module serving and Node/JSDOM tests cannot substitute for these gates.
There is no evidence yet attributing the reported 1–2 minute wait to compilation, CPU or memory.

Use the isolated LAN preview on port 5230. Keep the browser/device, build, effects, viewport,
recording setting and cache conditions matched; the report labels cache temperature unknown
because browser HTTP/model/GPU caches cannot reliably be inferred. Record recording On/Off in
the loading diagnostics selector. New port storage is separate from the accepted lighting preview
on 5229. Use disposable test campaigns; preserve an exported developed campaign before testing.

| Current-build case | Low | Standard |
| --- | --- | --- |
| New campaign, curated geography 18 | Pending | Pending |
| New campaign, curated geography 7 | Pending | Pending |
| Continue one developed saved campaign | Pending | Pending |

Use `islandRecipe(seed)` to select campaign seeds that map to 18/7 in v3; do not force a recipe
that mismatches its campaign seed. Also check same-founders restart, normal warm return, arrival
skip and an intentionally open/scrolling founding chapter at portrait and landscape sizes.
Save the report through Game menu → Loading diagnostics after ready; compare top-level geography,
assets, world preparation, model sync, upload, compilation, first draw and handoff separately.
Report the slowest loads to #151; exclude inclusive parent spans when summing child times.

Controlled browser fault checks still needed: delay the worker; fail an asset request (404/timeout,
distinguishing supported fallback from required failure); hold compile; cancel; lose WebGL context.
Confirm previous valid saves/seed survive, recovery remains contextual, late GPU/model results are
disposed by their existing owner, and failed attempts never report 100%. Process-kill final events
and unsupported Safari memory/GPU APIs must remain explicitly unavailable.
