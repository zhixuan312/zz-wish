# Pine Gate: six parts of the day

`web/src/engine/places/pine-day-parts.ts` is the one place that decides what light Pine Gate draws
at a given local time. When S1 bakes a plate family per part, only this table changes.

## The table

| Part | Hours | Plates | Sun or moon direction | Fog | Lamps |
| --- | --- | --- | --- | --- | --- |
| dawn | 05–08 | day | −0.72, 0.28, −0.63 | 1.45 | off |
| morning | 08–11 | day | −0.42, 0.66, −0.62 | 1.15 | off |
| midday | 11–14 | day | 0.06, 0.99, −0.10 | 1.00 | off |
| afternoon | 14–17 | dusk | 0.55, 0.48, −0.68 | 1.05 | off |
| dusk | 17–19 | dusk | 0.86, 0.10, −0.50 | 1.15 | on |
| night | 19–05 | night | −0.36, 0.52, −0.78 | 1.20 | on |

Directions are unit vectors in the place's own frame: x right, y up, z toward the viewer.

## Fallbacks while only four plate families exist

The place currently ships `day`, `dusk`, `night` and `lamp`. The lamp family is a lightmap pass, not
a plate set, so the six parts map onto three families:

- **dawn → day.** There is no dawn family yet. This is the weakest fallback: dawn needs its own
  morning mist and the thickest sea of cloud.
- **morning → day**, **midday → day.** Both are daylit, and the day family already carries the
  clearest valley that midday needs.
- **afternoon → dusk.** The golden hour begins in the afternoon, so it shares the warm plates.
- **dusk → dusk**, **night → night.** Exact.

## Transitions

Each boundary has a three-hour window **centred on it**, and the light, fog, lamp state and plate
weight all follow one smoothstep over that window. Centring matters: approaching from either side
gives the same weight, so the part flipping at the boundary cannot restart the blend. A trailing
window would put k at 1 on one frame and 0 on the next, which is the hard cut the review caught.

The weight reaches 0 a half-window before the boundary and 1 a half-window after it. The plate mix
is reported only *while it is changing*: at k=0 or k=1 there is nothing to cross-fade, so the mix is
null and the renderer draws one family.

Parts that share a plate family — afternoon and dusk both draw dusk, dawn and morning both draw day
— still cross-fade their light and fog, but report no plate mix, because mixing a family with
itself is meaningless.

The widest measured direction step is 0.087 per six minutes, at the 82° dusk-to-night turn. A hard
cut would be about 0.5.

## Plates that exist today

| Family | Valley plates | Lightmaps |
| --- | --- | --- |
| day | `pine-vista-{far,mid,cloud}.webp` | `*-day.ktx2` for approach, gate, niche |
| dusk | — (falls back to the day plates plus the dusk lightmaps) | `*-dusk.ktx2` |
| night | `pine-vista-night-*.webp` | `*-night.ktx2` |

Only day and night ship valley plates, so a day↔night change is the only plate cross-fade the
renderer performs; it rides `uNightWeight`, derived from `n`, and moves at most 0.063 per minute.
When S1 bakes a dusk plate family, add it here and to the backdrop's family table.
