# Snow Roof Court: full journey review (2026-11-17)

> **Round 1 checkpoint — 2026-11-18T01:05:42.673924+08:00.** Original findings/targets/IDs are preserved. Source18/19 are installed; Snow16×64 and Cloud12×64 Metal/OIDN batches plus literal contact/budget gates pass. This is not whole-scene photorealism approval, a completed stranger pass, physical-phone testing or owner audio listening. Owner-selected Cloud19 direction is retained; Source20 was cancelled, and no new geometry changes belong before the Round1 commit. Existing final frames are linked below but remain unaccepted unless Root actually inspects them. Clean motion/full-diagnostic captures are live work; an incomplete report is not treated as a four-context pass.

Final facts: Snow **14,970,553B**, source`5d3d015e…`, manifest`1e909331…`,47 source/prepared/raw/decoded contact groups; Cloud **7,565,880B**, source`ee3f9f06…`, manifest`4bb463f9…`,18resting+6hanging pairs and149,882B actual-app posters. Final phone-emulation timing:12 valid10s windows, zero errors/source change; home51.55/52.11FPS, Snow outside/choose≈60, normal/restored burn≈30, saver≈15. Earlier desktop Cloud≈20.1FPS remains a limit. Relevant receipts: `docs/evidence/full-review/round-1-snow-source18-package.json`, `docs/evidence/cloud-cliff-round1/source19/final-delivery/delivery.json`, `docs/evidence/full-review/round-1-final-phone-performance.json`.

**Capture checkpoint:** The latest motion report has28 frames from Chromium desktop/phone and records a WebKit-desktop90,000ms startup wait timeout at `tests/visual/full-journey-review.mjs:256` (`__ready && __flickerLab`). It has no terminal source-end record; `after-journey/report.json` was absent at this draft snapshot. Preserve the failed scope. Root may make the requested delivered-scene Round1 checkpoint commit while remaining journey/recorder verification continues; that commit is not whole-round visual acceptance.

Current capture scope: Chromium desktop/phone clean motion is saved. WebKit desktop passed the real home→court→ignition→burn journey without recording (`artifacts/full-review/round-1/after-webkit-no-video-control/report.json`); its recorded startup timed out and remains under investigation. The final eight-context bilingual journey is running. Root inspected final desktop and phone burning views in both browsers: the warm floor pool, column clearance and removal of the blank panel are visible. This checkpoint commit does not claim complete journey or stranger acceptance.

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

Round 1 status checkpoint (final Source18/19 delivery; visual judgments remain scoped below):

- **A1: partly** — The final descriptor keeps a 30-second walk; story tweens use elapsed wall time independently of particle-step limits. Continuous motion captures are being recorded; the target pacing and natural start/stop still need video judgment. Before: `artifacts/snow-journey/final-contact/desktop-en/walk-1.png` (phone comparison: same filenames under `artifacts/snow-journey/final-contact/phone-zh/`). After: Available, not yet visually accepted: `artifacts/full-review/round-1/after-motion/chromium/desktop-en/walk-1.png` / `artifacts/full-review/round-1/after-motion/chromium/desktop-en/walk-3.png`. Final four-context evidence: `artifacts/full-review/round-1/after-journey/{chromium,webkit}/{desktop-en,phone-zh}/walk-1.png` / `artifacts/full-review/round-1/after-journey/{chromium,webkit}/{desktop-en,phone-zh}/walk-3.png`; capture/review remains pending where absent or uninspected.

- **A2: partly** — The separate closeUp/confirm move is removed; choosing proceeds directly into ignition. Current final-source motion uses the real UI direct-light path; final pacing review remains open. Before: `artifacts/snow-journey/final-contact/desktop-en/confirm.png` (phone comparison: same filenames under `artifacts/snow-journey/final-contact/phone-zh/`). After: Available, not yet visually accepted: `artifacts/full-review/round-1/after-motion/chromium/desktop-en/choose.png` / `artifacts/full-review/round-1/after-motion/chromium/desktop-en/light-ignition.png`. Final four-context evidence: `artifacts/full-review/round-1/after-journey/{chromium,webkit}/{desktop-en,phone-zh}/choose.png` / `artifacts/full-review/round-1/after-journey/{chromium,webkit}/{desktop-en,phone-zh}/light-ignition.png`; capture/review remains pending where absent or uninspected.

- **A3: partly** — The separate backToChoose path and confirm screen are removed. This is implemented; final navigation/visual verification must use the completed four-context journey. Before: `artifacts/snow-journey/final-contact/desktop-en/confirm.png` (phone comparison: same filenames under `artifacts/snow-journey/final-contact/phone-zh/`). After: Available, not yet visually accepted: `artifacts/full-review/round-1/after-motion/chromium/desktop-en/choose.png`. Final four-context evidence: `artifacts/full-review/round-1/after-journey/{chromium,webkit}/{desktop-en,phone-zh}/choose.png`; capture/review remains pending where absent or uninspected.

- **A4: partly** — The taper/contact/catch/retreat tween is 3.2 seconds in the current source. Contact, catch and retreat quality still require clean-video review. Before: `artifacts/snow-journey/final-contact/desktop-en/ignition-igniting.png` (phone comparison: same filenames under `artifacts/snow-journey/final-contact/phone-zh/`). After: Available, not yet visually accepted: `artifacts/full-review/round-1/after-motion/chromium/desktop-en/light-igniting.png`. Final four-context evidence: `artifacts/full-review/round-1/after-journey/{chromium,webkit}/{desktop-en,phone-zh}/light-igniting.png`; capture/review remains pending where absent or uninspected.

- **A5: partly** — The post-catch hold is .8 seconds. Actual shot timing/settling remains a video judgment. Before: `artifacts/snow-journey/final-contact/desktop-en/ignition-spreading.png` (phone comparison: same filenames under `artifacts/snow-journey/final-contact/phone-zh/`). After: Available, not yet visually accepted: `artifacts/full-review/round-1/after-motion/chromium/desktop-en/light-spreading.png`. Final four-context evidence: `artifacts/full-review/round-1/after-journey/{chromium,webkit}/{desktop-en,phone-zh}/light-spreading.png`; capture/review remains pending where absent or uninspected.

- **A6: partly** — The settling route is nine seconds and uses separate desktop/phone arcs toward the final open-bay poses. Continuous motion, collision-free passage and no popping still need final video inspection. Before: `artifacts/snow-journey/final-contact/desktop-en/ignition-walking.png` (phone comparison: same filenames under `artifacts/snow-journey/final-contact/phone-zh/`). After: Available, not yet visually accepted: `artifacts/full-review/round-1/after-motion/chromium/desktop-en/light-walking.png` / `artifacts/full-review/round-1/after-motion/chromium/desktop-en/burning.png`. Final four-context evidence: `artifacts/full-review/round-1/after-journey/{chromium,webkit}/{desktop-en,phone-zh}/light-walking.png` / `artifacts/full-review/round-1/after-journey/{chromium,webkit}/{desktop-en,phone-zh}/burning.png`; capture/review remains pending where absent or uninspected.

- **A7: partly** — Default black fade is600 ms, with scaled explicit fades and the reduced-motion path retained. This code change is complete; perceived continuity is not accepted from stills. Before: `artifacts/snow-journey/final-contact/desktop-en/place.png` (phone comparison: same filenames under `artifacts/snow-journey/final-contact/phone-zh/`). After: Available, not yet visually accepted: `artifacts/full-review/round-1/after-motion/chromium/desktop-en/place.png`. Final four-context evidence: `artifacts/full-review/round-1/after-journey/{chromium,webkit}/{desktop-en,phone-zh}/place.png`; capture/review remains pending where absent or uninspected.

- **A8: partly** — Walk title timing is .4 s in /3 s hold /.6 s out. Confirm from the final video that it has cleared before the doorway and does not obscure the roof. Before: `artifacts/snow-journey/final-contact/desktop-en/walk-1.png` / `artifacts/snow-journey/final-contact/desktop-en/walk-3.png` (phone comparison: same filenames under `artifacts/snow-journey/final-contact/phone-zh/`). After: Available, not yet visually accepted: `artifacts/full-review/round-1/after-motion/chromium/desktop-en/walk-1.png` / `artifacts/full-review/round-1/after-motion/chromium/desktop-en/walk-3.png`. Final four-context evidence: `artifacts/full-review/round-1/after-journey/{chromium,webkit}/{desktop-en,phone-zh}/walk-1.png` / `artifacts/full-review/round-1/after-journey/{chromium,webkit}/{desktop-en,phone-zh}/walk-3.png`; capture/review remains pending where absent or uninspected.

Total target: about 40 s to a settled burning lamp, still one continuous move with no cut or pop.

## B. Burning view (P1, T2)

`burning.png`, `burning-restored-detail.png`, phone `burning.png`.

- **B1** The camera stands behind the lantern facing the doors. Two thirds of the frame is a flat dark
  plank wall. The lantern is about 3% of the frame and sits under the title like an icon. The scanned
  screen, altar, small lamps and burner, the best things in the room, are behind the camera. The blue
  court is a thin slot.

  Round 1 — **partly**. Source18 installs the selected 55° back-bay composition with the lantern at world[-1.5,2.25,-1.3]. The final native8 picture was selected; final app subject size/hierarchy, black-area coverage, altar and blue doorway still require Root judgment. Before: `artifacts/snow-journey/final-contact/desktop-en/burning.png` (phone comparison: same filenames under `artifacts/snow-journey/final-contact/phone-zh/`). After: Available, not yet visually accepted: `artifacts/full-review/round-1/after-motion/chromium/desktop-en/burning.png`. Final four-context evidence: `artifacts/full-review/round-1/after-journey/{chromium,webkit}/{desktop-en,phone-zh}/burning.png`; capture/review remains pending where absent or uninspected. Receipts: `docs/evidence/full-review/round-1-snow-source18.json`, `docs/evidence/full-review/round-1-snow-source18-package.json`.

