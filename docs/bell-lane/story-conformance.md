# Bell Lane round one

Baseline fbe82e3. Requirements come from the approved Bell Lane storyline, the world bible's common rules and the experience brief. The Pine Gate and Snow Roof sections describe their own sites.

| Requirement | Baseline | Round one treatment |
| --- | --- | --- |
| A neighborhood court at the end of an ordinary shop lane | Matches | Keep the two rows of ordinary shops, the small passage and the enclosed court. |
| People implied by work and wear | Matches | Keep counters, patched paving and baskets. Add a closed shop threshold, a broom and things set out for the next visitor. |
| Recognize one specific shop window twice | Missing | Give the first east shop a blue shutter, cream lattice and a red sill. Sight it through the door from the rack. |
| Familiar eaves, tree shadow, door at eye height, open court at 12/22/26/30 s | Differs | Replace the generic 14 s walk with a timed route through the physical opening. |
| Old tree and low bell pavilion | Differs | Preserve their role and lower the pavilion to one storey. |
| Ordinary light distinct from wish lamps | Matches | Shop windows are practical light. Add one simple threshold light. |
| Older wish lamps, mostly dark, and a free center position | Missing | Build a low rack with faded tagged lamps and two weak flames, with the nearest center slot open. |
| The visitor's light leads the seated frame on desktop and phone | Missing | Compose the visitor's lattice, flame and door into the same two lenses. |
| Plants and walls give depth and hide the edge of the world | Differs | Close the sightline with eaves and roof silhouettes. Confirm at entrance, threshold and seat. |
| Six local times and a legible way home at night | Differs | Keep smooth clock blending, with shutters open through the working day, sweep tools at dawn and practical light to mark the way home. Check actual light and shadow in the six-look pass. |
| A staged oil cup, tag, taper and placement | Differs | Stage the cups beside the rack, fit a hanging tag and carry the taper from the fixture to the wick. Cup selection, tying and final placement are follow-up choreography. |
| Natural exhaustion leaves a dark lattice and tag. Early extinction leaves oil. | Differs | The shared engine extinguishes the flame. The lattice oil surface and persistent tagged remnants still need gameplay support. |
| Returning restores the visitor's own earlier lamps | Missing | Shared persistence records the lamp. This place still needs physical slots for returned lamps. |
| Street sound continues softly indoors and bell rings occasionally | Differs | Route one street source across the doorway, with the bell a rare court cue. |
| Music, mute and online presence | Differs | Keep shared mute and presence. Bell Lane's own music cue set has not been authored. |
| Believable, generic faith | Matches | An anonymous local bell court without a named shrine or real temple identifiers. |

## Site plan

World coordinates in metres. Up on this plan is the street (+Z). The two routes use the same aperture and window.

```text
                    STREET   +Z
                Entrance   (0.4, 46)
                           |
              west eaves  |     east eaves
                           |     blue shop window (3.0, 14.5)
                           |         /
       wall =============[ door ]===/============= z = 10
                           |       /
          older wishes  ---*------/       * visitor lamp
                  rack (-1.05, 7.0)      open court
                         / |               old tree (-1.42, 0.60)
        seat (-1.60, 5.5)  | reveal
                           |
                  low bell pavilion (2.30, -2.70)
                    COURT    -Z
```

At 12 s, the route is under the shop eaves. At 22 s, it is centered on the door approach. The camera crosses the sill between 22 and 26 s, then holds the open court through the end of the 30 s walk. The final turn happens inside the court. The shop window is a single physical mesh.

## Review

The isolated preview enables Bell Lane in the ordinary wish, place, walk, choose and light flow. Start it with `node docs/bell-lane/preview.mjs` after installing the repository dependencies. It prints a loopback URL and uses a separate temporary database. The default game catalog remains unchanged.

For the authored camera samples, run `node docs/bell-lane/camera-audit.mjs`. The walk is 30 seconds, followed by a 12.5 second turn and seat transition. The last second is a still hold. On both viewports the planned maximum speed is 1.77 m/s and minimum structural clearance is 1.13 m, measured to the jamb rather than along the window sightline. The planned turn peaks at 20.18°/s desktop and 19.90°/s phone.

Capture with `node docs/bell-lane/capture.mjs artifacts/bell-lane/round-1` while holding the project GPU lease. The fixture records PNGs at the two viewport sizes, stores the actual game camera trace alongside the authored curve, and records the canvas and Bell Lane audio master in a WebM. The recording captures the street sound through the doorway filter. PNGs with controls preserve the same view in the regular app. Test context time is fixed only for setting the local lighting.
