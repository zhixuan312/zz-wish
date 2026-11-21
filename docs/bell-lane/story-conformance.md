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
| Six local times and a legible way home at night | Differs | Keep smooth clock blending and show the landmark with practical light by night. Discrete dawn opening, dusk shutter movement and dedicated six-look evidence remain for polish. |
| A staged oil cup, tag, taper and placement | Differs | Show the supplies and use the existing lattice vessel and light action. Cup selection animation, tag tying and flame transfer from a fixture are follow-up choreography. |
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
                         / |               old tree (2.8, 4.4)
        seat (-1.60, 5.5)  | reveal
                           |
                  low bell pavilion (0, -1.6)
                    COURT    -Z
```

At 12 s, the route is under the shop eaves. At 22 s, it is centered on the door approach. The camera crosses the sill between 22 and 26 s, then holds the open court through the end of the 30 s walk. The final turn happens inside the court. The shop window is a single physical mesh.

## Review

The isolated preview enables Bell Lane in the ordinary wish, place, walk, choose and light flow. Start it with `node docs/bell-lane/preview.mjs` after installing the repository dependencies. It prints a loopback URL and uses a separate temporary database. The default game catalog remains unchanged.