- **B2** The spread view (`ignition-spreading.png`, the best frame in the game) lasts 2 s; the camera
  then walks 16 s to the weakest frame and parks there for up to 24 hours.
- **Target**: stand by a side column, slightly forward, and look diagonally across the hall so one
  frame holds the person's lantern in the foreground at 20-25% of frame height (upper third, clear of
  title and controls), the altar, screen, small lamps and burner warmed by it on one side, and the open
  doors with the blue snow court and drifting flakes on the other. No flat surface fills more than a
  quarter of the frame. Phone: lantern and altar first, a sliver of doorway if it fits. `burnFar` and
  `burnWalk` follow the same idea. The route there is a smooth arc that never passes through a column,
  cord or lantern.

  Round 1 — **partly**. The nine-second arc now ends in the selected back-bay view; burnFar and phone poses use the same normal-lens/open-air direction. The20–25% subject-size target and flat-surface quarter-frame limit remain visual checks. Before: `artifacts/snow-journey/final-contact/desktop-en/ignition-spreading.png` / `artifacts/snow-journey/final-contact/desktop-en/burning.png` (phone comparison: same filenames under `artifacts/snow-journey/final-contact/phone-zh/`). After: Available, not yet visually accepted: `artifacts/full-review/round-1/after-motion/chromium/desktop-en/light-spreading.png` / `artifacts/full-review/round-1/after-motion/chromium/desktop-en/burning.png`. Final four-context evidence: `artifacts/full-review/round-1/after-journey/{chromium,webkit}/{desktop-en,phone-zh}/light-spreading.png` / `artifacts/full-review/round-1/after-journey/{chromium,webkit}/{desktop-en,phone-zh}/burning.png` / `artifacts/full-review/round-1/after-journey/{chromium,webkit}/{desktop-en,phone-zh}/burnFar.png`; capture/review remains pending where absent or uninspected.

- **B3** The result screens (`result-went-out.png`, `result-burned-down-accelerated.png`) reuse the same
  door-facing frame, almost black, with the dead lantern barely visible. After the change they should
  show the lantern and altar in the new composition, cooled.

  Round 1 — **partly**. Both cooled results inherit the revised burning composition. Neither an existing live-flame screenshot nor the native picture accepts the final cooled results. Before: `artifacts/snow-journey/final-contact/desktop-en/result-went-out.png` / `artifacts/snow-journey/final-contact/desktop-en/result-burned-down-accelerated.png` (phone comparison: same filenames under `artifacts/snow-journey/final-contact/phone-zh/`). After: Final four-context evidence: `artifacts/full-review/round-1/after-journey/{chromium,webkit}/{desktop-en,phone-zh}/result-went-out.png` / `artifacts/full-review/round-1/after-journey/{chromium,webkit}/{desktop-en,phone-zh}/result-burned-down.png`; capture/review remains pending where absent or uninspected.

## C. The person's lantern (P1, T2)

- **C1** Lit, it reads as a clean orange-red graphic with black stripes, no gradient
  (`burning.png`, `ignition-walking.png`). Make it real red gauze: translucent glow from the flame,
  brighter near the flame and falling off toward top and bottom; bamboo ribs as darker lines through
  the gauze; slightly uneven weave and colour; dark lacquered rims; a tassel with real threads; a slow
  sway on the cord with its shadow swaying too.

  Round 1 — **partly**. The shipped runtime has photographed gauze weave/normal/roughness, actual bowed cloth,4.5 mm ribs, raised cup/leaning wick, open bottom, real threads and ceiling-pivot sway. Source18 uses the actual body filter; final cloth texture, gradient, rib readability and moving shadows remain visual judgments. Before: `artifacts/snow-journey/final-contact/desktop-en/lamp-preset.png` / `artifacts/snow-journey/final-contact/desktop-en/burning.png` (phone comparison: same filenames under `artifacts/snow-journey/final-contact/phone-zh/`). After: Available, not yet visually accepted: `artifacts/full-review/round-1/after-motion/chromium/desktop-en/choose.png` / `artifacts/full-review/round-1/after-motion/chromium/desktop-en/burning.png`. Final four-context evidence: `artifacts/full-review/round-1/after-journey/{chromium,webkit}/{desktop-en,phone-zh}/choose.png` / `artifacts/full-review/round-1/after-journey/{chromium,webkit}/{desktop-en,phone-zh}/burning.png`; capture/review remains pending where absent or uninspected. Receipts: `docs/evidence/full-review/round-1-snow-source18.json`, `docs/evidence/full-review/round-1-snow-source18-package.json`.

- **C2** Unlit, while choosing and confirming (`lamp-preset.png`, `lamp-24-hours.png`, `confirm.png`),
  it is a dark smooth red solid in a near-black room. The person chooses shape and colour without
  seeing either. Give the choosing views enough ambient and a soft rim so the unlit gauze, its colour
  and its shape read clearly, while still feeling like night.

  Round 1 — **partly**. Source18 supplies the selected room.9 W /door.6 W interior, native AgX plus explicit+.35 EV residual, and the actual unlit vessel/probe response. Final choose shape/dye readability still needs desktop/phone inspection. Before: `artifacts/snow-journey/final-contact/desktop-en/lamp-preset.png` (phone comparison: same filenames under `artifacts/snow-journey/final-contact/phone-zh/`). After: Available, not yet visually accepted: `artifacts/full-review/round-1/after-motion/chromium/desktop-en/choose.png`. Final four-context evidence: `artifacts/full-review/round-1/after-journey/{chromium,webkit}/{desktop-en,phone-zh}/choose.png` / `artifacts/full-review/round-1/after-journey/{chromium,webkit}/{desktop-en,phone-zh}/choose-24-hours.png`; capture/review remains pending where absent or uninspected. Receipts: `docs/evidence/full-review/round-1-snow-source18.json`.

- **C3** Thumbnails (shape picker, My Lamps) show a glowing lit lantern with a bright amber core; the
  3D lamp in the same moment is unlit and dark, and looks different. Thumbnails must match the 3D lamp
  in shape, colour, material and state (unlit in the picker; extinguished for lamps that went out or
  burned down in My Lamps).

  Round 1 — **partly**. Picker/My Lamps render the actual 3D vessel with explicit unlit/burning/ended state and the shared native AgX view. Final thumbnails must still be compared with the actual chosen/ended3D shape and colour. Before: `artifacts/snow-journey/final-contact/desktop-en/lamp-preset.png` / `artifacts/snow-journey/final-contact/desktop-en/my-lamps.png` (phone comparison: same filenames under `artifacts/snow-journey/final-contact/phone-zh/`). After: Available, not yet visually accepted: `artifacts/full-review/round-1/after-motion/chromium/desktop-en/choose.png`. Final four-context evidence: `artifacts/full-review/round-1/after-journey/{chromium,webkit}/{desktop-en,phone-zh}/choose.png` / `artifacts/full-review/round-1/after-journey/{chromium,webkit}/{desktop-en,phone-zh}/my-lamps.png`; capture/review remains pending where absent or uninspected.

- **C4** At confirm (`confirm.png`) the lantern is small and dark. The confirm step goes (F12); the
  choose view itself must show the lantern large and clear enough to judge shape and colour.

  Round 1 — **partly**. Confirm is removed and the actual choose fit uses the physical body. Judge final choose size/clarity at both viewport sizes rather than inferring it from the removed screen. Before: `artifacts/snow-journey/final-contact/desktop-en/confirm.png` (phone comparison: same filenames under `artifacts/snow-journey/final-contact/phone-zh/`). After: Available, not yet visually accepted: `artifacts/full-review/round-1/after-motion/chromium/desktop-en/choose.png`. Final four-context evidence: `artifacts/full-review/round-1/after-journey/{chromium,webkit}/{desktop-en,phone-zh}/choose.png`; capture/review remains pending where absent or uninspected.

- **C5** Endings: burned down must visibly differ from went out. Burned down: the flame shrinks,
  gutters, a last thread of smoke, the gauze glow cools slowly. Went out: sudden, a puff of smoke.
  Today both end on the same near-black frame (`went-out-smoke.png`, `natural-ember-accelerated.png`).

  Round 1 — **partly**. Separate natural gutter/ember/cooling/thread and sudden-out puff paths remain implemented. The final full flow must supply its actual12-second natural and put-out plume sequences; accelerated settlement is not a real-duration endurance burn. Before: `artifacts/snow-journey/final-contact/desktop-en/went-out-smoke.png` / `artifacts/snow-journey/final-contact/desktop-en/natural-ember-accelerated.png` (phone comparison: same filenames under `artifacts/snow-journey/final-contact/phone-zh/`). After: Final four-context evidence: `artifacts/full-review/round-1/after-journey/{chromium,webkit}/{desktop-en,phone-zh}/natural-last-ember.png` / `artifacts/full-review/round-1/after-journey/{chromium,webkit}/{desktop-en,phone-zh}/result-put-out.png` / `artifacts/full-review/round-1/after-journey/{chromium,webkit}/{desktop-en,phone-zh}/result-burned-down.png`; capture/review remains pending where absent or uninspected.

## D. The altar and the hall interior (P1-P2, T2)

