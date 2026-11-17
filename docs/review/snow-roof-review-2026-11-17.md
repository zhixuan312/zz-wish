# Snow Roof Court: full journey review (2026-11-17)

> **Round 1 verification update — 2026-11-18.** Original findings/targets and owner C7/B5/C8 remain intact. The final Source18/Cloud19 functional journey is terminal: **788 frames, 380 sequences, 208 contact/detail views, 16 ending windows, all eight UI contexts, zero runtime/HTTP errors and unchanged source**. This closes supported functional/pacing/UI work, not the photorealism bar. Fresh visual findings are appended as J1–J22; unresolved appearance and owner listening remain open.

The delivered checkpoint is `3f5a631`. Snow is **14,970,553 bytes** with 16×64 fixed Metal/OIDN maps and 47 strict source/prepared/raw/decoded contact groups. Cloud19 is **7,565,880 bytes** with 12×64 Metal/OIDN maps, 18 resting+6 hanging contacts and 149,882 bytes of actual-app posters. Owner-selected Cloud19 is retained; Source20 was explicitly cancelled. Round 2 candidates do not replace the delivered assets merely by existing.

Chromium clean motion is valid. Native WebKit recordings are rejected black captures; valid replacement motion is `artifacts/full-review/round-1/after-motion-webkit-jpeg-r5/`: 8 FPS-target real JPEGs with native timestamps, encoded on a25 FPS repeated-frame grid, with no interpolated motion and **no product-FPS claim**. Original recorder/encoder failures stay preserved. The supplemental Source18 C6/altar triptych/B5 run is also terminal: 38 actual frames, zero errors, unchanged source. See [the concise verification record](../evidence/full-review/round1-verification.md).

The 12 isolated phone-emulation timing windows pass their recorded validity checks: cover 51.55/52.11 FPS, Snow outside/choose ≈ 60, normal/restored burn ≈ 30 and saver ≈ 15. Earlier desktop Cloud ≈ 20.1 FPS remains a limit. No physical phone, physical WebKit touch strokes, real-duration endurance burn, owner audio listening or complete photorealistic acceptance is claimed. Full report: `artifacts/full-review/round-1/after-journey/report.json`.

A stranger's pass over the whole journey on commit `7020526` plus the floating-props fix in progress.
Sources: the final captures in `artifacts/snow-journey/final-contact/{desktop-en,phone-zh}/`, the
resting-props captures in `artifacts/snow-resting-props/`, the code, and the owner's own play on a Mac.
Paths below are relative to those capture folders unless they start with the repo root.

Every item has an ID. When you work through this file, keep it as the checklist: add a line under each
item with its status (`done`, `partly`, `not done`) and the before/after capture paths. Do not delete
items. If you disagree with an item, say why under it instead of skipping it.

Priority: **P1** breaks the illusion or the flow for most people; **P2** clearly visible to a stranger;
**P3** polish. Tier follows the project rule: T1 = something missing, broken or unreachable; T2 = how it
looks, feels or how fast it is.

---

## A. Pacing (P1, T2)

The owner played it on a Mac and found it slow. From "Step inside" to a settled burning lamp is about
70 s of camera motion. On a second visit people will reach for Skip.

The table's Now column records the original baseline; the status notes below record delivered behavior.

| ID | Segment | Where | Now | Target |
|----|---------|-------|-----|--------|
| A1 | Walk: snowfield, gate, court, terrace, into the hall | `snow-roof-baked.js` `walkSeconds` | 46 s for ~40 m, ~0.9 m/s | 30 s, ~1.35 m/s, a calm normal walk; keep the short start/stop ramps |
| A2 | Close-up before confirm | `scene.js` `closeUp()` | 2.6 s | Gone with the confirm step (F12); the move toward the lantern becomes the start of ignition |
| A3 | Back to choosing | `backToChoose()` | 1.6 s | Gone with the confirm step (F12) |
| A4 | Taper approach, contact, catch, retreat | first tween in `ignite()` | 3.8 s | 3.2 s; keep the contact, catch and settling unhurried, cut approach and retreat |
| A5 | Still hold after the catch | `tween(2,()=>{})` | 2 s | 0.8 s |
| A6 | Route to the burning view | `tween(16,…)` | 16 s | 9 s on the new route (B) |
| A7 | Black fades | `fadeTo` default | 900 ms | 600 ms; scale the others the same way |
| A8 | "Going to Snow Roof Court / Red gauze lantern" title | `walk-1/2/3.png` | Stays over the whole walk, covering the gate roof and later the hall doors | Fade in at the start of the walk, hold ~3 s, fade out; nothing covers the doorway as you approach |

Round 1 pacing verification (implementation and real flow complete; scene visuals remain separately scoped):

- **A1: done** — 30-second walk and elapsed-wall-time tweens are verified in the final journey and clean motion; the particle stability cap no longer stretches camera travel. Before: `artifacts/snow-journey/final-contact/desktop-en/walk-1.png`. After: `artifacts/full-review/round-1/after-journey/chromium/desktop-en/walk-1.png`. The terminal eight-context report is `artifacts/full-review/round-1/after-journey/report.json`.

- **A2: done** — The separate closeUp/confirm move is removed; the real UI goes from choosing into ignition. Before: `artifacts/snow-journey/final-contact/desktop-en/confirm.png`. After: `artifacts/full-review/round-1/after-journey/chromium/desktop-en/light-ignition.png`. The terminal eight-context report is `artifacts/full-review/round-1/after-journey/report.json`.

- **A3: done** — The separate confirm/backToChoose path is removed; direct choice, lighting and back navigation work in all eight contexts. Before: `artifacts/snow-journey/final-contact/desktop-en/confirm.png`. After: `artifacts/full-review/round-1/after-journey/chromium/desktop-en/choose.png`. The terminal eight-context report is `artifacts/full-review/round-1/after-journey/report.json`.

- **A4: done** — The taper/contact/catch/retreat sequence uses 3.2 seconds and completes in the real final flow. Before: `artifacts/snow-journey/final-contact/desktop-en/ignition-igniting.png`. After: `artifacts/full-review/round-1/after-journey/chromium/desktop-en/light-igniting.png`. The terminal eight-context report is `artifacts/full-review/round-1/after-journey/report.json`.

- **A5: done** — The post-catch hold is .8 seconds; final motion preserves catch then settling. Before: `artifacts/snow-journey/final-contact/desktop-en/ignition-spreading.png`. After: `artifacts/full-review/round-1/after-journey/chromium/desktop-en/light-spreading.png`. The terminal eight-context report is `artifacts/full-review/round-1/after-journey/report.json`.

- **A6: done** — The settling move is nine seconds, using the final desktop/phone routes. This closes the pacing change; composition issues remain B5/J5. Before: `artifacts/snow-journey/final-contact/desktop-en/ignition-walking.png`. After: `artifacts/full-review/round-1/after-journey/chromium/desktop-en/light-walking.png`. The terminal eight-context report is `artifacts/full-review/round-1/after-journey/report.json`.

- **A7: done** — 600 ms default/scaled fades and the reduced-motion path are implemented; the final journeys transition successfully. Before: `artifacts/snow-journey/final-contact/desktop-en/place.png`. After: `artifacts/full-review/round-1/after-journey/chromium/desktop-en/place.png`. The terminal eight-context report is `artifacts/full-review/round-1/after-journey/report.json`.

- **A8: done** — The walk title uses .4 s in, 3 s hold and .6 s out; the final walking evidence is no longer an all-walk title overlay. Before: `artifacts/snow-journey/final-contact/desktop-en/walk-3.png`. After: `artifacts/full-review/round-1/after-journey/chromium/desktop-en/walk-3.png`. The terminal eight-context report is `artifacts/full-review/round-1/after-journey/report.json`.

Total target: about 40 s to a settled burning lamp, still one continuous move with no cut or pop.

## B. Burning view (P1, T2)

`burning.png`, `burning-restored-detail.png`, phone `burning.png`.

- **B1** The camera stands behind the lantern facing the doors. Two thirds of the frame is a flat dark
  plank wall. The lantern is about 3% of the frame and sits under the title like an icon. The scanned
  screen, altar, small lamps and burner, the best things in the room, are behind the camera. The blue
  court is a thin slot.

  Round 1 — **partly**. Final Source18 diagonal views are captured, but the fresh review still finds the desktop lantern small/high with too much floor (J5), and phone stand alignment remains B5. Photorealistic hierarchy is open. Before: `artifacts/snow-journey/final-contact/desktop-en/burning.png`. After: `artifacts/full-review/round-1/after-journey/chromium/desktop-en/burning.png`. The terminal eight-context report is `artifacts/full-review/round-1/after-journey/report.json`.

