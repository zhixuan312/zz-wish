# One Light — fictional places, visual rounds

Brief: the attachment dated 2026-11-16 asks for ten complete fictional temple settings, one continuous approach into each lamp spot, human scale, living lamplight, six local-time looks, and desktop/phone capture review. The footage bar is a visual acceptance criterion, not something a build or a green test proves.

The starting uncommitted work was preserved first in `0ea2809`. That commit is the source for the frozen baseline at `/tmp/one-light-real-baseline`. Product settlement, privacy, history and statistics remain outside the visual changes in these rounds. No test suites run during iteration, as requested.

## Capture method

`tests/tier2/realism.mjs` drives the actual UI in GPU Chrome with a night clock override. At 1440×900 and 390×844 it saves the cover plus every place's outside view, three points on the unskipped walk, choose view, lit view, smoke and went-out view. Each has a clean scene image and a UI image. UI is hidden only for the clean screenshot; camera, scene and light are unchanged. The phone input uses touch emulation. This is desktop GPU evidence, not physical-phone evidence.

`CAMERA_SPEED=2` accelerates the engine's RAF timestamps for visual capture; wall-time sample points are divided by the same factor. Product burn timing is real. It is not a performance measurement. Desktop baseline used speed 1; phone baseline and subsequent rounds use speed 2. Six additional cover captures use local hours 05, 08, 12, 16, 19 and 23.

Raw artifacts are under `artifacts/realism/` and ignored by Git. `invalid-round0-wrong-server` is excluded: it was captured against another Vite process before the isolated snapshot's actual port was verified. The authoritative baseline uses port 5175 and a separate Vite cache.

## Round 0: what breaks the illusion

Source `0ea2809`; raw views `artifacts/realism/round0/{desktop,phone}/{place}/{phase}.png`. Contact sheets include `desktop-lamps.jpg`, `desktop-walks.jpg`, `mountain-baseline-contact.jpg`, and `contacts/desktop-overview.jpg`.

| Place | Visible failures |
|---|---|
| Pine Gate | Stacked cone pines hide the flight; mismatched gates; pristine box niche, oversized stone joints, no readable soot. |
| Bamboo Rain | Walk ends in an orange wall/post; ruler-flat shelf and floating-looking oil dish; rain reads as broken white strokes. |
| Cloud Cliff | Bare black cliff/flat cloud surface; setting appears abruptly near the end; isolated lantern and uniformly glowing lattice. Cover blur erases the gallery. |
| Lotus Pond | Oversized bridge and flat water; close view excludes pond/reflection; thin petals intersect. |
| Tide | Monumental stacked halls and orange sunset; walk turns toward bare sea; close-up becomes a black box with emissive dots. |
| Snow Roof | Unrelated tower and lamp-orb avenue; featureless red interior; plastic gauze; blue court disappears from close framing. |
| Loess Cliff | Conventional hall/avenue instead of cave court; obstructed walk; orange flat wall; dish contact disappears. |
| High White | Toy mountains, giant burners, luminous rectangular door; orange studio-like corner rather than thick-walled court. |
| Bell Lane | Palace gate/avenue instead of shops; walk obstruction; large flat paving; faceted lantern and radial light spokes. |
| Valley Pagoda | Random tower forest; black walk; floating bowl against blank table; no readable stream/valley. |

## Round 1: review and next changes

The exterior and lamp spot now share a coherent plan in all ten places. Routes run at eye height through physical openings. The cave cliff, lane, stream court, granite shore, white court and pine flight have been rebuilt. The northern hall retains its interior, with a matching snow court. The cliff gallery is supported and has an opening where the approach crosses its rail.

The lamp and environment share depth and shadows instead of compositing a sharp lamp over a blurred scene. Masonry uses world-scale projection, weathering and pores. Nearby box edges are softened; roofs have tile relief; pine/broadleaf/bamboo foliage has individual cutouts. Night sun glow is restrained, stars have small soft points, and cloud depth hides geometry below it. The pond reflects the real scene with restrained ripple distortion. The local clock updates the look while the visitor stays.

Interim shader check: zero page errors, zero console errors, WebGL error 0, context not lost. Interim cover still exposed poor phone framing, which is being corrected before the full round.

Full round 1 coverage completed: 20 place/viewport pairs × 8 phases × scene/UI = 320 images, plus four cover images. `artifacts/realism/round1/report.json` has 162 views and zero horizontal overflows; recorded console errors and WebGL errors are empty/zero. The two original Bamboo failure records remain annotated as resolved after a full desktop retry and successful phone capture. The fix initialized the exterior lamp update list before creating lamps in the outside court.

The rebuilt layouts are a clear improvement, but **round 1 does not meet the footage bar**. Remaining failures are visible in both overview sheets:

- Generic lamp framing still flattens Bamboo/Loess oil dishes edge-on against a wall and crops out their setting. Snow loses the blue court; Tide loses the sea; Valley reads as a dark table.
- Pine's dense canopy obscures the steps; roots on the rising flight need a supporting bank. Many approaches are too dark to read.
- Cloud's expanded hall plinth and right column overlap its walking gallery and cover view. Its short crop hides the hanging rod.
- Lotus has low-detail flowers and intersecting petals; the rail blocks the water and the lamp reflection falls on the bank rather than visible water.
- Contact shadows are brittle black rings; large surfaces still lack convincing close texture.
- The three walk images are nominal wall-time samples. Render/build stalls can delay actual progress, so they do not establish quarter/half/three-quarter spatial positions. Round 2 adds a development-only observable progress signal and captures against it.

Next round: contextual authored views, corrected physical layout/supports, visible pond reflection, softer contact shadows, readable night fill and close material texture. Generated surface assets and their exact prompts are recorded in `web/public/materials/README.md`; they are not in use in round 1.
