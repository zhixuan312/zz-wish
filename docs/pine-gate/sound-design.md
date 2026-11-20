# Pine Gate sound design

The world bible gives Pine Gate four synthesised layers and four recorded ones. This note records
how the synthesised four are made and how the recorded four are scheduled; the recordings' sources
and licences are in [sound-sources.md](sound-sources.md).

## Synthesised (no files, no bytes)

All four use the existing bed in `web/src/sound.ts`: a seamless brown-noise loop through a bandpass
filter, with a slow oscillator swelling the gain. Per layer:

| Layer | Bed | How it reads |
| --- | --- | --- |
| Pine wind | `rooms['pine-gate']`: bandpass 380 → 1400 Hz over 18 s, `gain .006`, swell `.07` | High, thin wind in the needles, always present |
| Spring water | added band at 1700 Hz, Q .5, gain `.006` ramped in over 2.1 s | A steady small water sound under the wind |
| Insects | `detail` pulses: 3.5–11 s apart, short 1500–2500 Hz chirps | Sparse, high, never a continuous ring |
| Frogs | `detail` pulses: 400–500 Hz double croaks, 1.3 glide | Two quick notes, low and close |

Levels sit in `LEVELS` in `web/src/engine/places/pine-ambience.ts`, all well under the music.

## Recorded (loaded after entry)

| Layer | Files | Interval | Level |
| --- | --- | --- | --- |
| Far temple bell | 2 | 150–420 s | .010 |
| Rooster | 2 | 70–200 s | .006 |
| Ox bell | 2 | 50–190 s | .005 |
| Evening voices | 2 | 120–300 s | .0045 |

Each layer keeps its own timer and picks a uniform random wait inside its interval every time, so
nothing repeats on a recognisable cycle. A take is chosen at random per play.

Loading: `pine-recorded-sounds.ts` fetches the files only for the layers the current part of day
enables, decodes once, and plays through the master gain of `sound.ts`, so mute and the background
pause cover them. A failed fetch, a 404 or a decode error is silence; nothing throws and the place
keeps working.

## Schedule by part of day

From `layersFor()` in `web/src/engine/places/pine-ambience.ts`:

| Part | Sounding |
| --- | --- |
| Dawn | wind, spring, rooster |
| Morning | wind, spring, rooster, temple bell, ox bell |
| Midday | wind, spring, ox bell |
| Afternoon | wind, spring, ox bell, insects |
| Dusk | wind, spring, temple bell, frogs, insects, village voices |
| Night | wind, spring, frogs, insects |