- **B2** The spread view (`ignition-spreading.png`, the best frame in the game) lasts 2 s; the camera
  then walks 16 s to the weakest frame and parks there for up to 24 hours.
- **Target**: stand by a side column, slightly forward, and look diagonally across the hall so one
  frame holds the person's lantern in the foreground at 20-25% of frame height (upper third, clear of
  title and controls), the altar, screen, small lamps and burner warmed by it on one side, and the open
  doors with the blue snow court and drifting flakes on the other. No flat surface fills more than a
  quarter of the frame. Phone: lantern and altar first, a sliver of doorway if it fits. `burnFar` and
  `burnWalk` follow the same idea. The route there is a smooth arc that never passes through a column,
  cord or lantern.

  Round 1 — **partly**. The nine-second spread-to-burn transition is verified. Final subject scale, floor balance and independent hanging silhouette remain open under B5/J1/J5. Before: `artifacts/snow-journey/final-contact/desktop-en/ignition-spreading.png`. After: `artifacts/full-review/round-1/after-journey/chromium/desktop-en/burnFar.png`. The terminal eight-context report is `artifacts/full-review/round-1/after-journey/report.json`.

- **B3** The result screens (`result-went-out.png`, `result-burned-down-accelerated.png`) reuse the same
  door-facing frame, almost black, with the dead lantern barely visible. After the change they should
  show the lantern and altar in the new composition, cooled.

  Round 1 — **partly**. Both cooled results are captured in all eight contexts. Their functional settlement passes; the lantern becoming a black cutout remains J2. Before: `artifacts/snow-journey/final-contact/desktop-en/result-went-out.png`. After: `artifacts/full-review/round-1/after-journey/chromium/desktop-en/result-put-out.png`. The terminal eight-context report is `artifacts/full-review/round-1/after-journey/report.json`.

## C. The person's lantern (P1, T2)

- **C1** Lit, it reads as a clean orange-red graphic with black stripes, no gradient
  (`burning.png`, `ignition-walking.png`). Make it real red gauze: translucent glow from the flame,
  brighter near the flame and falling off toward top and bottom; bamboo ribs as darker lines through
  the gauze; slightly uneven weave and colour; dark lacquered rims; a tassel with real threads; a slow
  sway on the cord with its shadow swaying too.

  Round 1 — **partly**. Actual photographed cloth/ribs/threads/suspension are delivered and captured. Cord air gap, regular/plastic shade and flat gradient remain J1/J3/C8; do not mark material realism complete. Before: `artifacts/snow-journey/final-contact/desktop-en/lamp-preset.png`. After: `artifacts/full-review/round-1/after-journey/chromium/desktop-en/burning.png`. The terminal eight-context report is `artifacts/full-review/round-1/after-journey/report.json`.

- **C2** Unlit, while choosing and confirming (`lamp-preset.png`, `lamp-24-hours.png`, `confirm.png`),
  it is a dark smooth red solid in a near-black room. The person chooses shape and colour without
  seeing either. Give the choosing views enough ambient and a soft rim so the unlit gauze, its colour
  and its shape read clearly, while still feeling like night.

  Round 1 — **partly**. Unlit choosing is fully captured and functional, but the black cutout and red pop during approach remain J2. The new interior/view alone did not close this visual item. Before: `artifacts/snow-journey/final-contact/desktop-en/lamp-preset.png`. After: `artifacts/full-review/round-1/after-journey/chromium/desktop-en/choose.png`. The terminal eight-context report is `artifacts/full-review/round-1/after-journey/report.json`.

- **C3** Thumbnails (shape picker, My Lamps) show a glowing lit lantern with a bright amber core; the
  3D lamp in the same moment is unlit and dark, and looks different. Thumbnails must match the 3D lamp
  in shape, colour, material and state (unlit in the picker; extinguished for lamps that went out or
  burned down in My Lamps).

  Round 1 — **partly**. Real3D state-aware thumbnails are exercised in picker and records. Final appearance matching is still judged alongside J2/J3 rather than inferred from the shared builder. Before: `artifacts/snow-journey/final-contact/desktop-en/lamp-preset.png`. After: `artifacts/full-review/round-1/after-journey/chromium/desktop-en/my-lamps.png`. The terminal eight-context report is `artifacts/full-review/round-1/after-journey/report.json`.

- **C4** At confirm (`confirm.png`) the lantern is small and dark. The confirm step goes (F12); the
  choose view itself must show the lantern large and clear enough to judge shape and colour.

  Round 1 — **partly**. The confirm screen is gone and the physical choose fit is captured. The unlit readability problem remains J2, so the visual criterion is still open. Before: `artifacts/snow-journey/final-contact/desktop-en/confirm.png`. After: `artifacts/full-review/round-1/after-journey/chromium/desktop-en/choose.png`. The terminal eight-context report is `artifacts/full-review/round-1/after-journey/report.json`.

- **C5** Endings: burned down must visibly differ from went out. Burned down: the flame shrinks,
  gutters, a last thread of smoke, the gauze glow cools slowly. Went out: sudden, a puff of smoke.
  Today both end on the same near-black frame (`went-out-smoke.png`, `natural-ember-accelerated.png`).

  Round 1 — **partly**. All 16 actual 12-second natural/put-out plume windows are recorded and both real product endings settle correctly. Readable cooling/smoke differences remain visual review, especially the black ended shade in J2; accelerated completion is not an endurance burn. Before: `artifacts/snow-journey/final-contact/desktop-en/went-out-smoke.png`. After: `artifacts/full-review/round-1/after-journey/chromium/desktop-en/result-burned-down.png`. The terminal eight-context report is `artifacts/full-review/round-1/after-journey/report.json`.

## D. The altar and the hall interior (P1-P2, T2)

- **D1 (P1)** The four small altar lamps and the brass burner are smooth grey plastic with faceted
  silhouettes and token feet (`artifacts/snow-resting-props/resting-props-before/desktop-en/altar-left-contact.png`,
  `art/build/snow-roof-resting-contacts-native-preview/desktop-en/altar-burner-contact.png`).
  Remake as old cast bronze: round silhouettes, cast rims and bands, real legs and handles on the
  burner, worn bright high points, dark recesses and patina, soot above the wicks, oil stains, spilled
  ash. Keep the corrected contacts, rerun the contact audit.

  Round 1 — **partly**. All47 source/prepared/raw/decoded contacts pass and final altar closeups exist. Disconnected burner handles, fan-like ash and identical rods remain J8; numeric contacts do not accept bronze realism. Before: `artifacts/snow-resting-props/resting-props-before/desktop-en/altar-left-contact.png`. After: `artifacts/full-review/round-1/after-journey/chromium/desktop-en/detail-contact-altar-burner-assembly.png`. The terminal eight-context report is `artifacts/full-review/round-1/after-journey/report.json`.

- **D2 (P2)** "Others' lamps" are four identical lamps in a mirror-symmetric row. Make them read as lit
  by different people: different sizes and kinds, different fuel levels, one or two already out with a
  blackened wick, wax or oil drips, an offering or two. Not symmetric.

  Round 1 — **partly**. Unequal fixtures, fuel levels and the spent cup are delivered and visible in the final altar frames. General material/readability remains open; all seven measured source states/anchors are retained. Before: `artifacts/snow-journey/final-contact/desktop-en/burning.png`. After: `artifacts/full-review/round-1/after-journey/chromium/desktop-en/detail-contact-altar-minus-0-95.png`. The terminal eight-context report is `artifacts/full-review/round-1/after-journey/report.json`.

- **D3 (P2)** The whole interior is under-exposed in choose and confirm (`lamp-preset.png`,
  `confirm.png`): the screen, beams and columns are barely visible. The brief asked for warm red
  columns, painted beams and bracket sets; in captures the columns read dark brown/black and the
  beams as thin gold lines. Raise the authored ambient and fixture contribution so the hall reads as a
  hall at night, not a black box.

  Round 1 — **partly**. Source18 room .9 W/door .6 W, paint normal .03, hall-floor diffuse3× and explicit view exposure are delivered. Black unlit shade and dark small props remain J2/J12; final hall realism is not closed. Before: `artifacts/snow-journey/final-contact/desktop-en/lamp-preset.png`. After: `artifacts/full-review/round-1/after-journey/chromium/desktop-en/choose.png`. The terminal eight-context report is `artifacts/full-review/round-1/after-journey/report.json`.

- **D4 (P2)** Side walls are flat dark plaster with no structure; the ceiling is a flat plank plane with
  a few diamond outlines. Add the structure the brief named: painted beams with readable colour,
  ceiling panels, bracket sets at column heads, soot above the lamps, dust in the air.

  Round 1 — **partly**. Actual framing/brackets/coffers and source dust remain delivered. Fresh blue seam holes are J11 and broad scene artificiality is J13; final detail frames now exist. Before: `artifacts/snow-journey/final-contact/desktop-en/burning.png`. After: `artifacts/full-review/round-1/after-journey/chromium/desktop-en/detail-painted-beams-and-brackets.png`. The terminal eight-context report is `artifacts/full-review/round-1/after-journey/report.json`.