- **D1 (P1)** The four small altar lamps and the brass burner are smooth grey plastic with faceted
  silhouettes and token feet (`artifacts/snow-resting-props/resting-props-before/desktop-en/altar-left-contact.png`,
  `art/build/snow-roof-resting-contacts-native-preview/desktop-en/altar-burner-contact.png`).
  Remake as old cast bronze: round silhouettes, cast rims and bands, real legs and handles on the
  burner, worn bright high points, dark recesses and patina, soot above the wicks, oil stains, spilled
  ash. Keep the corrected contacts, rerun the contact audit.

  Round 1 — **partly**. Rounded cast vessels, burner legs/handles, patina/pitting/soot/oil/ash are retained in Source18. All47 source/prepared/raw/decoded contact groups pass2 mm gap/5 mm penetration; bronze realism and contact-shadow appearance still require final altar closeups. Before: `artifacts/snow-resting-props/resting-props-before/desktop-en/altar-left-contact.png` / `artifacts/snow-resting-props/resting-props-before/desktop-en/altar-burner-contact.png`. After: Final four-context evidence: `artifacts/full-review/round-1/after-journey/{chromium,webkit}/{desktop-en,phone-zh}/detail-contact-altar-minus-0-95.png` / `artifacts/full-review/round-1/after-journey/{chromium,webkit}/{desktop-en,phone-zh}/detail-contact-altar-burner-assembly.png`; capture/review remains pending where absent or uninspected. Receipts: `docs/evidence/full-review/round-1-snow-source18.json`, `docs/evidence/full-review/round-1-snow-source18-package.json`.

- **D2 (P2)** "Others' lamps" are four identical lamps in a mirror-symmetric row. Make them read as lit
  by different people: different sizes and kinds, different fuel levels, one or two already out with a
  blackened wick, wax or oil drips, an offering or two. Not symmetric.

  Round 1 — **partly**. Unequal/offset bronze and clay fixtures, differing fuel and one0 W spent cup plus supported note/bowl remain delivered. Seven measured wick records preserve actual lit state; final asymmetry/readability still needs the altar frame. Before: `artifacts/snow-journey/final-contact/desktop-en/burning.png` (phone comparison: same filenames under `artifacts/snow-journey/final-contact/phone-zh/`). After: Available, not yet visually accepted: `artifacts/full-review/round-1/after-motion/chromium/desktop-en/burning.png`. Final four-context evidence: `artifacts/full-review/round-1/after-journey/{chromium,webkit}/{desktop-en,phone-zh}/burning.png` / `artifacts/full-review/round-1/after-journey/{chromium,webkit}/{desktop-en,phone-zh}/detail-contact-altar-0-95.png`; capture/review remains pending where absent or uninspected. Receipts: `docs/evidence/full-review/round-1-snow-source18-package.json`.

- **D3 (P2)** The whole interior is under-exposed in choose and confirm (`lamp-preset.png`,
  `confirm.png`): the screen, beams and columns are barely visible. The brief asked for warm red
  columns, painted beams and bracket sets; in captures the columns read dark brown/black and the
  beams as thin gold lines. Raise the authored ambient and fixture contribution so the hall reads as a
  hall at night, not a black box.

  Round 1 — **partly**. The selected Source18 lighting/material view is installed: room.9 W, door.6 W, red/teal normal.03, hall-floor diffuse3×, shared pre-exposure 40 and residual+.35 EV. Final red timber/interior exposure is still a picture judgment. Before: `artifacts/snow-journey/final-contact/desktop-en/lamp-preset.png` (phone comparison: same filenames under `artifacts/snow-journey/final-contact/phone-zh/`). After: Available, not yet visually accepted: `artifacts/full-review/round-1/after-motion/chromium/desktop-en/choose.png` / `artifacts/full-review/round-1/after-motion/chromium/desktop-en/burning.png`. Final four-context evidence: `artifacts/full-review/round-1/after-journey/{chromium,webkit}/{desktop-en,phone-zh}/choose.png` / `artifacts/full-review/round-1/after-journey/{chromium,webkit}/{desktop-en,phone-zh}/burning.png`; capture/review remains pending where absent or uninspected. Receipts: `docs/evidence/full-review/round-1-snow-source18.json`, `docs/evidence/full-review/round-1-snow-source18-package.json`.

- **D4 (P2)** Side walls are flat dark plaster with no structure; the ceiling is a flat plank plane with
  a few diamond outlines. Add the structure the brief named: painted beams with readable colour,
  ceiling panels, bracket sets at column heads, soot above the lamps, dust in the air.

  Round 1 — **partly**. Delivered construction retains real framing, brackets, beams/coffers, painted panels and exported wear; sparse source-authored dust stays live. Source18 removes only the blank east paper backing while retaining its lattice/opening. Final readability remains open. Before: `artifacts/snow-journey/final-contact/desktop-en/burning.png` (phone comparison: same filenames under `artifacts/snow-journey/final-contact/phone-zh/`). After: Available, not yet visually accepted: `artifacts/full-review/round-1/after-motion/chromium/desktop-en/burning.png`. Final four-context evidence: `artifacts/full-review/round-1/after-journey/{chromium,webkit}/{desktop-en,phone-zh}/burning.png` / `artifacts/full-review/round-1/after-journey/{chromium,webkit}/{desktop-en,phone-zh}/detail-painted-beams-and-brackets.png`; capture/review remains pending where absent or uninspected. Receipts: `docs/evidence/full-review/round-1-snow-source18.json`.

- **D5 (P2)** The altar top shows a blotchy, stretched-looking reflection
  (`resting-props-before/desktop-en/altar-left-contact.png`). Check the scanned table's roughness and
  UVs; it should read as worn lacquer.

  Round 1 — **partly**. The original scanned console UV/albedo/normal and satin lacquer response remain in the delivery, with declared image/storage precision. Final low-angle table appearance must be inspected; geometric/contact checks alone do not accept its reflection. Before: `artifacts/snow-resting-props/resting-props-before/desktop-en/altar-left-contact.png`. After: Final four-context evidence: `artifacts/full-review/round-1/after-journey/{chromium,webkit}/{desktop-en,phone-zh}/detail-contact-scanned-console-altar.png`; capture/review remains pending where absent or uninspected. Receipts: `docs/evidence/full-review/round-1-snow-source18-package.json`.

- **D6 (P3)** Incense smoke over the burner is barely visible; give it a thin, slow, readable thread.

  Round 1 — **partly**. Two slow incense strands use evaluated rod-tip anchors and saved rise/width/speed metadata. Final readable smoke needs the actual moving altar view; a static contact image cannot establish its motion. Before: `artifacts/snow-journey/final-contact/desktop-en/burning.png` (phone comparison: same filenames under `artifacts/snow-journey/final-contact/phone-zh/`). After: Available, not yet visually accepted: `artifacts/full-review/round-1/after-motion/chromium/desktop-en/burning.png`. Final four-context evidence: `artifacts/full-review/round-1/after-journey/{chromium,webkit}/{desktop-en,phone-zh}/burning.png` / `artifacts/full-review/round-1/after-journey/{chromium,webkit}/{desktop-en,phone-zh}/detail-contact-altar-burner-assembly.png`; capture/review remains pending where absent or uninspected.

- **D7 (P2; found during Round 1 integration)** Bright orange patches on the painted beams and columns read as starbursts rather than wood under soft fixture light. Actual fixture-specular, all-specular and paint-normal controls leave these patches unchanged. Native diffuse EXRs already contain the variation; eight-sample variance and per-chart OIDN spread it before delivery encoding.

  Round 1 — **partly**. The final Source18 uses reduced paint-normal strength .03 and one fresh all 16 fixed64 Metal/OIDN batch. The earlier Source17 mixed64/256 diagnostics are historical; no old GI pixels enter this delivery. Whether broad beam/column star patches are acceptably gone remains explicitly open until final frames/static sequences are inspected. Before: `artifacts/full-review/round-1/snow17-material-controls/burning-baseline.png`. After: Available, not yet visually accepted: `artifacts/full-review/round-1/after-motion/chromium/desktop-en/burning.png`. Final four-context evidence: `artifacts/full-review/round-1/after-journey/{chromium,webkit}/{desktop-en,phone-zh}/burning.png`; capture/review remains pending where absent or uninspected. Receipts: `docs/evidence/full-review/round-1-snow-source18.json`, `docs/evidence/full-review/round-1-snow-source18-package.json`.

## E. Exterior: snowfield, gate, court, hall facade (P2, T2)

- **E1** The single line of footprints the brief asks for does not read in `place.png` or `walk-1.png`;
  the snowfield is uniform noise. Footprints must be clearly visible from the place view and while
  walking, leading through the gate.

  Round 1 — **partly**. Actual depressed alternating footprints remain in the delivered continuous snowfield; final wide place and walk readability remains open. Before: `artifacts/snow-journey/final-contact/desktop-en/place.png` (phone comparison: same filenames under `artifacts/snow-journey/final-contact/phone-zh/`). After: Available, not yet visually accepted: `artifacts/full-review/round-1/after-motion/chromium/desktop-en/place.png` / `artifacts/full-review/round-1/after-motion/chromium/desktop-en/walk-1.png`. Final four-context evidence: `artifacts/full-review/round-1/after-journey/{chromium,webkit}/{desktop-en,phone-zh}/place.png` / `artifacts/full-review/round-1/after-journey/{chromium,webkit}/{desktop-en,phone-zh}/walk-1.png`; capture/review remains pending where absent or uninspected. Receipts: `docs/evidence/full-review/round-1-snow-source18-package.json`.

