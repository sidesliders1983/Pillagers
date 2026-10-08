# Native lighting desktop costs

Measured runtime commit: 91245e25b092c5feb2ccde18a2c462d36be29bd8; exact file hashes, camera/light/shadow/PMREM metadata, all individual frame intervals and every run summary are retained in hardware-runs.json. Windows 10 Pro 10.0.19045; Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/154.0.0.0 Safari/537.36 Edg/154.0.0.0; renderer: ANGLE (Intel, Intel(R) HD Graphics 630 (0x0000591B) Direct3D11 vs_5_0 ps_5_0, D3D11).

Thirty-six matched runs: current day / preferred low sun / low sun + HDR × Standard / Low × village / dense forest × three repetitions. EZ-Tree, source maps and placement held fixed. 1536×1024 canvas, DPR 1, phase 0, 10-second warmup then 30-second rAF samples per run. All main and shadow draw calls are included (native renderer.info.autoReset=false with per-frame reset).

| View / tier / variant | Runs | Median range (ms) | p95 range (ms) | Calls incl. shadow | Triangles incl. shadow | Geometry / texture count |
| --- | --- | --- | --- | --- | --- | --- |
| village / standard / day | 3 | 36.0–36.0 | 36.1–54.0 | 57.0–57.0 | 3205137.0–3205137.0 | 32.0–32.0 / 63.0–64.0 |
| village / standard / sun | 3 | 36.0–54.0 | 36.1–72.0 | 58.0–58.0 | 3208356.0–3208356.0 | 32.0–32.0 / 63.0–64.0 |
| village / standard / hdr | 3 | 52.8–72.0 | 54.1–90.1 | 58.0–58.0 | 3208356.0–3208356.0 | 32.0–32.0 / 64.0–64.0 |
| village / low / day | 3 | 36.0–36.0 | 36.2–36.2 | 57.0–57.0 | 3156537.0–3156537.0 | 32.0–32.0 / 55.0–55.0 |
| village / low / sun | 3 | 36.0–36.0 | 36.1–36.1 | 58.0–58.0 | 3159756.0–3159756.0 | 32.0–32.0 / 55.0–55.0 |
| village / low / hdr | 3 | 36.0–53.7 | 54.1–70.8 | 58.0–58.0 | 3159756.0–3159756.0 | 32.0–32.0 / 55.0–55.0 |
| forest / standard / day | 3 | 54.0–90.0 | 54.1–126.0 | 57.0–57.0 | 3188746.0–3188746.0 | 34.0–34.0 / 70.0–70.0 |
| forest / standard / sun | 3 | 53.9–89.1 | 54.1–108.0 | 58.0–58.0 | 3191965.0–3191965.0 | 34.0–34.0 / 70.0–70.0 |
| forest / standard / hdr | 3 | 72.0–162.0 | 72.1–180.1 | 58.0–58.0 | 3191965.0–3191965.0 | 34.0–34.0 / 70.0–70.0 |
| forest / low / day | 3 | 54.0–54.0 | 54.1–72.1 | 57.0–57.0 | 3140146.0–3140146.0 | 34.0–34.0 / 59.0–59.0 |
| forest / low / sun | 3 | 53.9–90.0 | 54.1–108.6 | 58.0–58.0 | 3143365.0–3143365.0 | 34.0–34.0 / 59.0–59.0 |
| forest / low / hdr | 3 | 71.9–72.3 | 72.1–90.2 | 58.0–58.0 | 3143365.0–3143365.0 | 34.0–34.0 / 59.0–59.0 |

These are browser presentation/rAF intervals on the existing old development laptop, not isolated GPU timings or measured VRAM. Variation and slow runs are retained. There is no arbitrary millisecond merge gate and no zero-cost lighting claim. The low-sun pilot adds the previously non-casting standalone Meshy person; source scenery and full-detail pine geometry are unchanged. The named HDR adds 1,198,770 delivered bytes only requested when enabled, one retained native PMREM output and no second light or extra steady-state scene-geometry pass (PMREM generation is a one-time native workload before the warmup). Temporary source texture/generator are disposed.

Resource counts depend on which already loaded sources have actually rendered: this fresh EZ-only protocol should not be compared to the 39/73 endpoint after the broader KayKit/EZ/tier capture sequence as though they were identical allocation states. Physical mobile, GPU VRAM and production coverage with ten animated residents remain untested.