- **D5 (P2)** The altar top shows a blotchy, stretched-looking reflection
  (`resting-props-before/desktop-en/altar-left-contact.png`). Check the scanned table's roughness and
  UVs; it should read as worn lacquer.

  Round 1 — **partly**. The scanned lacquer material is delivered with declared precision and its final low view exists; material realism still needs judgment. Before: `artifacts/snow-resting-props/resting-props-before/desktop-en/altar-left-contact.png`. After: `artifacts/full-review/round-1/after-journey/chromium/desktop-en/detail-contact-scanned-console-altar.png`. The terminal eight-context report is `artifacts/full-review/round-1/after-journey/report.json`.

- **D6 (P3)** Incense smoke over the burner is barely visible; give it a thin, slow, readable thread.

  Round 1 — **partly**. Source-tip-aligned live incense is captured, but the rods/ash arrangement and smoke readability remain part of J8. Before: `artifacts/snow-journey/final-contact/desktop-en/burning.png`. After: `artifacts/full-review/round-1/after-journey/chromium/desktop-en/detail-contact-smouldering-incense-0.png`. The terminal eight-context report is `artifacts/full-review/round-1/after-journey/report.json`.

- **D7 (P2; found during Round 1 integration)** Bright orange patches on the painted beams and columns read as starbursts rather than wood under soft fixture light. Actual fixture-specular, all-specular and paint-normal controls leave these patches unchanged. Native diffuse EXRs already contain the variation; eight-sample variance and per-chart OIDN spread it before delivery encoding.

  Round 1 — **partly**. Source18 uses reduced paint normal .03 and a fresh all 16 fixed64 Metal/OIDN batch. Final beam/static sequences exist; the earlier Source17 mixed-map experiments are historical. Do not describe the old256 diagnostic as the current batch or infer visual convergence without inspection. Before: `artifacts/full-review/round-1/snow17-material-controls/burning-baseline.png`. After: `artifacts/full-review/round-1/after-journey/chromium/desktop-en/detail-painted-beams-and-brackets.png`. The terminal eight-context report is `artifacts/full-review/round-1/after-journey/report.json`.

## E. Exterior: snowfield, gate, court, hall facade (P2, T2)

- **E1** The single line of footprints the brief asks for does not read in `place.png` or `walk-1.png`;
  the snowfield is uniform noise. Footprints must be clearly visible from the place view and while
  walking, leading through the gate.

  Round 1 — **partly**. Actual footprints are delivered and the final place/walk frames exist; wide-view readability remains a visual judgment. Before: `artifacts/snow-journey/final-contact/desktop-en/place.png`. After: `artifacts/full-review/round-1/after-journey/chromium/desktop-en/walk-1.png`. The terminal eight-context report is `artifacts/full-review/round-1/after-journey/report.json`.

- **E2** Gate and court walls are large flat dark boxes with uniform plaster (`place.png`, `walk-1.png`):
  no base course, no coping tiles on the wall tops, no weathering, no drifts against them. The side
  roofs behind the wall look like separate half-roofs resting on it.

  Round 1 — **partly**. Base courses, coping, weathering and supported roofs are delivered; final exterior realism remains open. Before: `artifacts/snow-journey/final-contact/desktop-en/place.png`. After: `artifacts/full-review/round-1/after-journey/chromium/desktop-en/place.png`. The terminal eight-context report is `artifacts/full-review/round-1/after-journey/report.json`.

- **E3** Trees are sparse stick figures cut by the frame edges, placed symmetrically
  (`place.png`). Bare winter trees need real branching, snow on branches, varied sizes and positions;
  add far roofs and a far treeline so the court is not alone in a blank field.

  Round 1 — **partly**. Trees and background layers are delivered, but angular/game-like silhouettes remain J13. Before: `artifacts/snow-journey/final-contact/desktop-en/place.png`. After: `artifacts/full-review/round-1/after-journey/chromium/desktop-en/place.png`. The terminal eight-context report is `artifacts/full-review/round-1/after-journey/report.json`.

- **E4** Snow on roofs is a thin uniform slab; eaves read as a row of identical round dots.
  Soft caps with thickness and overhang, drifts, icicles that read.

  Round 1 — **partly**. Real closed snow/roof geometry and fresh hidden-face proofs are delivered; game-like snow/sky remains J13. Before: `artifacts/snow-journey/final-contact/desktop-en/place.png`. After: `artifacts/full-review/round-1/after-journey/chromium/desktop-en/walk-3.png`. The terminal eight-context report is `artifacts/full-review/round-1/after-journey/report.json`.

- **E5** Walking through the gate (`walk-2.png`) about half the frame is pure black gate passage.
  Light the passage a little from the gate lamps and the court so it has form.

  Round 1 — **partly**. The passage lighting is delivered and walk-2 is captured. Gate bloom overpowering the bowl/flame remains J6. Before: `artifacts/snow-journey/final-contact/desktop-en/walk-2.png`. After: `artifacts/full-review/round-1/after-journey/chromium/desktop-en/walk-2.png`. The terminal eight-context report is `artifacts/full-review/round-1/after-journey/report.json`.

- **E6** Hall facade (`walk-3.png`): large flat dark green-grey wall panels, lattice windows filled with
  blotchy blue noise instead of paper, columns not red, no visible eave overhang or painted beam
  ends. The doors are narrow for a main hall. The snow banks beside the steps are smooth blobs with
  faceted edges. This is the last frame before entering and should be one of the strongest.

  Round 1 — **partly**. The facade and actual built doors are delivered/captured; hollow stair risers remain J10, so the last approach is not visually accepted. Before: `artifacts/snow-journey/final-contact/desktop-en/walk-3.png`. After: `artifacts/full-review/round-1/after-journey/chromium/desktop-en/walk-3.png`. The terminal eight-context report is `artifacts/full-review/round-1/after-journey/report.json`.

- **E7** A white snow blob sits in the doorway seen from the place view (`place.png`, phone
  `place.png`); it reads as an object, not snow on the steps.

  Round 1 — **partly**. Continuous stair-edge snow is delivered. The final closeup exposes hollow risers (J10), which must be corrected as construction. Before: `artifacts/snow-journey/final-contact/desktop-en/place.png`. After: `artifacts/full-review/round-1/after-journey/chromium/desktop-en/detail-continuous-step-snow.png`. The terminal eight-context report is `artifacts/full-review/round-1/after-journey/report.json`.

- **E8** The court itself is empty: no stone lantern, no incense stand, no swept path, no trees. Give it
  the few things a real court has.

  Round 1 — **partly**. The court objects have verified contacts and final closeups. Faceted/hot court stone lantern remains J7. Before: `artifacts/snow-journey/final-contact/desktop-en/place.png`. After: `artifacts/full-review/round-1/after-journey/chromium/desktop-en/detail-contact-court-lantern-oil-cup.png`. The terminal eight-context report is `artifacts/full-review/round-1/after-journey/report.json`.

- **E9** The doorway seen from inside (`burning.png`): the angled door leaves and a flat pale-blue
  trapezoid above them make it look like a cut-out. Check the door leaf geometry and what fills the
  space above them.

  Round 1 — **partly**. Built jambs/transom/door leaves and the real court opening are delivered. Final doorway detail exists; no flat blue doorway plane is introduced. Before: `artifacts/snow-journey/final-contact/desktop-en/burning.png`. After: `artifacts/full-review/round-1/after-journey/chromium/desktop-en/detail-doorway-built-frame.png`. The terminal eight-context report is `artifacts/full-review/round-1/after-journey/report.json`.

- **E10** Codex's own open items from `docs/evidence/snow-journey/remaining-visual-limits.md`: the grey
  seam where snow meets the base, distance and trees. Carry them here.

  Round 1 — **partly**. The old seam/distance/tree limits remain carried forward. New explicit holes and scene artificiality are J10/J11/J13; they are not erased by contact proofs. Before: `artifacts/snow-journey/final-contact/desktop-en/place.png`. After: `artifacts/full-review/round-1/after-journey/chromium/desktop-en/detail-wall-base-snow.png`. The terminal eight-context report is `artifacts/full-review/round-1/after-journey/report.json`.

## F. UI and flow (P1-P3, T1/T2)