- **E2** Gate and court walls are large flat dark boxes with uniform plaster (`place.png`, `walk-1.png`):
  no base course, no coping tiles on the wall tops, no weathering, no drifts against them. The side
  roofs behind the wall look like separate half-roofs resting on it.

  Round 1 — **partly**. Stone base courses, individual curved coping, uneven snow/weathering and supported complete side-roof construction remain in Source18. Actual wide-view architecture still needs final review. Before: `artifacts/snow-journey/final-contact/desktop-en/place.png` (phone comparison: same filenames under `artifacts/snow-journey/final-contact/phone-zh/`). After: Available, not yet visually accepted: `artifacts/full-review/round-1/after-motion/chromium/desktop-en/place.png` / `artifacts/full-review/round-1/after-motion/chromium/desktop-en/walk-1.png`. Final four-context evidence: `artifacts/full-review/round-1/after-journey/{chromium,webkit}/{desktop-en,phone-zh}/place.png` / `artifacts/full-review/round-1/after-journey/{chromium,webkit}/{desktop-en,phone-zh}/walk-1.png`; capture/review remains pending where absent or uninspected. Receipts: `docs/evidence/full-review/round-1-snow-source18-package.json`.

- **E3** Trees are sparse stick figures cut by the frame edges, placed symmetrically
  (`place.png`). Bare winter trees need real branching, snow on branches, varied sizes and positions;
  add far roofs and a far treeline so the court is not alone in a blank field.

  Round 1 — **partly**. Asymmetric branched winter trees, supported bough snow and distant roof/tree layers remain delivered. Natural silhouettes and edge cropping are still aesthetic limits to judge. Before: `artifacts/snow-journey/final-contact/desktop-en/place.png` (phone comparison: same filenames under `artifacts/snow-journey/final-contact/phone-zh/`). After: Available, not yet visually accepted: `artifacts/full-review/round-1/after-motion/chromium/desktop-en/place.png`. Final four-context evidence: `artifacts/full-review/round-1/after-journey/{chromium,webkit}/{desktop-en,phone-zh}/place.png`; capture/review remains pending where absent or uninspected. Receipts: `docs/evidence/full-review/round-1-snow-source18-package.json`.

- **E4** Snow on roofs is a thin uniform slab; eaves read as a row of identical round dots.
  Soft caps with thickness and overhang, drifts, icicles that read.

  Round 1 — **partly**. Closed curved roof-snow volumes, varying overhang/drifts and icicles remain. Fresh Source18 hidden-face proofs remove only certified enclosed roof faces from export; all bake occluders remain. Final roof edges require inspection. Before: `artifacts/snow-journey/final-contact/desktop-en/place.png` (phone comparison: same filenames under `artifacts/snow-journey/final-contact/phone-zh/`). After: Available, not yet visually accepted: `artifacts/full-review/round-1/after-motion/chromium/desktop-en/place.png` / `artifacts/full-review/round-1/after-motion/chromium/desktop-en/walk-3.png`. Final four-context evidence: `artifacts/full-review/round-1/after-journey/{chromium,webkit}/{desktop-en,phone-zh}/place.png` / `artifacts/full-review/round-1/after-journey/{chromium,webkit}/{desktop-en,phone-zh}/walk-3.png`; capture/review remains pending where absent or uninspected. Receipts: `docs/evidence/full-review/round-1-snow-source18-package.json`.

- **E5** Walking through the gate (`walk-2.png`) about half the frame is pure black gate passage.
  Light the passage a little from the gate lamps and the court so it has form.

  Round 1 — **partly**. Actual gate fixtures and the source-authored cool passage contribution remain baked in fresh Source18 maps. Final walk-2 form and absence of pure-black passage still need inspection. Before: `artifacts/snow-journey/final-contact/desktop-en/walk-2.png` (phone comparison: same filenames under `artifacts/snow-journey/final-contact/phone-zh/`). After: Available, not yet visually accepted: `artifacts/full-review/round-1/after-motion/chromium/desktop-en/walk-2.png`. Final four-context evidence: `artifacts/full-review/round-1/after-journey/{chromium,webkit}/{desktop-en,phone-zh}/walk-2.png`; capture/review remains pending where absent or uninspected. Receipts: `docs/evidence/full-review/round-1-snow-source18-package.json`.

- **E6** Hall facade (`walk-3.png`): large flat dark green-grey wall panels, lattice windows filled with
  blotchy blue noise instead of paper, columns not red, no visible eave overhang or painted beam
  ends. The doors are narrow for a main hall. The snow banks beside the steps are smooth blobs with
  faceted edges. This is the last frame before entering and should be one of the strongest.

  Round 1 — **partly**. The delivered facade has real columns/bases, red/teal framing, built wide doors, eaves, worn steps and continuous snow. Source18 paint/view changes are installed; final walk-3 strength/readability remains open. Before: `artifacts/snow-journey/final-contact/desktop-en/walk-3.png` (phone comparison: same filenames under `artifacts/snow-journey/final-contact/phone-zh/`). After: Available, not yet visually accepted: `artifacts/full-review/round-1/after-motion/chromium/desktop-en/walk-3.png`. Final four-context evidence: `artifacts/full-review/round-1/after-journey/{chromium,webkit}/{desktop-en,phone-zh}/walk-3.png`; capture/review remains pending where absent or uninspected. Receipts: `docs/evidence/full-review/round-1-snow-source18-package.json`.

- **E7** A white snow blob sits in the doorway seen from the place view (`place.png`, phone
  `place.png`); it reads as an object, not snow on the steps.

  Round 1 — **partly**. Continuous ground/step-edge snow replaces the old separate doorway blob construction and keeps the landing clear. Final wide/phone silhouette and residual seam are still visual checks. Before: `artifacts/snow-journey/final-contact/desktop-en/place.png` (phone comparison: same filenames under `artifacts/snow-journey/final-contact/phone-zh/`). After: Available, not yet visually accepted: `artifacts/full-review/round-1/after-motion/chromium/desktop-en/place.png`. Final four-context evidence: `artifacts/full-review/round-1/after-journey/{chromium,webkit}/{desktop-en,phone-zh}/place.png` / `artifacts/full-review/round-1/after-journey/{chromium,webkit}/{desktop-en,phone-zh}/detail-continuous-step-snow.png`; capture/review remains pending where absent or uninspected. Receipts: `docs/evidence/full-review/round-1-snow-source18-package.json`.

- **E8** The court itself is empty: no stone lantern, no incense stand, no swept path, no trees. Give it
  the few things a real court has.

  Round 1 — **partly**. Supported court stone lantern/oil cup, incense stand/ash/spent sticks, swept/footprint route, benches and trees remain. Strict contacts pass; final court view still needs inspection. Before: `artifacts/snow-journey/final-contact/desktop-en/place.png` (phone comparison: same filenames under `artifacts/snow-journey/final-contact/phone-zh/`). After: Available, not yet visually accepted: `artifacts/full-review/round-1/after-motion/chromium/desktop-en/walk-2.png`. Final four-context evidence: `artifacts/full-review/round-1/after-journey/{chromium,webkit}/{desktop-en,phone-zh}/walk-2.png` / `artifacts/full-review/round-1/after-journey/{chromium,webkit}/{desktop-en,phone-zh}/detail-contact-court-incense-stand.png`; capture/review remains pending where absent or uninspected. Receipts: `docs/evidence/full-review/round-1-snow-source18-package.json`.

- **E9** The doorway seen from inside (`burning.png`): the angled door leaves and a flat pale-blue
  trapezoid above them make it look like a cut-out. Check the door leaf geometry and what fills the
  space above them.

  Round 1 — **partly**. Real jambs/lintel/transom, studded door leaves/hinges/rings remain; the view beyond is the actual court. Source18 removes only the east blank side-window paper. Final doorway silhouette must still read as construction. Before: `artifacts/snow-journey/final-contact/desktop-en/burning.png` (phone comparison: same filenames under `artifacts/snow-journey/final-contact/phone-zh/`). After: Available, not yet visually accepted: `artifacts/full-review/round-1/after-motion/chromium/desktop-en/burning.png`. Final four-context evidence: `artifacts/full-review/round-1/after-journey/{chromium,webkit}/{desktop-en,phone-zh}/burning.png` / `artifacts/full-review/round-1/after-journey/{chromium,webkit}/{desktop-en,phone-zh}/detail-doorway-built-frame.png`; capture/review remains pending where absent or uninspected. Receipts: `docs/evidence/full-review/round-1-snow-source18-package.json`.

- **E10** Codex's own open items from `docs/evidence/snow-journey/remaining-visual-limits.md`: the grey
  seam where snow meets the base, distance and trees. Carry them here.

  Round 1 — **partly**. The old seam, distance and tree limits are carried forward explicitly. Continuous snow and more complete distant architecture/trees are delivered, but no claim that the old grey/scalloped seam or authored-tree artificiality is eliminated follows from source checks. Before: `artifacts/snow-journey/final-contact/desktop-en/place.png` (phone comparison: same filenames under `artifacts/snow-journey/final-contact/phone-zh/`). After: Available, not yet visually accepted: `artifacts/full-review/round-1/after-motion/chromium/desktop-en/place.png`. Final four-context evidence: `artifacts/full-review/round-1/after-journey/{chromium,webkit}/{desktop-en,phone-zh}/place.png` / `artifacts/full-review/round-1/after-journey/{chromium,webkit}/{desktop-en,phone-zh}/detail-wall-base-snow.png`; capture/review remains pending where absent or uninspected. Receipts: `docs/evidence/full-review/round-1-snow-source18-package.json`.

