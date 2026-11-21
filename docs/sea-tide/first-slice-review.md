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
  [Hong Kong Tourism Commission, Lei Yue Mun waterfront](https://www.tourism.gov.hk/LYMProject/en/ip6.html)
- Use the photographs of the breakwater gap and rock armour to compare the
  low shoreline shoulders and open water beyond the channel.
  [Civil Engineering and Development Department, Aberdeen Typhoon Shelter environmental assessment, landscape baseline](https://www.epd.gov.hk/eia/files/applications/en/pp_357/eia_5944/progress/action_172087/20250509_EIA_HTML/eia/appendix/ch10/appendix_10_1.pdf)

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