- **F1 (P1, T1)** Empty wish: "Set my wish" is disabled with nothing telling the person why. Keep it
  enabled-looking enough to tap, and on tap with an empty wish show an inline hint at the field; or
  show the hint under the field. The disabled gold button on dark (`home.png`, phone `home.png`) is
  barely readable.

  Round 1 — **done (UI/flow scope)**. Empty wish now produces the inline hint and field focus in all eight UI contexts. Before: `artifacts/snow-journey/final-contact/desktop-en/home.png`. After: `artifacts/full-review/round-1/after-journey/chromium/desktop-en/wish-empty-inline.png`. The terminal eight-context report is `artifacts/full-review/round-1/after-journey/report.json`.

- **F2 (P1, T1)** After "Set my wish", "Step inside" is disabled for 1-4 s while the place loads, with
  no sign of progress. Show loading progress (the 59 MB package makes this long on a phone) and make
  the button state obvious.

  Round 1 — **done (UI/flow scope)**. Final-source prefetch/loading/preparation/ready states and entry work in all eight contexts. Earlier checksum Retry fault controls stay scoped to their recorded source. Keep Step inside: owner F2 explicitly retains the entry preview/progress action; see the disagreement under J14. Before: `artifacts/snow-journey/final-contact/desktop-en/home.png`. After: `artifacts/full-review/round-1/after-journey/chromium/desktop-en/wish-loading.png`. The terminal eight-context report is `artifacts/full-review/round-1/after-journey/report.json`.

- **F3 (P2)** Buttons wrap their labels: "Take this one · / 30 min", "Light it · 10 / min", "Back to
  the / court", "Make a new / wish" (`lamp-preset.png`, `confirm.png`, `result-went-out.png`). Labels
  stay on one line; shorten copy or widen buttons.

  Round 1 — **done (UI/flow scope)**. The terminal 788-frame report finds zero button wrapping/overflow across both languages/sizes/browsers. New long-wish truncation is tracked separately as J16. Before: `artifacts/snow-journey/final-contact/desktop-en/lamp-preset.png`. After: `artifacts/full-review/round-1/after-journey/chromium/phone-zh/choose.png`. The terminal eight-context report is `artifacts/full-review/round-1/after-journey/report.json`.

- **F4 (P2)** Burning controls (Mute, Save power, Hide wish, Show time left, Put out) are 13 px plain
  text, several wrap to two lines, and they do not look tappable (`burning.png`). Make them one line,
  legible, clearly controls, and keep them from covering the scene's subject. Consider fading them
  after a few seconds without input and back on tap or mouse move.

  Round 1 — **done (UI/flow scope)**. Button targets/states, mute, save-power and restored detail work in the full UI flow; controls fade and return on input. This closes the control implementation/layout, not the scene visual bar. Before: `artifacts/snow-journey/final-contact/desktop-en/burning.png`. After: `artifacts/full-review/round-1/after-journey/chromium/desktop-en/sound-muted.png`. The terminal eight-context report is `artifacts/full-review/round-1/after-journey/report.json`.

- **F5 (P2)** The wish text in burning sits over the altar and lamps (`ignition-walking.png`,
  phone `ignition-spreading.png`); in the new burning view it must not cover the lantern, altar lamps
  or doorway.

  Round 1 — **done (UI/flow scope)**. Wish/control placement moved to the lower HUD and final layouts are captured without reported overlap/overflow. Long Chinese wish truncation without an ellipsis remains J16. Before: `artifacts/snow-journey/final-contact/desktop-en/ignition-walking.png`. After: `artifacts/full-review/round-1/after-journey/chromium/phone-zh/burning.png`. The terminal eight-context report is `artifacts/full-review/round-1/after-journey/report.json`.

- **F6 (P2)** The choose panel jumps vertically between states because it is vertically centred
  (title at y=215, 254 and 182 in `lamp-preset.png`, `lamp-drawn.png`, `lamp-24-hours.png`). Anchor it so
  switching tabs or durations does not move the panel.

  Round 1 — **done (UI/flow scope)**. Preset/colour/drawing/duration states and anchored choose layout complete in all eight contexts. The separate narrow phone drawing target remains J15. Before: `artifacts/snow-journey/final-contact/desktop-en/lamp-preset.png`. After: `artifacts/full-review/round-1/after-journey/chromium/phone-zh/choose-24-hours.png`. The terminal eight-context report is `artifacts/full-review/round-1/after-journey/report.json`.

- **F7 (P3)** The wish textarea has no inner padding: typed text touches the left border
  (`wish-written.png`).

  Round 1 — **done (UI/flow scope)**. Typed text padding and inline field styling are implemented and captured in English/Chinese. Before: `artifacts/snow-journey/final-contact/desktop-en/wish-written.png`. After: `artifacts/full-review/round-1/after-journey/chromium/phone-zh/wish-written.png`. The terminal eight-context report is `artifacts/full-review/round-1/after-journey/report.json`.

- **F8 (P3)** Burning UI appears before the flame is lit ("With you 0 min", `ignition-igniting.png`).
  Bring it in after the catch.

  Round 1 — **done (UI/flow scope)**. The UI catch gate is exercised by real ignition in all eight contexts; burning metadata appears after catch. Before: `artifacts/snow-journey/final-contact/desktop-en/ignition-igniting.png`. After: `artifacts/full-review/round-1/after-journey/chromium/desktop-en/light-spreading.png`. The terminal eight-context report is `artifacts/full-review/round-1/after-journey/report.json`.

- **F9 (P3)** The opening corner bracket of the wish on confirm has a stray leading gap
  (`confirm.png`).

  Round 1 — **done (UI/flow scope)**. The separate confirm quotation and its leading-gap surface were removed with that screen. Before: `artifacts/snow-journey/final-contact/desktop-en/confirm.png`. After: `artifacts/full-review/round-1/after-journey/chromium/desktop-en/choose.png`. The terminal eight-context report is `artifacts/full-review/round-1/after-journey/report.json`.

- **F10 (P3)** Skip is a small grey box in the corner (`walk-1.png`); make it match the rest of the UI.

  Round 1 — **done (UI/flow scope)**. Skip is a normal product control and is exercised by the final UI driver; clean motion separately covers uninterrupted walking. Before: `artifacts/snow-journey/final-contact/desktop-en/walk-1.png`. After: `artifacts/full-review/round-1/after-journey/chromium/desktop-en/walk-1.png`. The terminal eight-context report is `artifacts/full-review/round-1/after-journey/report.json`.

- **F12 (P1, T2)** Drop the separate confirm step (`confirm.png`, "It's in place, waiting for you" with
  Look again / Light it). Choosing and lighting are one step: the choose panel's primary button is
  "Light it · 30 min" and lights the lamp directly. Move what the confirm screen carried into the choose
  panel: one line of the rule just above the button (leaving puts it out, it cannot be relit), the
  extra note for 12 h and longer, and any light error inline. The camera move toward the lantern
  (`closeUp()`) becomes the first beat of ignition. Delete the confirm screen, its copy in both
  languages, `toConfirm`, `backToCandle` and `backToChoose()`, and their tests; nothing keeps the old path.

  Round 1 — **done (UI/flow scope)**. Direct Light it flow, inline rule/long-duration note and actual product settlement work in every final UI context; the old separate confirm path is gone. Before: `artifacts/snow-journey/final-contact/desktop-en/confirm.png`. After: `artifacts/full-review/round-1/after-journey/chromium/desktop-en/choose-24-hours.png`. The terminal eight-context report is `artifacts/full-review/round-1/after-journey/report.json`.

- **F11 (P3)** Result copy is clunky: "With you 1 min of 10 min. Out, and it cannot be relit." Rewrite
  both endings' copy in English and Chinese so it reads as a person would say it.

  Round 1 — **done (UI/flow scope)**. Both localized result-copy paths are exercised and captured. Their functional/copy update is complete; ended-lantern appearance remains J2. Before: `artifacts/snow-journey/final-contact/desktop-en/result-went-out.png`. After: `artifacts/full-review/round-1/after-journey/chromium/phone-zh/result-went-out.png`. The terminal eight-context report is `artifacts/full-review/round-1/after-journey/report.json`.

## G. My Lamps and Ten Lights with one place (P2, T2)

- **G1** Ten Lights (`ten-lights.png`) says the same thing twice: the summary row and a "Snow Roof Court"
  section repeat the same numbers, and the bottom half is empty. With one visible place, show one
  well-designed section for this court.

  Round 1 — **done (UI scope)**. The consolidated single-court statistics panel is captured in both languages/sizes/browsers; the repeated section is removed. Before: `artifacts/snow-journey/final-contact/desktop-en/ten-lights.png`. After: `artifacts/full-review/round-1/after-journey/chromium/desktop-en/ten-lights.png`. The terminal eight-context report is `artifacts/full-review/round-1/after-journey/report.json`.