## F. UI and flow (P1-P3, T1/T2)

- **F1 (P1, T1)** Empty wish: "Set my wish" is disabled with nothing telling the person why. Keep it
  enabled-looking enough to tap, and on tap with an empty wish show an inline hint at the field; or
  show the hint under the field. The disabled gold button on dark (`home.png`, phone `home.png`) is
  barely readable.

  Round 1 — **partly**. Empty-wish action now shows the inline field hint and focuses the textarea; final readable enabled/action state remains to inspect. Before: `artifacts/snow-journey/final-contact/desktop-en/home.png` (phone comparison: same filenames under `artifacts/snow-journey/final-contact/phone-zh/`). After: Final four-context evidence: `artifacts/full-review/round-1/after-journey/{chromium,webkit}/{desktop-en,phone-zh}/wish-empty-inline.png`; capture/review remains pending where absent or uninspected.

- **F2 (P1, T1)** After "Set my wish", "Step inside" is disabled for 1-4 s while the place loads, with
  no sign of progress. Show loading progress (the 59 MB package makes this long on a phone) and make
  the button state obvious.

  Round 1 — **partly**. Verified prefetch starts while writing and exposes downloading/preparing/ready/error+Retry. Both final scene packages are installed. Earlier Source15 checksum-fault Retry tests pass; they are historical controls, not final-source network-failure proof. Before: `artifacts/snow-journey/final-contact/desktop-en/home.png` (phone comparison: same filenames under `artifacts/snow-journey/final-contact/phone-zh/`). After: Available, not yet visually accepted: `artifacts/full-review/round-1/after-motion/chromium/desktop-en/wish-loading.png` / `artifacts/full-review/round-1/after-motion/chromium/desktop-en/place.png`. Final four-context evidence: `artifacts/full-review/round-1/after-journey/{chromium,webkit}/{desktop-en,phone-zh}/wish-loading.png` / `artifacts/full-review/round-1/after-journey/{chromium,webkit}/{desktop-en,phone-zh}/place.png`; capture/review remains pending where absent or uninspected. Receipts: `docs/evidence/full-review/round-1-loading-retry.json`.

- **F3 (P2)** Buttons wrap their labels: "Take this one · / 30 min", "Light it · 10 / min", "Back to
  the / court", "Make a new / wish" (`lamp-preset.png`, `confirm.png`, `result-went-out.png`). Labels
  stay on one line; shorten copy or widen buttons.

  Round 1 — **partly**. Labels/controls use one-line treatments and revised copy; earlier218-frame UI verification found no wrapping, but final Source18/19 layout/locale acceptance needs the fresh captures. Before: `artifacts/snow-journey/final-contact/desktop-en/lamp-preset.png` (phone comparison: same filenames under `artifacts/snow-journey/final-contact/phone-zh/`). After: Available, not yet visually accepted: `artifacts/full-review/round-1/after-motion/chromium/desktop-en/choose.png`. Final four-context evidence: `artifacts/full-review/round-1/after-journey/{chromium,webkit}/{desktop-en,phone-zh}/choose.png` / `artifacts/full-review/round-1/after-journey/{chromium,webkit}/{desktop-en,phone-zh}/result-went-out.png`; capture/review remains pending where absent or uninspected.

- **F4 (P2)** Burning controls (Mute, Save power, Hide wish, Show time left, Put out) are 13 px plain
  text, several wrap to two lines, and they do not look tappable (`burning.png`). Make them one line,
  legible, clearly controls, and keep them from covering the scene's subject. Consider fading them
  after a few seconds without input and back on tap or mouse move.

  Round 1 — **partly**. Burning controls have44px minimum targets, boxed states and idle fade with return on input/focus. Tap affordance, one-line labels and subject overlap still require final desktop/phone review. Before: `artifacts/snow-journey/final-contact/desktop-en/burning.png` (phone comparison: same filenames under `artifacts/snow-journey/final-contact/phone-zh/`). After: Available, not yet visually accepted: `artifacts/full-review/round-1/after-motion/chromium/desktop-en/burning.png`. Final four-context evidence: `artifacts/full-review/round-1/after-journey/{chromium,webkit}/{desktop-en,phone-zh}/burning.png` / `artifacts/full-review/round-1/after-journey/{chromium,webkit}/{desktop-en,phone-zh}/sound-muted.png`; capture/review remains pending where absent or uninspected.

- **F5 (P2)** The wish text in burning sits over the altar and lamps (`ignition-walking.png`,
  phone `ignition-spreading.png`); in the new burning view it must not cover the lantern, altar lamps
  or doorway.

  Round 1 — **partly**. Wish/meta/controls are placed in the lower HUD and fade on idle. Final target hierarchy/overlap must be checked against the new lantern/altar/door composition. Before: `artifacts/snow-journey/final-contact/desktop-en/ignition-walking.png` (phone comparison: same filenames under `artifacts/snow-journey/final-contact/phone-zh/`). After: Available, not yet visually accepted: `artifacts/full-review/round-1/after-motion/chromium/desktop-en/light-walking.png` / `artifacts/full-review/round-1/after-motion/chromium/desktop-en/burning.png`. Final four-context evidence: `artifacts/full-review/round-1/after-journey/{chromium,webkit}/{desktop-en,phone-zh}/light-walking.png` / `artifacts/full-review/round-1/after-journey/{chromium,webkit}/{desktop-en,phone-zh}/burning.png`; capture/review remains pending where absent or uninspected.

- **F6 (P2)** The choose panel jumps vertically between states because it is vertically centred
  (title at y=215, 254 and 182 in `lamp-preset.png`, `lamp-drawn.png`, `lamp-24-hours.png`). Anchor it so
  switching tabs or durations does not move the panel.

  Round 1 — **partly**. Choose layout/readout/notes are anchored across preset/drawing/duration states. Final panel position must be compared in the actual short/24h/drawn captures. Before: `artifacts/snow-journey/final-contact/desktop-en/lamp-preset.png` (phone comparison: same filenames under `artifacts/snow-journey/final-contact/phone-zh/`). After: Available, not yet visually accepted: `artifacts/full-review/round-1/after-motion/chromium/desktop-en/choose.png`. Final four-context evidence: `artifacts/full-review/round-1/after-journey/{chromium,webkit}/{desktop-en,phone-zh}/choose.png` / `artifacts/full-review/round-1/after-journey/{chromium,webkit}/{desktop-en,phone-zh}/choose-24-hours.png` / `artifacts/full-review/round-1/after-journey/{chromium,webkit}/{desktop-en,phone-zh}/draw-small.png`; capture/review remains pending where absent or uninspected.

- **F7 (P3)** The wish textarea has no inner padding: typed text touches the left border
  (`wish-written.png`).

  Round 1 — **partly**. Textarea inner padding and field hint styling are implemented. Final typed English/Chinese text inset remains a screenshot check. Before: `artifacts/snow-journey/final-contact/desktop-en/wish-written.png` (phone comparison: same filenames under `artifacts/snow-journey/final-contact/phone-zh/`). After: Available, not yet visually accepted: `artifacts/full-review/round-1/after-motion/chromium/desktop-en/wish-written.png`. Final four-context evidence: `artifacts/full-review/round-1/after-journey/{chromium,webkit}/{desktop-en,phone-zh}/wish-written.png`; capture/review remains pending where absent or uninspected.

- **F8 (P3)** Burning UI appears before the flame is lit ("With you 0 min", `ignition-igniting.png`).
  Bring it in after the catch.

  Round 1 — **partly**. Presence/toast/HUD information is gated on the actual caught state. Final ignition timing must confirm it appears only after catch. Before: `artifacts/snow-journey/final-contact/desktop-en/ignition-igniting.png` (phone comparison: same filenames under `artifacts/snow-journey/final-contact/phone-zh/`). After: Available, not yet visually accepted: `artifacts/full-review/round-1/after-motion/chromium/desktop-en/light-igniting.png` / `artifacts/full-review/round-1/after-motion/chromium/desktop-en/light-spreading.png`. Final four-context evidence: `artifacts/full-review/round-1/after-journey/{chromium,webkit}/{desktop-en,phone-zh}/light-igniting.png` / `artifacts/full-review/round-1/after-journey/{chromium,webkit}/{desktop-en,phone-zh}/light-spreading.png`; capture/review remains pending where absent or uninspected.

- **F9 (P3)** The opening corner bracket of the wish on confirm has a stray leading gap
  (`confirm.png`).

  Round 1 — **partly**. The separate confirm wish quotation is removed with that route; there is no replacement confirm gap to preserve. Remaining choose/result typography still needs final inspection. Before: `artifacts/snow-journey/final-contact/desktop-en/confirm.png` (phone comparison: same filenames under `artifacts/snow-journey/final-contact/phone-zh/`). After: Available, not yet visually accepted: `artifacts/full-review/round-1/after-motion/chromium/desktop-en/choose.png`. Final four-context evidence: `artifacts/full-review/round-1/after-journey/{chromium,webkit}/{desktop-en,phone-zh}/choose.png`; capture/review remains pending where absent or uninspected.

- **F10 (P3)** Skip is a small grey box in the corner (`walk-1.png`); make it match the rest of the UI.

  Round 1 — **partly**. Skip is styled as a normal product control. Final walking screenshots/video still need visual/tap review. Before: `artifacts/snow-journey/final-contact/desktop-en/walk-1.png` (phone comparison: same filenames under `artifacts/snow-journey/final-contact/phone-zh/`). After: Available, not yet visually accepted: `artifacts/full-review/round-1/after-motion/chromium/desktop-en/walk-1.png`. Final four-context evidence: `artifacts/full-review/round-1/after-journey/{chromium,webkit}/{desktop-en,phone-zh}/walk-1.png`; capture/review remains pending where absent or uninspected.

