# Cultural motion — bounded memory / assertion diagnostic

Date: 26 October 2026. This investigation uses the actual 445,676-byte cultural
animation bank and a frozen snapshot of the motion agent's current loader. It
changes no runtime files or motion-owned tests. The original full-object failing
assertion was deliberately **not rerun**.

## Finding

The installed Node v24.19.0 assertion formatter has a directly identified
high-allocation path for the reported mismatch:

```js
assert.equal(await motion.prepare(request), null);
```

When the intended red implementation returned the full two-clip array, the
strict-equality error constructor called `util.inspect` with `compact: false`,
`depth: 1000` and `maxArrayLength: Infinity`. It then compared the resulting lines
with the single line `null` using `internal/assert/myers_diff`.

The actual bank's inspected representation is **3,198,365 bytes / 122,252 lines**.
Counting that representation is safe and was executed without printing it. There
is no exact common line with `null`. The installed Myers implementation creates
an `Int32Array(2 * (actualLines + expectedLines) + 1)` and copies that entire array
into a retained trace at every edit level. For this input, completing the diff
would require 122,254 trace rows of 978,028 bytes: **119,567,835,112 bytes,
approximately 111.36 GiB**, before other allocations.

This is a calculation from the actual inspected line count and installed
algorithm, **not a measurement of an executed 111 GiB allocation**. The diagnostic
never invoked that diff. These trace arrays are external typed-array allocations;
`--max-old-space-size=512` is not a safe way to rerun the original pathological
assertion. Use bounded Boolean/scalar/hash/name assertions instead.

The motion agent reported the earlier child terminating at approximately 8 GiB
RSS with external-memory pressure and a small managed heap. No original fatal
log was retained in the audit files, so that peak/termination account is not an
independently reproduced measurement here. Nevertheless, the exact assertion
path above provides a concrete allocation mechanism consistent with that report,
rather than inferring a runtime leak from timing alone.

Installed built-in source identities are in the raw reports:
`internal/assert/assertion_error` SHA-256 `39da8256911db75f861e8203fc78044e5a9bb48e3da15d7d5e1274e61aa0aaaa`;
`internal/assert/myers_diff` SHA-256 `6495c1de6d88f767ca25f008f1e4aee21123734ebfa7af337e000e9890d9bdbe`.

## Actual loader measurements

The isolated child used `--max-old-space-size=512`, explicit GC at labelled
checkpoints, a 768 MiB sampled-RSS soft stop, a single focused diagnostic test,
and only bounded Boolean/scalar assertions. No full Three.js objects/tracks were
printed. Inputs were copied into `scratch/perf-motion-memory/` before the motion
agent resumed concurrent edits; reports identify all source hashes.

The frozen `CulturalMotion.ts` SHA-256 is
`b0b684f78817f60dbc7ff842b808022c3bdda8dba78935ba18b99ddad3bf72f2`.
The bank SHA-256 is
`8fb9ff11a617d53064515f152cab184de2804a23eece4e5456edf66b92ae143f`.
The loader snapshot already includes generation invalidation, `reset()` and
`dispose()`; this is separate from the earlier intended-red implementation.

| Measurement | Actual result, capped 100-cycle run |
| --- | ---: |
| Clip count / track count | 2 / 264 |
| Encoded bank | 445,676 bytes |
| Sum of all parsed track times/values | 480,480 bytes |
| Unique backing ArrayBuffers for those tracks | 370,440 bytes |
| First load/hash/parse wall time | 23.80 ms |
| Warm requests within one owner | 100 requests, exactly one download and same returned array |
| Fresh owner load/dispose cycles | 100, 1,184.88 ms combined wall time |
| Largest labelled RSS sample | 129.66 MiB |
| Node resource-usage peak RSS | 150.93 MiB |
| Managed heap after first owner/diagnostic references released | 18.75 MiB |
| Managed heap after 20 / 50 / 100 disposed replacement owners | 19.38 / 19.30 / 16.19 MiB |
| ArrayBuffer bytes after initial cleanup and 1 / 5 / 10 / 20 / 50 / 100 replacements | 602,271 bytes at every checkpoint |

The 602,271-byte figure includes the diagnostic fixture and process inputs; it is
not exclusively the bank. A live loaded bank raised that count by its measured
370,440 unique backing bytes, which returned after owner/consumer references were
released. The separately preserved [20-cycle run](motion-memory-20.json) also
passed and returned typed-array storage to the same baseline. The
[100-cycle run](motion-memory-100.json) includes every labelled sample.

RSS grew from about 106 to 128 MiB across the replacement sequence despite the
stable/reclaimed JavaScript heap and typed-array checkpoints. This short run
therefore does **not** establish an indefinitely flat RSS curve or classify every
native/allocator high-water allocation. The final corrupted-byte fallback sample
also includes temporary corrupted input buffers held within the diagnostic test;
use the explicitly labelled replacement/disposal checkpoints for the comparison.

The bounded diagnostic also executed real reset/disposal races: an old request
resolved to null after reset, the new request reused the same pending bank, a
late completed load could not revive a disposed owner, and a disposed owner did
not start another download. The HTTP-LAN fallback hash path rejected changed bank
bytes. These are headless loader observations, not browser scene acceptance.

## Reproduction and limits

Executed from the D: cultural-events worktree:

```powershell
node --max-old-space-size=512 --expose-gc --test scratch/perf-motion-memory/bounded-motion.test.mjs
```

The earlier 20-cycle measurement used the same frozen loader/bank, then the
scratch diagnostic loop was expanded to 100 solely to investigate its RSS rise.
Both raw outputs are retained. The scratch script snapshots the actual loader,
compares bounded values, counts inspection lines without executing a diff, and
writes JSON. It does not alter `tests/cultural-motion.test.mjs` or current runtime
sources. Changed live motion-agent sources do not silently change these results.

The bank data and loader in this bounded study do not exhibit the reported
multi-gigabyte behavior. That finding does not prove complete FjordSide browser
memory stability, GPU/frame cost or device crash recovery, and the test formatter
OOM does not prove a game OOM. Full resident animation/wardrobe/scene ownership,
rendering, real network cancellation and physical iPhone/iPad performance remain
separate integrated acceptance work. Preserve the existing default compact model
textures and use bounded failure diagnostics in future large-asset tests.