- **G2** My Lamps (`my-lamps.png`): "Went out · not burned down" is redundant; "Ended because another
  view was opened" is technical; date ranges repeat the date ("17 Nov 2026, 03:37 – 17 Nov 2026,
  03:38"); the "Snow Roof Court" sub-label under the title is redundant with one place; every row
  repeats a "Light a new one for this wish" link. Tighten the copy and the row design, both languages.

  Round 1 — **done (UI scope)**. Localized compact rows/date ranges and record expansion work in all eight contexts. Functional/copy layout is complete; the separate long-wish clipping issue remains J16. Before: `artifacts/snow-journey/final-contact/desktop-en/my-lamps.png`. After: `artifacts/full-review/round-1/after-journey/chromium/desktop-en/record-expanded.png`. The terminal eight-context report is `artifacts/full-review/round-1/after-journey/report.json`.

- **G3** Thumbnails: see C3.

  Round 1 — **partly**. Actual state-aware 3D thumbnails are captured. Their visual/material state match remains open with C3/J2/J3. Before: `artifacts/snow-journey/final-contact/desktop-en/my-lamps.png`. After: `artifacts/full-review/round-1/after-journey/chromium/desktop-en/my-lamps.png`. The terminal eight-context report is `artifacts/full-review/round-1/after-journey/report.json`.

## H. Performance and platform (P2, T1/T2)

- **H1** The package is 59.3 MB against an 8 MB reference. Bring it to 15 MB or less without visible
  loss: lightmap resolution per region, KTX2 settings, mesh compression, unused textures.

  Round 1 — **done (byte-cap scope)**. The complete installed Snow18 package is 14,970,553 B including all 16 maps, fabric, manifest and shared native AgX,29,447 B under the cap. This closes the byte target; visible quality limits remain in the visual items/J findings. Before: `artifacts/snow-journey/final-contact/desktop-en/place.png`. After: `artifacts/full-review/round-1/after-journey/chromium/desktop-en/place.png`. The terminal eight-context report is `artifacts/full-review/round-1/after-journey/report.json`.

- **H2** A physical phone has never been tested; all phone evidence is desktop emulation. State this in
  the final report; don't claim phone performance from emulation.

  Round 1 — **done (scope disclosure)**. No physical phone has been tested. Captures use desktop-GPU viewport/touch emulation; timing uses 390×844CSS/DSF2 with ratio1.25 (487×1055), saver390×844. WebKit strokes use trusted mouse input rather than physical touch. Before: `artifacts/snow-journey/final-contact/desktop-en/place.png`. After: `artifacts/full-review/round-1/after-journey/chromium/phone-zh/place.png`. The terminal eight-context report is `artifacts/full-review/round-1/after-journey/report.json`.
- **H3 (P1, T1)** Safari and iPhone: every browser on iPhone runs WebKit, so a Safari problem is a phone
  problem. The owner saw one in Safari. Drive the full journey in Playwright's WebKit at both sizes,
  find the cause and fix it; the journey must work and look the same as in Chrome.

  Round 1 — **done (functional journey scope)**. All eight final browser/size/language journeys pass with zero runtime/HTTP errors and unchanged source; the 12 isolated phone timing windows are valid. Native WebKit black recorders are rejected; timestamped JPEG motion is separately documented. WebKit native hidden/blur was not observed, so that departure control remains unverified; visual parity/physical-phone claims are not inferred. Before: `artifacts/snow-journey/final-contact/desktop-en/burning.png`. After: `artifacts/full-review/round-1/after-journey/chromium/phone-zh/burning.png`. The terminal eight-context report is `artifacts/full-review/round-1/after-journey/report.json`.

- **H4 (P2)** The repository is growing fast: `.git` is 253 MB, holding two versions of
  `snow-roof.glb` (36 MB and 15 MB) and evidence files of 15-18 MB each
  (`docs/evidence/snow-journey/final-delivery-summary.json`, `docs/evidence/blender-pilot/geometry-v*/comparison.html`).
  Every round of this loop would add both scenes' packages and all captures. Commit only the delivered
  assets and small text evidence; keep captures, videos, EXRs and other bulky intermediates in
  git-ignored folders, or move binaries to Git LFS. Remove the bulky evidence files already tracked.

  Round 1 — **done (checkpoint hygiene)**. Checkpoint 3f5a631 committed delivered code/assets and compact evidence.132 bulky originals and 35 inactive Snow research files remain hash-indexed under ignored archives; Git history was retained. Final verification documentation is a separate commit; new captures stay ignored. Before: `artifacts/snow-journey/final-contact/desktop-en/home.png`. After: `artifacts/full-review/round-1/after-journey/chromium/desktop-en/home.png`. The terminal eight-context report is `artifacts/full-review/round-1/after-journey/report.json`.

- **H5 (P2)** Sound cannot be judged from captures. Check what can be measured: no clipping, levels
  balanced between snow ambience, bell and flame, loops with no audible seam, bell intervals as
  designed, sound follows mute and the endings. List in the final report the exact moments the owner
  should listen to.

  Round 1 — **partly**. Offline electrical checks pass, and all 100 final live AudioContext observations report no issues. Silent videos do not prove listening: owner still needs startup0–3 s, flame 10.398 s/wind 11.75 s joins, first bell 14–24 s, early mute/unmute and every 300 ms ending fade. Before: `artifacts/snow-journey/final-contact/desktop-en/burning.png`. After: `artifacts/full-review/round-1/after-journey/chromium/desktop-en/sound-muted.png`. The terminal eight-context report is `artifacts/full-review/round-1/after-journey/report.json`.

- **H6 (P2, T1; found during Round 1 integration)** Changing a visitor lantern disposed its geometry but retained its owned cloth/rib materials in a strong reflection-material set. Repeated colour and drawing changes could retain GPU materials for the session.

  Round 1 — **done**. The measured material-lifetime fix remains valid: before857→905 references; after847 across five cycles with 268 geometries/90textures. Before: `artifacts/full-review/round-1/material-before/choose.png`. After: `artifacts/full-review/round-1/material-after/choose.png`. Receipt: `docs/evidence/full-review/round-1-visitor-resources.json`. This is not an endurance/FPS claim.

## I. Home cover: rebuild Cloud Cliff on the Blender pipeline (P1, T2)

The home page is the first thing anyone sees, and today it is still the old procedural scene (`home.png`,
phone `home.png`): the cloud sea is a flat grey plane with a hard horizon, the far ridge is a flat dark
band, the cliff face is flat, the white cloth shapes at the left edge read as crumpled geometry. It must
meet the same bar as Snow Roof Court from the first frame.

- **I1** Build the cover in Blender the same way as Snow Roof: an authored bpy scene under `art/blender/`,
  scanned CC0 assets recorded in `docs/assets.json`, Cycles bakes on Metal (night, dusk, day and the
  lamp-only map), glTF with KTX2, loaded through `web/src/engine/baked/loadPlace.js`. Contacts pass the
  resting-props audit.

  Round 1 — **done (pipeline/contact scope)**. The actual Blender/Cycles/KTX2/glTF pipeline is delivered: Cloud19 has 12 fresh fixed64 Metal/OIDN maps, 18 resting+6 hanging contacts, genuineF32 positions/normals and a7,565,880 B complete package. Optical critiques remain separate. Before: `artifacts/snow-journey/final-contact/desktop-en/home.png`. After: `artifacts/full-review/round-1/after-journey/chromium/desktop-en/home.png`. The terminal eight-context report is `artifacts/full-review/round-1/after-journey/report.json`.

- **I2** The scene: halls on long posts off a sheer cliff, a plank gallery over a moving sea of cloud, far
  ridges breaking through, a brass storm lantern hanging from a gallery column with its candle lit. The
  cloud sea stays live and moves; the lantern flame stays live and lights its glass and the nearest posts.

  Round 1 — **partly**. Owner-selected Cloud19 is retained. Live source density, real gallery/rock/glass/wick and the teardrop are delivered, but provisional cover critiques remain J18–J21. Source20 stays cancelled. Before: `artifacts/snow-journey/final-contact/desktop-en/home.png`. After: `artifacts/full-review/round-1/after-journey/chromium/desktop-en/home.png`. The terminal eight-context report is `artifacts/full-review/round-1/after-journey/report.json`.

- **I3** Keep the cover's role: the wish UI sits on it at desktop and phone, the lantern stays readable
  beside the text, and the move from the cover into Snow Roof Court is smooth with no pop or long black.

  Round 1 — **partly**. Wish UI, cover preparation and the transition into Snow work in the final eight-context flow. Cover composition remains J20/J21; this is not a whole-scene visual pass. Before: `artifacts/snow-journey/final-contact/desktop-en/home.png`. After: `artifacts/full-review/round-1/after-journey/chromium/desktop-en/home.png`. The terminal eight-context report is `artifacts/full-review/round-1/after-journey/report.json`.