- **F12 (P1, T2)** Drop the separate confirm step (`confirm.png`, "It's in place, waiting for you" with
  Look again / Light it). Choosing and lighting are one step: the choose panel's primary button is
  "Light it · 30 min" and lights the lamp directly. Move what the confirm screen carried into the choose
  panel: one line of the rule just above the button (leaving puts it out, it cannot be relit), the
  extra note for 12 h and longer, and any light error inline. The camera move toward the lantern
  (`closeUp()`) becomes the first beat of ignition. Delete the confirm screen, its copy in both
  languages, `toConfirm`, `backToCandle` and `backToChoose()`, and their tests; nothing keeps the old path.

  Round 1 — **partly**. The separate confirm screen, navigation moves and copy are removed. Choose Light it starts actual ignition; rules, long-duration note and error stay inline. Current motion records the direct-light interaction; final complete-context flow/notes still need review. Before: `artifacts/snow-journey/final-contact/desktop-en/confirm.png` (phone comparison: same filenames under `artifacts/snow-journey/final-contact/phone-zh/`). After: Available, not yet visually accepted: `artifacts/full-review/round-1/after-motion/chromium/desktop-en/choose.png` / `artifacts/full-review/round-1/after-motion/chromium/desktop-en/light-ignition.png`. Final four-context evidence: `artifacts/full-review/round-1/after-journey/{chromium,webkit}/{desktop-en,phone-zh}/choose.png` / `artifacts/full-review/round-1/after-journey/{chromium,webkit}/{desktop-en,phone-zh}/choose-24-hours.png` / `artifacts/full-review/round-1/after-journey/{chromium,webkit}/{desktop-en,phone-zh}/light-ignition.png`; capture/review remains pending where absent or uninspected.

- **F11 (P3)** Result copy is clunky: "With you 1 min of 10 min. Out, and it cannot be relit." Rewrite
  both endings' copy in English and Chinese so it reads as a person would say it.

  Round 1 — **partly**. English/Chinese ending copy is rewritten. Final went-out and burned-down text should be read in the actual result frames, not accepted from source strings alone. Before: `artifacts/snow-journey/final-contact/desktop-en/result-went-out.png` (phone comparison: same filenames under `artifacts/snow-journey/final-contact/phone-zh/`). After: Final four-context evidence: `artifacts/full-review/round-1/after-journey/{chromium,webkit}/{desktop-en,phone-zh}/result-went-out.png` / `artifacts/full-review/round-1/after-journey/{chromium,webkit}/{desktop-en,phone-zh}/result-burned-down.png`; capture/review remains pending where absent or uninspected.

## G. My Lamps and Ten Lights with one place (P2, T2)

- **G1** Ten Lights (`ten-lights.png`) says the same thing twice: the summary row and a "Snow Roof Court"
  section repeat the same numbers, and the bottom half is empty. With one visible place, show one
  well-designed section for this court.

  Round 1 — **partly**. One visible court uses one consolidated statistics section rather than a duplicate summary. Final single-place density/copy/layout remains to inspect. Before: `artifacts/snow-journey/final-contact/desktop-en/ten-lights.png` (phone comparison: same filenames under `artifacts/snow-journey/final-contact/phone-zh/`). After: Final four-context evidence: `artifacts/full-review/round-1/after-journey/{chromium,webkit}/{desktop-en,phone-zh}/ten-lights.png`; capture/review remains pending where absent or uninspected.

- **G2** My Lamps (`my-lamps.png`): "Went out · not burned down" is redundant; "Ended because another
  view was opened" is technical; date ranges repeat the date ("17 Nov 2026, 03:37 – 17 Nov 2026,
  03:38"); the "Snow Roof Court" sub-label under the title is redundant with one place; every row
  repeats a "Light a new one for this wish" link. Tighten the copy and the row design, both languages.

  Round 1 — **partly**. Rows use tighter localized state/date text and progressive expansion with fewer redundant place/actions. Final record copy, dates and layout remain open. Before: `artifacts/snow-journey/final-contact/desktop-en/my-lamps.png` (phone comparison: same filenames under `artifacts/snow-journey/final-contact/phone-zh/`). After: Final four-context evidence: `artifacts/full-review/round-1/after-journey/{chromium,webkit}/{desktop-en,phone-zh}/my-lamps.png` / `artifacts/full-review/round-1/after-journey/{chromium,webkit}/{desktop-en,phone-zh}/record-expanded.png`; capture/review remains pending where absent or uninspected.

- **G3** Thumbnails: see C3.

  Round 1 — **partly**. Uses the same real 3D state-aware thumbnails as C3. Final extinguished/burned-down record thumbnails still need comparison with the3D result. Before: `artifacts/snow-journey/final-contact/desktop-en/my-lamps.png` (phone comparison: same filenames under `artifacts/snow-journey/final-contact/phone-zh/`). After: Final four-context evidence: `artifacts/full-review/round-1/after-journey/{chromium,webkit}/{desktop-en,phone-zh}/my-lamps.png` / `artifacts/full-review/round-1/after-journey/{chromium,webkit}/{desktop-en,phone-zh}/result-burned-down.png`; capture/review remains pending where absent or uninspected.

## H. Performance and platform (P2, T1/T2)

- **H1** The package is 59.3 MB against an 8 MB reference. Bring it to 15 MB or less without visible
  loss: lightmap resolution per region, KTX2 settings, mesh compression, unused textures.

  Round 1 — **partly**. The complete final Snow18 package is14,970,553 B including manifest, all 16 maps, fabric and shared116,705 B native AgX, leaving29,447 B under15MB. Literal decoded contacts and declared precision pass. The byte target is met; without-visible-loss remains Root visual judgment. Before: `artifacts/snow-journey/final-contact/desktop-en/place.png` (phone comparison: same filenames under `artifacts/snow-journey/final-contact/phone-zh/`). After: Available, not yet visually accepted: `artifacts/full-review/round-1/after-motion/chromium/desktop-en/place.png` / `artifacts/full-review/round-1/after-motion/chromium/desktop-en/burning.png`. Final four-context evidence: `artifacts/full-review/round-1/after-journey/{chromium,webkit}/{desktop-en,phone-zh}/place.png` / `artifacts/full-review/round-1/after-journey/{chromium,webkit}/{desktop-en,phone-zh}/burning.png`; capture/review remains pending where absent or uninspected. Receipts: `docs/evidence/full-review/round-1-snow-source18-package.json`.

- **H2** A physical phone has never been tested; all phone evidence is desktop emulation. State this in
  the final report; don't claim phone performance from emulation.

  Round 1 — **done (scope disclosure)**. Scope disclosure retained: no physical phone was tested. Final phone evidence is390×844CSS desktop-GPU viewport/touch emulation; performance uses DSF2 with renderer ratio1.25 (487×1055 buffer), power saver390×844. This does not establish real-phone FPS or touch-stroke behavior. Before: `artifacts/snow-journey/final-contact/desktop-en/place.png` (phone comparison: same filenames under `artifacts/snow-journey/final-contact/phone-zh/`). After: Available, not yet visually accepted: `artifacts/full-review/round-1/after-motion/chromium/desktop-en/place.png`. Final four-context evidence: `artifacts/full-review/round-1/after-journey/{chromium,webkit}/{desktop-en,phone-zh}/place.png`; capture/review remains pending where absent or uninspected. Receipts: `docs/evidence/full-review/round-1-final-phone-performance.json`.
- **H3 (P1, T1)** Safari and iPhone: every browser on iPhone runs WebKit, so a Safari problem is a phone
  problem. The owner saw one in Safari. Drive the full journey in Playwright's WebKit at both sizes,
  find the cause and fix it; the journey must work and look the same as in Chrome.

  Round 1 — **partly**. Chromium157 and WebKit27.2 final phone timing has12 valid10 s windows, zero errors and unchanged source: cover51.55/52.11 FPS, Snow outside/choose about60, normal/restored burning30, saver15. WebKit GPU timer is unsupported. Final motion currently records two Chromium contexts plus a WebKit-desktop90 s startup wait timeout; full four-context recorder/journey parity is pending. Desktop Cloud earlier20.1 FPS remains a limit. Before: `artifacts/snow-journey/final-contact/desktop-en/burning.png` (phone comparison: same filenames under `artifacts/snow-journey/final-contact/phone-zh/`). After: Available, not yet visually accepted: `artifacts/full-review/round-1/after-motion/chromium/desktop-en/choose.png` / `artifacts/full-review/round-1/after-motion/chromium/desktop-en/burning.png`. Final four-context evidence: `artifacts/full-review/round-1/after-journey/{chromium,webkit}/{desktop-en,phone-zh}/choose.png` / `artifacts/full-review/round-1/after-journey/{chromium,webkit}/{desktop-en,phone-zh}/burning.png`; capture/review remains pending where absent or uninspected. Receipts: `docs/evidence/full-review/round-1-final-phone-performance.json`.

