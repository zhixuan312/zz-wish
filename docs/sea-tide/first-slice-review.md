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
