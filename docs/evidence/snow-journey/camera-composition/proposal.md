# Snow Roof camera composition proposal

Read-only source/CPU projection review, 2026-11-16. No runtime, geometry, lighting or render changes. Projection evidence: `/tmp/snow-camera-projections.json`; reproducible CPU scripts: `/tmp/snow-camera-review.mjs` and `/tmp/snow-camera-route-check.mjs`.

The altar and front doors occupy opposite directions. One static camera cannot show both within the current 49.3° desktop / 21.2° phone horizontal fields of view. Use three continuous moments: hall context, ignition on altar/screen, then a single walk around the lantern to settle facing the snowy court. All interior camera positions hold WORLD Y2.22 over the .6m floor, giving 1.62m eye height.

## Exact WORLD poses

Targets use Y-up metres. FOV values are vertical. Desktop1440×900; phone390×844.

| Moment | Desktop position → target; FOV | Phone position → target; FOV |
|---|---|---|
| Arrival context | (.20,2.22,3.25) → (0,2.35,-3.50); 40° | (.05,2.22,3.25) → (0,2.50,-3.50); 56° |
| Choose | (.18,2.22,1.60) → (.25,2.68,-.50); 32° | (.10,2.22,1.60) → (0,2.72,-.50); 44° |
| Confirm / taper detail | (.12,2.22,1.38) → (.20,2.68,-.50); 32° | (.10,2.22,1.50) → (0,2.75,-.50); 44° |
| Catch / light spread | (.12,2.22,1.85) → (0,2.49,-1.25); 44° | (0,2.22,1.85) → (0,2.45,-1.25); 64° |
| Settled burn | (.18,2.22,-3.85) → (0,2.55,0); 32° | (.18,2.22,-3.85) → (0,2.48,0); 44° |

Convert both position and target to nook-local by subtracting (0,.6,-.5): local Y=worldY−.6 and local Z=worldZ+.5. For example, settled burn local position is (.18,1.62,-3.35), desktop target (0,1.95,.5), phone target (0,1.88,.5).

Arrival keeps the real table, screen, painted beams and lantern together. Hold briefly, then approach choose over about3s. Phone portrait requires its context FOV: full screen width subtends about27° horizontally at arrival, while the normal phone lens gives21.2°. The close poses deliberately focus on lantern/catch; they cannot show the altar floor.

Current catch power rises between approximately1.10–2.17s of the3.8s taper animation. Begin the .47m retreat/lens widening with the taper approach and reach the spread pose by1.1s. The altar is therefore already visible for the actual warming event. Hold through the end of ignition and about2s afterward. This proposal changes camera timing only, not lighting or settlement.

CPU projections show the spread pose puts lantern center/altar top at (707,157)/(743,647) desktop and (195,235)/(195,532) phone; screen edges fit both. Phone altar remains above the bottom gradient beginning near591px. Settled burn puts lantern center at (731,196) desktop / (202,233) phone, open-door top at (694,231)/(177,257), and far snowy ground at (657,714)/(153,578). These are mathematical projections, not claimed rendered evidence.

## Continuous walk around the lamp

Use these WORLD points for a centripetal Catmull–Rom path, arc-length sampled, over about16s:

```
(.12,2.22, 1.85)
(1.40,2.22, .80)
(1.95,2.22,-1.25)
(1.65,2.22,-2.60)
(1.65,2.22,-3.95)
(.18,2.22,-3.85)
```

Track around (0,2.55,-.5), easing toward the final target near the end. Keep the rear waypoint: a direct diagonal toward the final camera crosses the right kneeling cushion. The checked curve is8.08m long (0.51m/s), holds eye Y exactly2.22 and has at least.59m column clearance, .116m cushion clearance and .30m altar-front clearance after allowing a .25m body radius. This check covers known columns/cushions/walls, not every mesh. Keep the phone at the same endpoint; a closer diagonal to Z−3.55 failed cushion clearance.

Maintain the wider lens through the near half of the walk, then ease to the settled32°/44° over the final5s. Lock the camera when settled; preserve the same pose for both endings. Cancel an active camera walk on navigation, snuff or phase change without delaying settlement.

## Integration details for the runtime owner

- `closeView()` currently uses `N.burn` for confirmation. Give confirmation its own pose; applying the proposed settled burn there would turn away from the altar before ignition.
- Author explicit phone poses. `chooseView()` currently lowers baked phone targets by.35m; remove/bypass that correction for these already composed phone targets.
- Current `moveCam()` ignores FOV and `resize()` resets it to32°/44°. Lens interpolation and resize persistence are required for this proposal.
- Ending the walk at arrival Z3.25 requires removing approach points already inside the hall (current final world Z2.4/1.9), otherwise the visitor enters and backs out. The existing approach also raises eye Y to2.32 on the flat floor at world Z2.4; use2.22 instead.
- This review makes no lighting changes and does not validate runtime flame-body size, occlusion, or UI overlap visually. Root's Metal/browser preview remains the acceptance evidence.