- **H4 (P2)** The repository is growing fast: `.git` is 253 MB, holding two versions of
  `snow-roof.glb` (36 MB and 15 MB) and evidence files of 15-18 MB each
  (`docs/evidence/snow-journey/final-delivery-summary.json`, `docs/evidence/blender-pilot/geometry-v*/comparison.html`).
  Every round of this loop would add both scenes' packages and all captures. Commit only the delivered
  assets and small text evidence; keep captures, videos, EXRs and other bulky intermediates in
  git-ignored folders, or move binaries to Git LFS. Remove the bulky evidence files already tracked.

  Round 1 — **partly**. All 132 bulky evidence originals (137,596,464 B) remain hash-exact in the ignored archive; all 120 deleted tracked binaries are indexed.35 inactive Snow/general research files and the Cloud50-file archive preserve work outside the commit. Text-size/whitespace/lint/typecheck checks passed at their recorded snapshots. Final commit and its final evidence gate remain Root-owned; Git history was not rewritten. Before: `artifacts/snow-journey/final-contact/desktop-en/home.png` (phone comparison: same filenames under `artifacts/snow-journey/final-contact/phone-zh/`). After: Available, not yet visually accepted: `artifacts/full-review/round-1/after-motion/chromium/desktop-en/home.png`. Final four-context evidence: `artifacts/full-review/round-1/after-journey/{chromium,webkit}/{desktop-en,phone-zh}/home.png`; capture/review remains pending where absent or uninspected. Receipts: `docs/evidence/archive-index.json`, `docs/evidence/full-review/round-1-snow-research-archive.json`.

- **H5 (P2)** Sound cannot be judged from captures. Check what can be measured: no clipping, levels
  balanced between snow ambience, bell and flame, loops with no audible seam, bell intervals as
  designed, sound follows mute and the endings. List in the final report the exact moments the owner
  should listen to.

  Round 1 — **partly**. Offline electrical clipping/seam/mute/ending checks pass, and live AudioContext observations are being collected in the final journeys. Captured video has no audio track; the owner has not been credited with listening. Listen at startup0–3 s, flame10.398 s/wind11.75 s joins, first bell14–24 s, early mute/unmute and each ending300 ms fade. Before: `artifacts/snow-journey/final-contact/desktop-en/burning.png` (phone comparison: same filenames under `artifacts/snow-journey/final-contact/phone-zh/`). After: Final four-context evidence: `artifacts/full-review/round-1/after-journey/{chromium,webkit}/{desktop-en,phone-zh}/sound-muted.png` / `artifacts/full-review/round-1/after-journey/{chromium,webkit}/{desktop-en,phone-zh}/result-put-out.png` / `artifacts/full-review/round-1/after-journey/{chromium,webkit}/{desktop-en,phone-zh}/result-burned-down.png`; capture/review remains pending where absent or uninspected. Receipts: `docs/evidence/full-review/round-1-audio.md`.

- **H6 (P2, T1; found during Round 1 integration)** Changing a visitor lantern disposed its geometry but retained its owned cloth/rib materials in a strong reflection-material set. Repeated colour and drawing changes could retain GPU materials for the session.

  Round 1 — **done**. The resource-lifetime fix remains complete: before UI cycles grew857→905 references; after847 stayed constant for five cycles with268 geometries/90textures. Weak membership and owned-material disposal fix the leak; this is not an endurance/FPS claim. Before: `artifacts/full-review/round-1/material-before/choose.png`. After: `artifacts/full-review/round-1/material-after/choose.png`. Receipt: `docs/evidence/full-review/round-1-visitor-resources.json`. Final-source resource observations remain supplementary.

## I. Home cover: rebuild Cloud Cliff on the Blender pipeline (P1, T2)

The home page is the first thing anyone sees, and today it is still the old procedural scene (`home.png`,
phone `home.png`): the cloud sea is a flat grey plane with a hard horizon, the far ridge is a flat dark
band, the cliff face is flat, the white cloth shapes at the left edge read as crumpled geometry. It must
meet the same bar as Snow Roof Court from the first frame.

- **I1** Build the cover in Blender the same way as Snow Roof: an authored bpy scene under `art/blender/`,
  scanned CC0 assets recorded in `docs/assets.json`, Cycles bakes on Metal (night, dusk, day and the
  lamp-only map), glTF with KTX2, loaded through `web/src/engine/baked/loadPlace.js`. Contacts pass the
  resting-props audit.

  Round 1 — **done (pipeline/contact scope)**. Source19 is delivered through the Blender/Cycles/KTX2/glTF loader: one fresh12×64 fixed Metal/Metal-OIDN batch,18 resting+6 hanging contact gates at2/5 mm, genuine F32 positions/normals, verified gzip containers. Complete package is7,565,880 B including26 payloads, manifest, native AgX and six posters. This completes the pipeline/contact scope; optical items remain separate. Before: `artifacts/snow-journey/final-contact/desktop-en/home.png` (phone comparison: same filenames under `artifacts/snow-journey/final-contact/phone-zh/`). After: Final Cloud19 views exist at `artifacts/full-review/round-1/cloud19-final-{runtime-posters,webkit-lights-r2}/{night,dusk,day}-{desktop,phone}.png`; visual acceptance is not inferred from file existence. Receipts: `docs/evidence/cloud-cliff-round1/source19/final-delivery/delivery.json`.

- **I2** The scene: halls on long posts off a sheer cliff, a plank gallery over a moving sea of cloud, far
  ridges breaking through, a brass storm lantern hanging from a gallery column with its candle lit. The
  cloud sea stays live and moves; the lantern flame stays live and lights its glass and the nearest posts.

  Round 1 — **partly**. Owner-selected Source19 gallery/rock/storm-lantern direction is retained. Live source 7 density replaces the lake plane; glass, wick, actual point and teardrop remain live while static wood uses its complete authored lamp map without duplicate realtime diffuse. Final overall temple/cloud/flame hierarchy is still a visual judgment. Before: `artifacts/snow-journey/final-contact/desktop-en/home.png` (phone comparison: same filenames under `artifacts/snow-journey/final-contact/phone-zh/`). After: Final Cloud19 views exist at `artifacts/full-review/round-1/cloud19-final-{runtime-posters,webkit-lights-r2}/{night,dusk,day}-{desktop,phone}.png`; visual acceptance is not inferred from file existence. Receipts: `docs/evidence/cloud-cliff-round1/source19/final-delivery/delivery.json`.

- **I3** Keep the cover's role: the wish UI sits on it at desktop and phone, the lantern stays readable
  beside the text, and the move from the cover into Snow Roof Court is smooth with no pop or long black.

  Round 1 — **partly**. Actual final Cloud19 posters/runtime retain the wish UI role and separate phone framing; background preparation keeps the active cover rendering while Snow loads. Final home/UI balance and cover→Snow transition continuity still need full-motion inspection. Before: `artifacts/snow-journey/final-contact/desktop-en/home.png` (phone comparison: same filenames under `artifacts/snow-journey/final-contact/phone-zh/`). After: Final Cloud19 views exist at `artifacts/full-review/round-1/cloud19-final-{runtime-posters,webkit-lights-r2}/{night,dusk,day}-{desktop,phone}.png`; visual acceptance is not inferred from file existence. Receipts: `docs/evidence/cloud-cliff-round1/source19/final-delivery/delivery.json`.

- **I4** The home page loads first, so it must appear fast: show a finished-looking first frame quickly
  and stream the rest; the cover's package is 10 MB or less. Snow Roof Court starts loading while the
  person writes the wish, so "Step inside" is ready when they are (see F2).

  Round 1 — **partly**. Cloud19 is7,565,880 B under10MB; six actual-app responsive posters total149,882 B. Snow prefetch/progress/retry remains implemented. Poster presence does not prove measured first-frame latency; inspect final startup/transition. Phone cover is~52 FPS; earlier desktop20.1 FPS remains disclosed. Before: `artifacts/snow-journey/final-contact/desktop-en/home.png` (phone comparison: same filenames under `artifacts/snow-journey/final-contact/phone-zh/`). After: Final Cloud19 views exist at `artifacts/full-review/round-1/cloud19-final-{runtime-posters,webkit-lights-r2}/{night,dusk,day}-{desktop,phone}.png`; visual acceptance is not inferred from file existence. Receipts: `docs/evidence/cloud-cliff-round1/source19/final-delivery/delivery.json`, `docs/evidence/full-review/round-1-final-phone-performance.json`.

- **I5** Delete the old procedural cover code the new one replaces (`web/src/engine/places/cloud-cliff.js`
  as used for the cover), keeping only what the hidden places still need.

  Round 1 — **done (code replacement)**. The replaced procedural cloud-cliff.js is deleted, and the actual scene registry imports cloud-cliff-baked.js. Hidden places retain their own required code. This code-replacement scope is done; overall cover quality is not implied. Before: `artifacts/snow-journey/final-contact/desktop-en/home.png` (phone comparison: same filenames under `artifacts/snow-journey/final-contact/phone-zh/`). After: Final Cloud19 views exist at `artifacts/full-review/round-1/cloud19-final-{runtime-posters,webkit-lights-r2}/{night,dusk,day}-{desktop,phone}.png`; visual acceptance is not inferred from file existence. Receipts: `docs/evidence/cloud-cliff-round1/source19/final-delivery/delivery.json`.

### Owner review of the Cloud v11 source previews (added 2026-11-17 11:30)

Seen in `art/build/cloud-cliff-round1/source-v11-preview/{desktop,phone}/Reference_cover-*.png`. The wooden
gallery, the lit window and the lantern's placement are good and already far better than the old cover.
These are what still keep it from reading as a cliff temple above a sea of cloud. Fix them in the current
round, before its verification, not in a later round.