- **I4** The home page loads first, so it must appear fast: show a finished-looking first frame quickly
  and stream the rest; the cover's package is 10 MB or less. Snow Roof Court starts loading while the
  person writes the wish, so "Step inside" is ready when they are (see F2).

  Round 1 — **partly**. The complete Cloud19 package is 7,565,880 B under 10MB, with six actual-app posters totaling149,882 B and Snow prefetch. Phone cover timing is 51.55/52.11 FPS; earlier desktop≈20.1 FPS remains a limit. First-frame/cover aesthetics remain provisional. Before: `artifacts/snow-journey/final-contact/desktop-en/home.png`. After: `artifacts/full-review/round-1/after-journey/chromium/desktop-en/home.png`. The terminal eight-context report is `artifacts/full-review/round-1/after-journey/report.json`.

- **I5** Delete the old procedural cover code the new one replaces (`web/src/engine/places/cloud-cliff.js`
  as used for the cover), keeping only what the hidden places still need.

  Round 1 — **done (code replacement)**. The old procedural cover module is removed and the real scene registry imports cloud-cliff-baked.js. Hidden places retain their required code. Before: `artifacts/snow-journey/final-contact/desktop-en/home.png`. After: `artifacts/full-review/round-1/after-journey/chromium/desktop-en/home.png`. The terminal eight-context report is `artifacts/full-review/round-1/after-journey/report.json`.

### Owner review of the Cloud v11 source previews (added 2026-11-17 11:30)

Seen in `art/build/cloud-cliff-round1/source-v11-preview/{desktop,phone}/Reference_cover-*.png`. The wooden
gallery, the lit window and the lantern's placement are good and already far better than the old cover.
These are what still keep it from reading as a cliff temple above a sea of cloud. Fix them in the current
round, before its verification, not in a later round.

- **I6** (P1) The far mountains read as smooth clay blobs: rounded tops, no rock, no strata, no detail at
  cover distance. They must read as sheer rock ridges breaking through the cloud: steep faces, ledges,
  strata, scan detail visible, layered in depth with the farthest ones softened by atmosphere.

  Round 1 — **partly**. Source19 irregular scanned rock variants are delivered; the owner explicitly kept this direction and cancelled Source20. Fresh blobby/game-like rock/fog criticism is J18, retained as a provisional limit rather than a silent new geometry mandate. Before: `art/build/cloud-cliff-round1/source-v11-preview/desktop/Reference_cover-desktop.png`. After: `artifacts/full-review/round-1/after-journey/chromium/desktop-en/home.png`. The terminal eight-context report is `artifacts/full-review/round-1/after-journey/report.json`.

- **I7** (P1) The "sea of cloud" reads as a flat, dark lake: a hard plane with specular water glints.
  It must read as cloud seen from above: soft, billowing tops with volume, brighter lit edges, depth
  layers fading into the distance, wisps around the posts and ridges, slow live motion, and no water-like
  specular at all.

  Round 1 — **partly**. Live source density and the completed-phase coarse light field remain delivered, with actual view-depth endpoints. Coarse interpolation/phase holds/near-refinement limits remain disclosed; game-like fog/empty expanse remains J18/J20. Before: `art/build/cloud-cliff-round1/source-v11-preview/desktop/Reference_cover-desktop.png`. After: `artifacts/full-review/round-1/after-journey/chromium/desktop-en/home.png`. The terminal eight-context report is `artifacts/full-review/round-1/after-journey/report.json`.

- **I8** (P1) No cliff is visible. The gallery's posts end in the flat plane, so the frame reads as a
  stilt house on a lake. Show the sheer rock the court hangs from and the drop beneath the gallery, with
  the cloud filling the depth below.

  Round 1 — **partly**. Actual cliff/post geometry and depth-aware cloud endpoints are delivered. Depth/composition still require visual judgment alongside J18/J21; no Source20 is reopened. Before: `art/build/cloud-cliff-round1/source-v11-preview/desktop/Reference_cover-desktop.png`. After: `artifacts/full-review/round-1/after-journey/chromium/desktop-en/home.png`. The terminal eight-context report is `artifacts/full-review/round-1/after-journey/report.json`.

- **I9** (P2) The lantern's flame reads as a white light bulb: a round, uniform, overexposed blob. It
  must read as a live candle flame: a tapered teardrop, warm core with a blue base, soft flicker, and a
  visible wick. The brass-framed storm lantern itself is the intended design; keep it.

  Round 1 — **partly**. The intended brass/glass/wick and live teardrop remain. Fresh wide-view faint flame and weak warm wood are J19; owner-selected Cloud19 stays in place. Before: `art/build/cloud-cliff-round1/source-v11-preview/desktop/Reference_cover-desktop.png`. After: `artifacts/full-review/round-1/after-journey/chromium/desktop-en/home.png`. The terminal eight-context report is `artifacts/full-review/round-1/after-journey/report.json`.

- **I10** (P2) Phone composition: the bottom half of `Reference_cover-phone.png` is empty dark plane
  behind a railing. Recompose so the cliff, the cloud and the lantern fill the frame and the wish UI
  still sits on a calm area.

  Round 1 — **partly**. The final phone pose and real UI are captured. Black wood and midrail division remain J21, with scale/empty expanse J20. Before: `art/build/cloud-cliff-round1/source-v11-preview/phone/Reference_cover-phone.png`. After: `artifacts/full-review/round-1/after-journey/chromium/desktop-en/home.png`. The terminal eight-context report is `artifacts/full-review/round-1/after-journey/report.json`.

### Owner review of the burning view (added 2026-11-17 17:00)

- **C6** (P1) The lantern does not light the hall the way a gauze lantern can. In
  `artifacts/full-review/round-1/snow-local-environment/chromium/desktop-en/burning.png` the pillar beside the
  lantern carries a hot spot brighter than the lantern itself, so the light looks like it comes from somewhere
  else. Cause: the baked `lamp` pass comes from `Visitor flame bake basis` in `art/blender/snow_roof.py`, a bare
  45 W omnidirectional warm-white point light at the flame with no lantern around it, while the visible gauze is
  a separate, much dimmer shader. Fix both sides so they agree:
  - Bake the lamp pass through the actual lantern: the solid top cap blocks light going up, the red gauze
    filters and softens the light going sideways (red-tinted, dim, no hot spot), and the open bottom lets a
    warmer, brighter pool fall onto the floor and the altar below.
  - Set the flame power to a candle inside a lantern, not a bulb; nearby surfaces must never be brighter than
    the glowing gauze.
  - The gauze is the brightest thing in the frame: a soft glow strongest around the flame, the ribs dark against
    it, the cloth texture visible. It must not read as a smooth red plastic ellipsoid (see C1).
  - Check the same frame in Chrome and WebKit, desktop and phone, and compare it with the lantern's real-time
    light near the anchor so there is no seam where the baked light hands over to the live one.

  Round 1 — **partly**. The real 57-part open-bottom filter, source 2 W warmRGB, absorbing cloth and indirect-only atlas/live-direct split are delivered. Root saw warm spill/column clearance/panel removal, but hard spotlight edge, cord connection and flat cloth remain C7/C8/J1/J3/J4. Supplemental38 C6/triptych/B5 stills are separate; no terminal claim is made for that run here. Before: `artifacts/full-review/round-1/snow-local-environment/chromium/desktop-en/burning.png`. After: `artifacts/full-review/round-1/after-journey/chromium/desktop-en/burning.png`. The terminal eight-context report is `artifacts/full-review/round-1/after-journey/report.json`.

- **B4** (P1) In the new burning view the red column is the subject, not the lantern. The geometry causes
  it: the visitor lantern now hangs at (-3.35, 2.8-3.2, 1.2), only about 0.45 m from the surface of the hall
  column at (-2.7, 1.0); the `burn` camera at (-4.4, 1.7, 1.3) with fov 75 looks toward (0.07, 2.4, -0.2),
  so that column stands almost on the line of sight, 1.7 m away, and the wide angle makes it fill the middle of
  the frame. B2 said "stand by a side column"; that meant the column may frame one edge, never stand between
  the camera and the subject. Fix:
  - Hang the lantern in open air, at least about 1.2 m from any column, wall or beam it could hot-spot.
  - Place `burn`, `burnFar`, `burnPhone` and `burnFarPhone` so that no column, cord or beam crosses the
    lantern, the altar or the doorway; a column may appear only as a dark edge of the frame.
  - Use a normal lens (fov about 45-55) so nearby architecture is not stretched and the lantern holds
    20-25% of frame height as B2 asks.
  - The lantern is the brightest and clearest thing in the frame; the altar, screen and small lamps are
    second; the architecture is background.

  Round 1 — **partly**. Source18 normal 55° open-bay cameras and measured ceiling suspension replace the old wide/column-facing setup. Remaining desktop balance is J5 and phone prop alignment is B5; final motion does not close those composition findings. Before: `artifacts/full-review/round-1/snow-local-environment/chromium/desktop-en/burning.png`. After: `artifacts/full-review/round-1/after-journey/chromium/desktop-en/burning.png`. The terminal eight-context report is `artifacts/full-review/round-1/after-journey/report.json`.

