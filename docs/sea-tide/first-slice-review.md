# Tide Temple first slice review

The lane runs on the inland side of a granite wall. The route rounds the
wall's seaward return and ends at a sheltered sill. From the sill the harbour
channel stays visible beside the hood. The first slice uses Tide's procedural
scene, the shared pottery hood and the same settled pose from Choose through
ignition.

## Reference

- Use the rock-backed temple and nearby landing in the photographs as a
  reference for terrain meeting a working shore. The fictional temple has
  its own layout and has no identifying features from the reference.
  [Exterior photograph by Dr. Poon Sun Wah](https://www.tourism.gov.hk/LYMProject/images/ip6_01.jpg)
  ([Hong Kong Tourism Commission source and credit](https://www.tourism.gov.hk/LYMProject/en/ip6.html)).
- Use the photographs of the breakwater gap and rock armour to compare the
  low shoreline shoulders and open water beyond the channel.
  [Aberdeen Typhoon Shelter environmental assessment, plates 1-1 and 1-2](https://www.epd.gov.hk/eia/files/applications/en/pp_357/eia_5944/progress/action_172087/20250509_EIA_HTML/eia/appendix/ch10/appendix_10_1.pdf#page=2).

## Capture

Run `node docs/sea-tide/capture.mjs` under the S7 GPU lease with
`TIDE_EVIDENCE_DIR` set to an external output folder. It starts temporary Vite
and API servers on loopback, prepares Tide through its procedural scene,
and drives the normal chooser and burn flow using a disposable database.
The catalog and prepare overrides exist only in the fixture.

The four cases pair 1440×900 desktop and 390×844 phone with 13:00 and 22:00
local time. Every case records the entrance, enclosed lane, wall turn, harbour
reveal, the chooser with its actual sheet, lit recess and Skip endpoint.
The report records the per-frame camera trace, minimum envelope clearance,
peak turn speed, the Skip endpoint difference and projected landmark visibility.
Native crops copy pixels from the viewport originals without rescaling.

## Camera acceptance

The authored walk is 27.6 seconds. The stock chooser approach uses the
remaining 2.4 seconds. The focused check samples both routes at 120 Hz and
checks the limits separately: at most 1.8 m/s while walking and 1.4 m/s
through the chooser move. The loopback trace measures the rendered camera,
including any preview drift, and records both peak speeds separately.
For each eligible frame the fixture projects a point at the harbour mouth
and a water point underneath, then casts rays from the actual camera against
the scene geometry. Either occlusion or departure from the frame resets the
continuous reveal timer. At least two seconds must remain visible before the
walk ends.

The chooser probe projects the complete hood bounding box and a conservative
flame envelope against both viewport bounds and the actual sheet. It records
the sill contact distance and compares the final camera after Skip with the
unskipped endpoint.

## Entrance readiness and the first probe

Both `round-1-probe` day cases stopped at the first entrance wait with empty
shot lists. The old fixture waited for the English button label to become
visible, then waited for scene readiness. In `web/src/App.tsx:432`,
**Step inside** is the label whenever the app is idle and the load stage is
neither loading nor preparing. That includes the error stage. The button
only enables when the load stage is ready and the app is idle. Selecting a
court calls preparation and then scene preview (`App.tsx:313–319`).
Only a click on the enabled button starts travel (`App.tsx:340–359`).

A CPU source probe reproduced a `ReferenceError` in the then-current lane
builder. The salt decal loop declared a local `yaw` that shadowed the wall
return's rotation while the loop's input list was still being evaluated.
This is the identified preparation failure path. The old browser receipts
did not record the underlying exception. Commit `6255aa9` renamed the loop
binding and added a focused test that executes both scene builders.
The current fixture records load and preview exceptions, checks the
enabled button, verifies that Tide is the active scene and waits for the
entrance fade. It saves this readiness evidence before the first walk
and again on the return from Skip.

## Round 1 browser receipt

Capture source: `039a7ee`. Originals, native crops, case receipts and raw
camera traces are under
`/Users/xuan/OpenBot/Shared/one-light/artifacts/sea-tide/round-1/`. All four
cases completed the entrance, Skip, return and unskipped walk, then showed
the ready-made chooser and lit recess. The first and return entrances both
reported a ready court, an enabled **Step inside** button and zero fade
opacity. The captured listener recorded zero page exceptions or HTTP errors.

| Case | Continuous clear harbour | Peak walk / other motion | Minimum wall clearance while walking / through chooser | Hood / flame margin to chooser |
| --- | ---: | ---: | ---: | ---: |
| Desktop, 13:00 | 3.426 s | 1.667 / 1.084 m/s | 1.241 / 0.512 m | 57.2 / 68.4 px left |
| Desktop, 22:00 | 3.407 s | 1.667 / 1.082 m/s | 1.241 / 0.512 m | 57.2 / 68.4 px left |
| Phone, 13:00 | 3.423 s | 1.667 / 1.136 m/s | 1.478 / 0.609 m | 23.5 / 31.9 px above |
| Phone, 22:00 | 3.423 s | 1.667 / 1.135 m/s | 1.478 / 0.609 m | 23.5 / 31.9 px above |

The eye heights use the rendered camera Y minus the lane or court pave top
at its ground projection. The walk varies from 1.499 to 1.784 m across all
four cases. The higher values occur while the inherited entrance drift
eases out in the first 1.5 seconds. After that, the walk stays at
1.499–1.530 m. The settled eye is 1.310 m on desktop and 1.452 m on phone.
Walk-only wall clearance is horizontal to the lane or wall return envelope.
The smallest through-chooser distance occurs beside the low wall return.
No frame entered a wall envelope.

Click-to-chooser timing across the four recordings was 30.13–30.48 seconds.
Normal and Skip endpoints agreed in position and aim. The largest rendered
field-of-view delta was 0.00025°. The hood base contacted the sill within the
precision of the raycast. The actual flame is under the hood, with the lit
cut-outs and the upper rim showing its glow. The phone reveal shows both
shoreline tips, while the seated phone view compresses the channel into the
opening to the left of the recess and hides most of the right shoulder.
The public app still has no Tide selector, approach surf or Tide-specific
entrance and chooser copy. The loopback used the shared UI, which displayed
the existing Snow Roof fallback copy.

## Follow-up browser receipt

Capture source: `484410b`. The earlier figures and first round originals
above remain available. The follow-up fixes Tide's vertical entrance drift
while the shared camera retains its default and reduced-motion behavior.
The camera starts above the actual deck minimum. The two harbour shoulders
extend into the seated composition, and a narrower stone return keeps them
visible beside the hood on phone. The new water combines shorter wind
ripples, longer cross-swell, interrupted highlights and foam concentrated
near the shore.

| Case | Entrance wait | Actual walking eye | First 1.5 s frames | Clear harbour | Peak walk / other | Peak turn | Closest recorded wall | Hood / flame to chooser |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Desktop, 13:00 | 0.35 s | 1.520–1.530 m | 88 | 3.544 s | 1.667 / 1.094 m/s | 20.48°/s | 0.512 m | 57.2 / 68.4 px left |
| Desktop, 22:00 | 2.15 s | 1.520–1.530 m | 88 | 3.538 s | 1.667 / 1.053 m/s | 20.48°/s | 0.512 m | 57.2 / 68.4 px left |
| Phone, 13:00 | 1.05 s | 1.520–1.530 m | 90 | 3.551 s | 1.667 / 0.810 m/s | 20.87°/s | 0.854 m | 41.9 / 49.4 px above |
| Phone, 22:00 | 3.05 s | 1.520–1.530 m | 90 | 3.550 s | 1.667 / 0.811 m/s | 20.87°/s | 0.854 m | 41.9 / 49.3 px above |

The browser cast down to the actual deck for every walking frame and found
no out-of-range eye height or missing deck hit. No frame entered the wall
envelope. Normal and Skip had identical final position and aim, with the
largest rendered field-of-view difference about 0.00055°. Rays hit both
named shoreline tips at the reveal, chooser and burn. The phone original
shows the left tip close to the frame edge and the right one between the
channel and the niche. The Tide → Bamboo Rain → Tide switch measured zero
vertical preview offset on both Tide visits. Bamboo retained a varying
0.197–0.233 m offset in the sampled preview.

The six static before/after pairs use the same actual camera position,
direction and field of view, local time and 7.25-second water animation
time. They compare the old Tide world at `039a7ee` with the new one.
The diagnostic pairs hide UI. The normal originals retain the actual
chooser and burn UI, and the two daytime videos show the live sequence.
The channel now has visible shore foam and cross-swell, though the water
and shoreline remain procedural.

The initial desktop 13:00 follow-up used a reserved GLSL identifier and
reported shader errors. The reserved desktop retry at `484410b` succeeded
after the rename, and the initial failure remains separate. All four
accepted normal captures and six matched pairs recorded zero reported
errors. The preview servers and all recorded runners exited, and both S7
leases were released.

The complete follow-up index is
`/Users/xuan/OpenBot/Shared/one-light/artifacts/sea-tide/round-2/index.md`.

## Shoreline, pottery and endings

Browser source `86834b5`. Shore armour enters the water with an irregular
wet boundary, exposed seams and foam driven by the shoreline geometry.
The hood uses opaque fired clay and openings with visible thickness. The
wick and broad reflected light on the stone follow the flame. Only the
interior ceramic around the apertures carries the ending afterglow.

The four 13:00 and 22:00 journeys used a 1440×900 desktop and a 390×844
emulated phone. Both harbour tips remained visible through reveal, chooser
and burn. The clear reveal lasted 3.504–3.559 seconds and the walking eye
height was 1.520–1.530 m. The closest wall clearance was 0.512 m on desktop
and 0.854 m on phone. Normal and Skip reached the same position and aim.
The four lit/off pairs held the same actual camera pose and surroundings.

The phone night ending pilot replayed the prior `e67f7a3` material and the
final source through the real app. The prior material showed no vent tail.
The restored put-out and exhaustion tails ended at 16.006 and 5.200 s.
The wick flame and its stone bounce reached zero together at 0.132 and
2.609 s. The Bamboo switch and Tide restart showed zero residual visitor
light. The Draw test kept its flared profile through the red and ivory
selections, which produced distinct fired clay tints.

Both runs released the S7 lease and all recorded runners exited. The
photo sources, original frames, native crops, clips, traces and focused
checks are indexed at
`/Users/xuan/OpenBot/Shared/one-light/artifacts/sea-tide/round-3-final/index.md`.

## Continuous banks and sheltered water

Browser source `8f440c0`. Both near banks now run from the submerged rock
toe through the shoreline slope. Foreground armour uses smaller overlapping
blocks. Rounded distant headlands sit behind the banks. The water combines
short crossed ripples near the shore with finer, lower-contrast motion across
the opening.

The four desktop and phone journeys at 13:00 and 22:00 retained both shore
tips through reveal, chooser and burn. The harbour stayed continuously
visible for 3.535–3.568 s. Measured wall clearance was at least 0.512 m
on desktop and 0.854 m on phone. Walking eye height was 1.520–1.530 m.
The normal walk and Skip had identical endpoint position and aim. The
phone chooser cleared the hood by 41.9 px and the flame envelope by 49.3 px.

Eight pairs compare `86834b5` with the new world and water at the same
projection and animation time. The initial fixture retained live lens
differences below 0.001° in three seated frames. The corrected fixture
pinned the projection and reran those three cases. Five matched pairs and
all four live journeys retain their original files.

The full frames, native crops, true-speed footage, photo references, traces
and test receipts are indexed at
`/Users/xuan/OpenBot/Shared/one-light/artifacts/sea-tide/round-4/index.md`.