- **I6** (P1) The far mountains read as smooth clay blobs: rounded tops, no rock, no strata, no detail at
  cover distance. They must read as sheer rock ridges breaking through the cloud: steep faces, ledges,
  strata, scan detail visible, layered in depth with the farthest ones softened by atmosphere.

  Round 1 — **partly**. Source19 replaces the rejected far walls with six closed CC0 rock variants, preserving actual rock faces and scan detail. The owner accepted this direction and explicitly cancelled Source20. Final night/dusk/day ridge readability/atmospheric depth still requires the current pictures to be judged. Before: `art/build/cloud-cliff-round1/source-v11-preview/desktop/Reference_cover-desktop.png`. After: Final Cloud19 views exist at `artifacts/full-review/round-1/cloud19-final-{runtime-posters,webkit-lights-r2}/{night,dusk,day}-{desktop,phone}.png`; visual acceptance is not inferred from file existence. Receipts: `docs/evidence/cloud-cliff-round1/source19/final-delivery/delivery.json`.

- **I7** (P1) The "sea of cloud" reads as a flat, dark lake: a hard plane with specular water glints.
  It must read as cloud seen from above: soft, billowing tops with volume, brighter lit edges, depth
  layers fading into the distance, wisps around the posts and ridges, slow live motion, and no water-like
  specular at all.

  Round 1 — **partly**. Accepted Source19 uses live source noise/R8 smooth envelope, completed-phase128×64×128 XYZ/SUN transport and actual opaque view-depth endpoints. No water specular plane remains. Coarse light interpolation, inactive near1m/opaque-light refinement and phase holds remain declared approximations; billowing softness and temporal quality remain visual checks. Before: `art/build/cloud-cliff-round1/source-v11-preview/desktop/Reference_cover-desktop.png`. After: Final Cloud19 views exist at `artifacts/full-review/round-1/cloud19-final-{runtime-posters,webkit-lights-r2}/{night,dusk,day}-{desktop,phone}.png`; visual acceptance is not inferred from file existence. Receipts: `docs/evidence/cloud-cliff-round1/source19/final-delivery/delivery.json`.

- **I8** (P1) No cliff is visible. The gallery's posts end in the flat plane, so the frame reads as a
  stilt house on a lake. Show the sheer rock the court hangs from and the drop beneath the gallery, with
  the cloud filling the depth below.

  Round 1 — **partly**. Actual Source19 cliff/post geometry and full-resolution opaque endpoints constrain cloud rays against real surfaces. The drop and cliff visibility must still be inspected at both sizes; technical depth correctness alone does not establish composition. Before: `art/build/cloud-cliff-round1/source-v11-preview/desktop/Reference_cover-desktop.png`. After: Final Cloud19 views exist at `artifacts/full-review/round-1/cloud19-final-{runtime-posters,webkit-lights-r2}/{night,dusk,day}-{desktop,phone}.png`; visual acceptance is not inferred from file existence. Receipts: `docs/evidence/cloud-cliff-round1/source19/final-delivery/delivery.json`.

- **I9** (P2) The lantern's flame reads as a white light bulb: a round, uniform, overexposed blob. It
  must read as a live candle flame: a tapered teardrop, warm core with a blue base, soft flicker, and a
  visible wick. The brass-framed storm lantern itself is the intended design; keep it.

  Round 1 — **partly**. The intended brass storm lantern, real glass/wick and live tapered graphic are retained. Final Cloud-only graphic uses size1/plane width1.7; finite/point/glass treatment avoids the prior duplicate bulb reflection. Owner accepted the warm beam/glass/teardrop direction; final wide-view flame readability/aliasing in both browsers is still open. Before: `art/build/cloud-cliff-round1/source-v11-preview/desktop/Reference_cover-desktop.png`. After: Final Cloud19 views exist at `artifacts/full-review/round-1/cloud19-final-{runtime-posters,webkit-lights-r2}/{night,dusk,day}-{desktop,phone}.png`; visual acceptance is not inferred from file existence. Receipts: `docs/evidence/cloud-cliff-round1/source19/final-delivery/delivery.json`.

- **I10** (P2) Phone composition: the bottom half of `Reference_cover-phone.png` is empty dark plane
  behind a railing. Recompose so the cliff, the cloud and the lantern fill the frame and the wish UI
  still sits on a calm area.

  Round 1 — **partly**. Source19 uses the owner-selected phone pose with lantern/gallery/real cliff/cloud depth and actual wish UI. Judge final calm text area, lower-frame content and readable lantern in the delivered phone pictures; no new geometry direction is authorized before Round1 commit. Before: `art/build/cloud-cliff-round1/source-v11-preview/phone/Reference_cover-phone.png`. After: Final Cloud19 views exist at `artifacts/full-review/round-1/cloud19-final-{runtime-posters,webkit-lights-r2}/{night,dusk,day}-{desktop,phone}.png`; visual acceptance is not inferred from file existence. Receipts: `docs/evidence/cloud-cliff-round1/source19/final-delivery/delivery.json`.

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

  Round 1 — **partly**. Source18 installs the real57-part open-bottom v2 lantern filter with raised/offset cup and4.5 mm ribs; selected2 W warmRGB[1,.43,.13], reflection .35/transmission .065/shadow .022 and actual4 mm point. Lamp atlas is INDIRECT-only; live direct uses actual cloth/angular and opaque shadows at every range, avoiding a direct/baked handover. Warm-pool native8 picture was selected. Final floor spill, brightest textured gauze, no hot spots/seam, both browsers/sizes and other colours/shapes still need app review; watts are not an independent candle calibration. Before: `artifacts/full-review/round-1/snow-local-environment/chromium/desktop-en/burning.png`. After: Available, not yet visually accepted: `artifacts/full-review/round-1/after-motion/chromium/desktop-en/burning.png`. Final four-context evidence: `artifacts/full-review/round-1/after-journey/{chromium,webkit}/{desktop-en,phone-zh}/burning.png`; capture/review remains pending where absent or uninspected. Receipts: `docs/evidence/full-review/round-1-snow-source18.json`, `docs/evidence/full-review/round-1-snow-source18-package.json`.

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

  Round 1 — **partly**. Final Source18 basis is[-1.5,2.25,-1.3], suspended to measured ceiling≈5.04m.55° burn/burnFar and phone views replace the original75°/column-facing setup; final desktop eye[-4.9,2.35,-2.15] avoids the prior column continuation. Historical36-route proof predates this final back-bay adjustment, so do not call it a fresh certificate for these poses. Final motion/column silhouette/20–25% size and hierarchy remain Root visual checks. Before: `artifacts/full-review/round-1/snow-local-environment/chromium/desktop-en/burning.png`. After: Available, not yet visually accepted: `artifacts/full-review/round-1/after-motion/chromium/desktop-en/burning.png`. Final four-context evidence: `artifacts/full-review/round-1/after-journey/{chromium,webkit}/{desktop-en,phone-zh}/burning.png`; capture/review remains pending where absent or uninspected. Receipts: `docs/evidence/full-review/round-1-snow-source18.json`.

- **I11** (P1) In `artifacts/full-review/round-1/cover-runtime-v6/night-desktop.png` the long gallery post under
  the lantern ends in mid-air with a hard, rounded bottom, so the whole gallery looks like it floats. In
  `cloud_cliff.py` the post runs down about 14 m to a seat on the rock, so the geometry is sound; in the browser
  the cloud reaches full opacity within a very short depth (the saturated viewing-ray opacity already noted under
  I7), so its top acts as a hard, flat, sky-coloured surface that cuts each post along an ellipse. Every post,
  corbel and the cliff must sink into the cloud gradually over metres: the lower part fades and softens, wisps
  pass in front of it, and more of the post and rock shows through where the cloud is thin. Check every post in
  the desktop and phone cover, in Chrome and WebKit, at night, dusk and day.

  Round 1 — **partly**. Actual opaque-view endpoint clipping and edge-aware integration replace reliance on fake height-only clipping; source19 post/rock geometry remains. Near-post wisps are retained. Verify every post/corbel/cliff fades over depth in night/dusk/day at both sizes/browsers; endpoint math and existing frame files do not by themselves accept that optical transition. Before: `artifacts/full-review/round-1/cover-runtime-v6/night-desktop.png`. After: Final Cloud19 views exist at `artifacts/full-review/round-1/cloud19-final-{runtime-posters,webkit-lights-r2}/{night,dusk,day}-{desktop,phone}.png`; visual acceptance is not inferred from file existence. Receipts: `docs/evidence/cloud-cliff-round1/source19/final-delivery/delivery.json`.

- **I12** (P2) In `art/build/cloud-cliff-round1/source-v17-preview/desktop/Reference_cover-desktop.png` the cliff
  faces now read as real rock, but the ridge tops are a row of repeated, evenly spaced rounded bumps, like a
  scalloped or crenellated edge. Real ridgelines are irregular: varied heights, sharp and broken crests, notches,
  no repeating rhythm. Fix the crests without losing the rock faces.

  Round 1 — **partly**. Source19 adopted six irregular closed rock variants after the repeated crest pattern was rejected; owner accepted that direction and cancelled Source20. Inspect the actual final six-look crests for repeating scallops without losing rock faces. No further geometry changes are part of this Round1 closeout. Before: `art/build/cloud-cliff-round1/source-v17-preview/desktop/Reference_cover-desktop.png`. After: Final Cloud19 views exist at `artifacts/full-review/round-1/cloud19-final-{runtime-posters,webkit-lights-r2}/{night,dusk,day}-{desktop,phone}.png`; visual acceptance is not inferred from file existence. Receipts: `docs/evidence/cloud-cliff-round1/source19/final-delivery/delivery.json`.