- **I11** (P1) In `artifacts/full-review/round-1/cover-runtime-v6/night-desktop.png` the long gallery post under
  the lantern ends in mid-air with a hard, rounded bottom, so the whole gallery looks like it floats. In
  `cloud_cliff.py` the post runs down about 14 m to a seat on the rock, so the geometry is sound; in the browser
  the cloud reaches full opacity within a very short depth (the saturated viewing-ray opacity already noted under
  I7), so its top acts as a hard, flat, sky-coloured surface that cuts each post along an ellipse. Every post,
  corbel and the cliff must sink into the cloud gradually over metres: the lower part fades and softens, wisps
  pass in front of it, and more of the post and rock shows through where the cloud is thin. Check every post in
  the desktop and phone cover, in Chrome and WebKit, at night, dusk and day.

  Round 1 — **partly**. Actual geometry/view endpoints and near-post wisps are delivered. Gradual optical sinking remains part of the provisional cover judgment. Keep required night/dusk/day tests; see the disagreement under J22. Before: `artifacts/full-review/round-1/cover-runtime-v6/night-desktop.png`. After: `artifacts/full-review/round-1/after-journey/chromium/desktop-en/home.png`. The terminal eight-context report is `artifacts/full-review/round-1/after-journey/report.json`.

- **I12** (P2) In `art/build/cloud-cliff-round1/source-v17-preview/desktop/Reference_cover-desktop.png` the cliff
  faces now read as real rock, but the ridge tops are a row of repeated, evenly spaced rounded bumps, like a
  scalloped or crenellated edge. Real ridgelines are irregular: varied heights, sharp and broken crests, notches,
  no repeating rhythm. Fix the crests without losing the rock faces.

  Round 1 — **partly**. Source19 replaces the repeated crest variants, and the owner kept that direction. J18 records the remaining rock/fog critique without authorizing Source20. Before: `art/build/cloud-cliff-round1/source-v17-preview/desktop/Reference_cover-desktop.png`. After: `artifacts/full-review/round-1/after-journey/chromium/desktop-en/home.png`. The terminal eight-context report is `artifacts/full-review/round-1/after-journey/report.json`.

### Owner review of the round 1 commit (added 2026-11-18 01:30)

- **C7** (P1) The floor pool under the gauze lantern
  (`artifacts/full-review/round-1/after-journey/chromium/desktop-en/burning.png`) reads as a stage spotlight: a
  hard-edged, yellow-white disc with uniform brightness. Light falling from a lantern's open bottom is warm, a
  little red from the gauze, brightest straight below and fading softly over a wide edge; it also faintly warms
  the cushions, column bases and altar edge nearby. Inside the pool the stone tiles show concentric ring patterns
  like wood end grain; stone must look like stone in every light.

  Round 1 — **partly**. Owner floor-pool/floor-material issue is retained. Round 2 physical-light/floor candidates are in development; no corrected delivered after-image is accepted. Duplicate fresh floor observation is J4. Before/current baseline: `artifacts/full-review/round-1/after-journey/chromium/desktop-en/burning.png`. After: corrected Round 2 comparison pending. The terminal eight-context report is `artifacts/full-review/round-1/after-journey/report.json`.

- **B5** (P1) Phone burning (`artifacts/full-review/round-1/after-motion/chromium/phone-zh/burning.png`): the
  lantern hangs exactly above the tall altar lamp stand, so it reads as a floor lamp standing on that stand.
  Keep a clear gap of background between the lantern and every prop below it, and keep its cord visible.

  Round 1 — **partly**. Owner phone floor-lamp alignment issue is retained. Three camera-only candidates are prepared; actual B5 still comparison is separate from the terminal journey and no product camera change is approved by this note. Cord continuity is also J1. Before/current baseline: `artifacts/full-review/round-1/after-motion/chromium/phone-zh/burning.png`. After: corrected Round 2 comparison pending. The terminal eight-context report is `artifacts/full-review/round-1/after-journey/report.json`.

- **C8** (P2) The lit gauze is still one even red-orange glow from top to bottom. It needs the gradient of a
  flame inside cloth: brightest around the flame, darker toward the top cap and the rim, with the ribs reading
  as darker lines.

  Round 1 — **partly**. Owner cloth-gradient issue is retained. Round 2 physical shade work remains a candidate; a regular plastic/flat appearance is also recorded as J3. Before/current baseline: `artifacts/full-review/round-1/after-journey/chromium/desktop-en/burning.png`. After: corrected Round 2 comparison pending. The terminal eight-context report is `artifacts/full-review/round-1/after-journey/report.json`.


## J. Fresh full-journey findings (Round 2 follow-up; added2026-11-18)

Every observation remains recorded, including duplicate findings and disputed remedies. “Partly” means the issue is carried forward or candidate work exists; it does not mean a corrected image has passed. No new scene/version is adopted by this checklist.

- **J1 (P1, T2)** The hanging cord appears to stop short of the lantern, leaving an air gap.

  Status — **partly**. Before media: `artifacts/full-review/round-1/after-journey/chromium/desktop-en/detail-painted-beams-and-brackets.png`. Cross-reference B4/B5 and C1. Actual suspension coordinates do not establish a visible connection; inspect the dedicated close-up and repair the real attachment if needed. After: corrected comparison pending; retain the current media as the baseline.

- **J2 (P1, T2)** The unlit lantern reads as a black cutout, pops red during approach, and becomes black again after going out.

  Status — **partly**. Before media: `artifacts/full-review/round-1/after-journey/chromium/phone-zh/result-put-out.png`. Cross-reference C2/C3/C4/B3. Companion before media: `artifacts/full-review/round-1/after-journey/chromium/desktop-en/light-walking.png` and `artifacts/full-review/round-1/after-journey/chromium/desktop-en/result-put-out.png`. Keep the unlit and ended material readable and continuous through approach/ending; functional flow passing does not close this. After: corrected comparison pending; retain the current media as the baseline.

- **J3 (P2, T2)** The shade still looks regular/plastic and its lit colour/gradient is too flat.

  Status — **partly**. Before media: `artifacts/full-review/round-1/after-journey/chromium/desktop-en/burning.png`. Duplicate visual concern of owner C8 and C1; keep the physical internal-flame gradient and dark ribs as the criterion. After: corrected comparison pending; retain the current media as the baseline.

- **J4 (P2, T2)** Stone inside the floor pool shows concentric rings like wood end grain.

  Status — **partly**. Before media: `artifacts/full-review/round-1/after-journey/chromium/desktop-en/burning.png`. Duplicate of the floor-material part of owner C7. Round 2 floor/light candidates remain pending actual delivered comparison. After: corrected comparison pending; retain the current media as the baseline.

- **J5 (P2, T2)** The desktop lantern is small and high while the floor dominates the frame.

  Status — **partly**. Before media: `artifacts/full-review/round-1/after-journey/chromium/desktop-en/burning.png`. Cross-reference B1/B2/B4; retain the lantern-first 20–25% target and judge the final composed image, not only collision clearance. After: corrected comparison pending; retain the current media as the baseline.

- **J6 (P2, T2)** Gate bloom overwhelms the flame and offering bowl.

  Status — **partly**. Before media: `artifacts/full-review/round-1/after-journey/chromium/desktop-en/detail-contact-gate-minus-1.png`. Cross-reference E5/D1. Preserve the actual flame/bowl silhouette and readable material under the gate light. After: corrected comparison pending; retain the current media as the baseline.

- **J7 (P2, T2)** The court stone lantern has faceted supports, blurry stone and an over-hot roof.

  Status — **partly**. Before media: `artifacts/full-review/round-1/after-journey/chromium/desktop-en/detail-contact-court-lantern-oil-cup.png`. Cross-reference E8. Companion before media: `artifacts/full-review/round-1/after-journey/chromium/desktop-en/detail-contact-court-stone-lantern-foundation.png`. A bounded Round 2 construction/UV candidate exists; hot-roof/light appearance still needs native/app comparison. After: corrected comparison pending; retain the current media as the baseline.

