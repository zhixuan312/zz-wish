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

Each boundary has a three-hour window centred on it. Inside the window the light, fog and lamp
state ease from one part to the next with a smoothstep, so the midpoint falls exactly on the
boundary and the curve is the same approached from either side; `part` flipping at the boundary
cannot restart it. Three hours rather than one because the widest turn between neighbours is 82°
(dusk to night), and a shorter window swings the sun fast enough to read as a jump.

Plate sets cannot cross-fade by number, so the set switches at the midpoint of the window while the
light and fog move continuously either side. A burning candle crosses these boundaries with the
same easing, because `lightAt()` is a pure function of the clock and nothing about it depends on
the screen.

Rules the table enforces:

- **The storm lantern lights at dusk** and stays lit through the night.
- **Ordinary lamps in the burning view stay lit at every part of day**, which the burning camera
  applies on top of this table.
