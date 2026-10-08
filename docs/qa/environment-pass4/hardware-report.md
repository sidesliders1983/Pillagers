# Long-protocol desktop diagnosis

Runtime: f6a19b224a614e5307a5c33f6bae7f0f08dfccfe. ANGLE (Intel, Intel(R) HD Graphics 630 (0x0000591B) Direct3D11 vs_5_0 ps_5_0, D3D11). Browser: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/154.0.0.0 Safari/537.36 Edg/154.0.0.0. Canvas 1024×768, DPR 1, phase zero, GrassField OFF. Twenty-four completed runs, each 10s warmup + 30s samples; three repetitions per cell. Ordering alternates baseline/candidate by repetition. Same KayKit, Meshy village/person, light, camera and water. Baseline changes only ground to v0.2; it is not a whole historical release comparison.

| View | Quality / ground | Median ms (3 runs) | p95 ms (3 runs) | Calls | Triangles | Geometries / textures |
| --- | --- | --- | --- | --- | --- | --- |
| village | standard / baseline | 16.7 / 16.7 / 16.7 | 16.8 / 16.8 / 16.8 | 26 | 359202 | 26 / 34 |
| village | standard / regional | 16.7 / 16.7 / 16.7 | 16.8 / 16.8 / 16.8 | 33 | 354522 | 33 / 61 |
| village | low / baseline | 16.7 / 16.7 / 16.7 | 16.8 / 16.8 / 16.8 | 26 | 310602 | 26 / 34 |
| village | low / regional | 16.7 / 16.7 / 16.7 | 16.8 / 16.8 / 16.8 | 33 | 305922 | 33 / 52 |
| forest | standard / baseline | 16.7 / 16.7 / 16.7 | 16.8 / 16.8 / 17.0 | 23 | 338916 | 26 / 34 |
| forest | standard / regional | 16.7 / 16.7 / 16.7 | 16.8 / 16.8 / 16.8 | 31 | 334492 | 34 / 64 |
| forest | low / baseline | 16.7 / 16.7 / 16.7 | 16.8 / 16.8 / 16.8 | 23 | 290316 | 26 / 34 |
| forest | low / regional | 16.7 / 16.7 / 16.7 | 16.8 / 16.8 / 16.8 | 31 | 285892 | 34 / 54 |

Summaries of all 24 completed runs are retained in [run measurements](hardware-measurements.json), including median/p95, frame count, duration, renderer statistics and fixture. Individual frame intervals and per-frame outliers were not saved and cannot be reconstructed from this file. These are rAF presentation intervals, including host/display scheduling, not separate CPU execution or GPU timers. No causal claim follows from equal capped timings. The owner specifically declined blocking developer-Lab delivery on a few milliseconds from this old laptop; the old proposed 33.3ms number is not a hard gate. Earlier short Ground v0.4 measurements are unchanged historical records, not replaced by these healthier runs. No physical mobile or measured-VRAM result is claimed.

Native regional partitioning changes draw-call and visible triangle counts; it retains canonical terrain coordinates and does not mean the geometry is simplified. Standard/Low regional delivery is 18,864,090 / 598,386 bytes; calculated regional RGBA8+mip upper bounds are 192 / 32 MiB, not renderer memory measurement. Shared water, nature, houses and comparison maps add costs outside those figures.