- **J8 (P2, T2)** The burner handles look disconnected, ash fans out mechanically, and the incense rods look identical.

  Status — **partly**. Before media: `artifacts/full-review/round-1/after-journey/chromium/desktop-en/detail-contact-altar-burner-assembly.png`. Cross-reference D1/D6. Companion before media: `artifacts/full-review/round-1/after-journey/chromium/desktop-en/detail-contact-burner-ash.png` and `artifacts/full-review/round-1/after-journey/chromium/desktop-en/detail-contact-smouldering-incense-0.png`. Round 2 interior candidates must retain real supports and evaluated incense origins; no corrected after-image is accepted yet. After: corrected comparison pending; retain the current media as the baseline.

- **J9 (P2, T2)** The kneeling cushion looks rubbery and faceted.

  Status — **partly**. Before media: `artifacts/full-review/round-1/after-journey/chromium/desktop-en/detail-contact-kneeling-cushion-minus-1.png`. Round 2 interior geometry/material work is a candidate; preserve its audited floor contact. After: corrected comparison pending; retain the current media as the baseline.

- **J10 (P2, T2)** The stair risers show repeated deep rectangular black openings and read as hollow.

  Status — **partly**. Before media: `artifacts/full-review/round-1/after-journey/chromium/desktop-en/detail-continuous-step-snow.png`. Cross-reference E6/E7. Round 2 exterior candidate rebuilds closed worn solids; it has not replaced the delivered Source18. After: corrected comparison pending; retain the current media as the baseline.

- **J11 (P2, T2)** Small blue triangles show through the rear wall/floor seam behind the pedestal.

  Status — **partly**. Before media: `artifacts/full-review/round-1/after-journey/chromium/desktop-en/detail-contact-turned-pedestal-1-45.png`. Cross-reference D4/E10. Round 2 proposes real overlapping wall-foot construction, not an image overlay. After: corrected comparison pending; retain the current media as the baseline.

- **J12 (P2, T2)** The stacked bowls and leaning broom are nearly black.

  Status — **partly**. Before media: `artifacts/full-review/round-1/after-journey/chromium/desktop-en/detail-contact-stacked-bowl-assembly.png`. Companion before media: `artifacts/full-review/round-1/after-journey/chromium/desktop-en/detail-contact-leaning-broom.png`. Round 2 interior readability remains pending; contacts must stay intact. After: corrected comparison pending; retain the current media as the baseline.

- **J13 (P2, T2)** Bare trees remain angular/game-like, and the snow/sky still read as a game environment.

  Status — **partly**. Before media: `artifacts/full-review/round-1/after-journey/chromium/desktop-en/place.png`. Cross-reference E3/E4/E10. The modest tree construction candidate does not accept the overall setting; sky/snow appearance remains open. After: corrected comparison pending; retain the current media as the baseline.

- **J14 (P2, T2)** The extra Step inside action is questioned as an unnecessary step.

  Status — **done** (remedy declined with the rationale below). Before media: `artifacts/full-review/round-1/after-journey/chromium/desktop-en/place.png`. Root disagrees with removing it: owner F2 explicitly retains the entry preview/progress and names Step inside. Preserve that orientation/loading action; the pacing concern remains recorded, not silently deleted. After: Step inside is retained by decision; no removal is planned.

- **J15 (P2, T2)** The phone drawing target is too narrow.

  Status — **partly**. Before media: `artifacts/full-review/round-1/after-journey/chromium/phone-zh/draw-large.png`. Drawing works in all eight contexts, but that functional result does not accept the touch-target width. WebKit strokes remain mouse-driven emulation. After: corrected comparison pending; retain the current media as the baseline.

- **J16 (P2, T2)** A long Chinese wish is cut off without an ellipsis.

  Status — **partly**. Before media: `artifacts/full-review/round-1/after-journey/chromium/phone-zh/burning.png`. Cross-reference F5/G2. Zero measured container overflow is not a text-completeness check; preserve or clearly indicate truncated wish text. After: corrected comparison pending; retain the current media as the baseline.

- **J17 (P3, T2)** The no-one-here badge feels cold and is too prominent.

  Status — **partly**. Before media: `artifacts/full-review/round-1/after-journey/chromium/desktop-en/place.png`. Presence functionality is intact; wording/hierarchy is a separate UI polish item. After: corrected comparison pending; retain the current media as the baseline.

- **J18 (P1, T2)** The provisional cover still has blobby/game-like rock and fog.

  Status — **partly**. Before media: `artifacts/full-review/round-1/after-journey/chromium/desktop-en/home.png`. Cross-reference I6/I7/I12. The owner explicitly kept Cloud19 and cancelled Source20; retain this critique as an open limit without silently reopening a geometry redesign. After: corrected comparison pending; retain the current media as the baseline.

- **J19 (P1, T2)** The cover flame is faint and the nearest wood lacks convincing warm spill.

  Status — **partly**. Before media: `artifacts/full-review/round-1/after-journey/chromium/desktop-en/home.png`. Cross-reference I2/I9. Cloud19 remains the selected direction; flame/wood readability is still a provisional optical limit. After: corrected comparison pending; retain the current media as the baseline.

- **J20 (P2, T2)** The cover lantern is small beside an empty grey expanse.

  Status — **partly**. Before media: `artifacts/full-review/round-1/after-journey/chromium/desktop-en/home.png`. Cross-reference I3/I7/I10. The owner-kept Cloud19 direction remains; composition quality is not accepted merely by the final package/budget. After: corrected comparison pending; retain the current media as the baseline.

- **J21 (P2, T2)** On phone the cover wood is black and the midrail splits the frame.

  Status — **partly**. Before media: `artifacts/full-review/round-1/after-journey/chromium/phone-zh/home.png`. Cross-reference I10/I11. Record the final phone limit while preserving the owner-kept Cloud19 direction. After: corrected comparison pending; retain the current media as the baseline.

- **J22 (P2, T2)** The cover evidence was criticized as day rather than night.

  Status — **done** (remedy declined with the rationale below). Before media: `artifacts/full-review/round-1/after-journey/chromium/desktop-en/home.png`. Root disagrees with dropping the day comparison: owner I11 explicitly requires night, dusk and day. Retain all three tests; any actual night-appearance concern remains a separate visual judgment. This does not authorize Source20. After: required night/dusk/day evidence is retained; no removal of the day test is planned.

## Round 2 delivered checkpoint — 2026-11-18

These are the latest judgments for the listed items; the Round 1 entries above remain historical. Snow20 is installed after one final fixed64 Metal/OIDN batch. The corrected four-context C6/end capture has 36 actual views, zero errors and unchanged source. Phone burning averages 30.15 FPS in Chrome and 29.99 FPS in WebKit. See [the concise checkpoint record](../evidence/full-review/round2-checkpoint.md). The full new journey and fresh hunt follow this commit.

| Item | Current status | Before | Delivered after and judgment |
| --- | --- | --- | --- |
| C7 / J4 | **done** | `artifacts/full-review/round-1/after-journey/chromium/desktop-en/burning.png` | `artifacts/full-review/round-2/source20-final-c6-r2/chromium-desktop-burning-held.png`: the warm pool fades broadly, the stage disc and per-stone rings are gone, and shadows remain enabled. WebKit/phone counterparts are in the same folder. |
| B5 / J1 | **done** | `artifacts/full-review/round-1/after-motion/chromium/phone-zh/burning.png` | `artifacts/full-review/round-2/source20-final-c6-r2/webkit-phone-burning-held.png` and `chromium-phone-diagnostic-lantern-close.png`: clear background below the hanging lantern, continuous visible cord, no stand alignment. |
| C8 | **done** | `artifacts/full-review/round-1/after-journey/chromium/desktop-en/burning.png` | `artifacts/full-review/round-2/source20-final-c6-r2/chromium-desktop-diagnostic-lantern-close.png`: photographed weave, dark ribs and a lower bright region fading toward the cap. |
| J2 | **partly** | `artifacts/full-review/round-1/after-journey/chromium/phone-zh/result-put-out.png` | `artifacts/full-review/round-2/source20-final-c6-r2/chromium-phone-result-ended.png`: the ended shade is maroon and the transition is smooth; unlit weave/rib readability still needs the full journey judgment. |
| J5 | **partly** | `artifacts/full-review/round-1/after-journey/chromium/desktop-en/burning.png` | `artifacts/full-review/round-2/source20-final-c6-r2/chromium-desktop-burning-held.png`: the selected 45-degree view enlarges the lamp and reduces floor area; altar coverage remains a full-journey framing concern. |

Source20's connected burner handles, ash/incense, linen cushions, closed steps, wall-foot repairs and lower gate/court output are delivered. Their complete 47-group detail review uses the new 53-pose registry in the next verification pass. The owner-kept Cloud19 geometry is retained with warmer coupled light output; remaining cover judgments stay open. The original held Source20 control is rejected because its capture tool skipped functional light/cloth updates while freezing animation; the corrected `source20-final-c6-r2` frames above are authoritative.
