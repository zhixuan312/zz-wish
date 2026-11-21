# Cloud Cliff Court route review

## Photograph references

These photographs informed the private preview. The preview uses the repository's Source19 lantern and Poly Haven materials. The released Home landscape remains the reference for the production assets. The photographs are review references rather than scene textures. The local photo comparison copies are under `artifacts/cloud-cliff-route-r2/references/`.

| Photograph | Credit and rights | What to compare |
| --- | --- | --- |
| [Zhuilu Trail 4](https://commons.wikimedia.org/wiki/File:Zhuilu_Trail_4.jpg) | Mx. Granger, 2019. [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). Local copy resized for review. | At 0, 12 and 22 seconds, follow the visible continuous tread beside a fractured inner face. The path should read through the rounded shoulder. |
| [Taroko Gorge from Zhuilu Old Road](https://commons.wikimedia.org/wiki/File:Taroko-Gorge-Zhuilu-Old-Road-2015-Luka-Peternel.jpg) | Luka Peternel, 2015. [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Local copy resized for review. | At 26 seconds, keep a near lip, a valley floor and a distinct opposite slope visible together. The bases of the distant rock masses should meet the descending terrain. |
| [Brass hand lantern, BK-NM-1288](https://commons.wikimedia.org/wiki/File:Handlantaarn_van_messing,_BK-NM-1288.jpg) | Rijksmuseum, photograph credited to Vivian Pawirodikromo in the image metadata. [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). | At 30 seconds, compare where the brass base meets the table, the seam where the glass enters its rim, and how a small worn clasp reads against the darker metal. The reference is for those details of construction and light. |

The component material credits are [Rock Pitted Mossy](https://polyhaven.com/a/rock_pitted_mossy) and [Stone Pavers](https://polyhaven.com/a/stone_pavers), both already listed in the [asset ledger](../assets.json).

## Repeat the capture

Run `node tests/visual/cloud-cliff-route.mjs --check` for the deterministic camera checks. With the S5 lease held, run `node tests/visual/cloud-cliff-route.mjs` from the worktree with the project dependencies available. The review harness binds to loopback, runs Chromium, closes the browser and server, and saves originals, 1:1 crops, a contact sheet, the plan, runtime traces and JSON receipts under `artifacts/cloud-cliff-route-r2/`. The baseline originals remain under `artifacts/cloud-cliff-route/`. The revised route is still a private preview with a static lantern and no product chooser.

## Joined gorge review

The private overlook now uses one indexed terrain mesh for the near wall, ravine floor and opposite strata. The 26-second checkpoint is measured before the lantern enters the view. Each reveal sample must show all three test points on the terrain, with the near rock, platform and canyon triangles included in the occlusion checks. The 22-second trail and 30-second fixture remain part of the same 30-second walk.

Use the full capture to review the 13:00 and 22:00 preview presets on both screen sizes. The round-three capture writes to `artifacts/cloud-cliff-route-r3/`. Its matched 26-second sheet uses the original `bf25422` captures from `artifacts/cloud-cliff-route-r2/`.
