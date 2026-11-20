# Pine Gate sounds, sources and licences

The recorded layers at Pine Gate. Every file is CC0, public domain, or CC BY, taken from Wikimedia
Commons because its file page states the licence and needs no sign-in. Nothing here is CC BY-SA or
NC; candidates under those licences were rejected.

All files live in `web/public/places/pine-gate/sound/`, are AAC (`.m4a`), trimmed and level-matched.
They load only after `Step inside` and are not part of the base tier. A failed fetch is silence.

Downloaded 2026-11-20.

## Temple bell (distant bonsho, one strike, long decay)

| File | Source | Author | Licence | Bytes |
| --- | --- | --- | --- | --- |
| `temple-bell-1.m4a` | https://commons.wikimedia.org/wiki/File:Bonsyou5599.ogg | Jnn (日:Jnn) | CC BY 2.1 JP | 49,191 |
| `temple-bell-2.m4a` | https://commons.wikimedia.org/wiki/File:Bonsyou5599.ogg | Jnn (日:Jnn) | CC BY 2.1 JP | 48,176 |

Licence text: https://creativecommons.org/licenses/by/2.1/jp/deed.en — "Creative Commons
Attribution 2.1 Japan". The recording is the bonsho of Chōmeiji on Ibugiyama, Shiga
(prefecture: 滋賀県 姨綺耶山 長命寺の梵鐘の音色), struck from outside with a log, one strike, with
the low fundamental and long beat. Two different strikes are taken from the same recording so the
timbre is consistent and the rhythm differs.

**Attribution text for the credits:**

> Temple bell: "Bonsyou5599" by Jnn, CC BY 2.1 JP, via Wikimedia Commons (trimmed).

Note on the licence version: this is CC BY 2.1 JP, not the 3.0/4.0 the brief named. It is the same
CC BY family — commercial use with attribution — and it is the only real bonsho on Commons; every
other candidate was a European church bell (tongue-struck, bright, often pealing) which the world
bible excludes. If 2.1 JP is not acceptable, the alternative is the synthesised bell described in
`sound-design.md`.

## Rooster (dawn and morning)

| File | Source | Author | Licence | Bytes |
| --- | --- | --- | --- | --- |
| `rooster-1.m4a` | https://commons.wikimedia.org/wiki/File:Small_rooster_crowing.ogg | alys | Public domain | 60,394 |
| `rooster-2.m4a` | https://commons.wikimedia.org/wiki/File:Medium_rooster_crowing.ogg | alys | Public domain | 67,348 |

Licence text as recorded by Commons: "Public domain". Single crows, trimmed to the crow.

## Ox bell (morning to afternoon, occasional)

| File | Source | Author | Licence | Bytes |
| --- | --- | --- | --- | --- |
| `ox-bell-1.m4a` | https://commons.wikimedia.org/wiki/File:Do-Bells-Affect-Behaviour-and-Heart-Rate-Variability-in-Grazing-Dairy-Cows-pone.0131632.s005.oga | Johns J, Patt A, Hillmann E | CC BY 4.0 | 24,338 |
| `ox-bell-2.m4a` | same recording, a different window | Johns J, Patt A, Hillmann E | CC BY 4.0 | 41,266 |

Licence text: https://creativecommons.org/licenses/by/4.0/ — "Creative Commons Attribution 4.0
International". This is the supplementary audio of a PLOS ONE study of bells on grazing dairy
cows: bells on animals that walk, so the ringing is irregular and the timbre is dull rather than
the bright struck-percussion cowbell.

**Attribution text for the credits:**

> Ox bells: "Do Bells Affect Behaviour and Heart Rate Variability in Grazing Dairy Cows?"
> supplementary audio by Johns J, Patt A, Hillmann E, CC BY 4.0, via Wikimedia Commons (trimmed).

## Dropped: evening village voices

No outdoor, distant, rural evening recording was available under an acceptable licence. The two
indoor candidates used earlier were mall interiors — reverberant, with announcements and German —
which would be wrong for a mountain village, so the layer is removed from the schedule rather than
filled with a wrong recording. `layersFor('dusk')` therefore has wind, spring, temple bell, frogs
and insects only.

## Total

| Layer | Files | Bytes |
| --- | --- | --- |
| Temple bell | 2 | 97,367 |
| Rooster | 2 | 127,742 |
| Ox bell | 2 | 65,604 |
| **Total** | **6** | **290,713 (about 284 KiB)** |

The largest file is `rooster-2.m4a` at 67,348 B; every file is under 120 KB and the total is well
under 1 MB.

## Rejected candidates, with reasons

| File | Licence | Why not |
| --- | --- | --- |
| `Große-Glocke-nm.flac` | CC0 | European church bell; tongue-struck and bright, not a bonsho |
| `Laurein Glocke.wav` | CC0 | European church bell, same reason |
| `Bell-ring.flac` | CC0 | Its description says "Just my bike's bell"; a bicycle bell |
| `Cowbell.ogg` | Public domain | Its description and categories are a Latin/drum-kit percussion pattern, not a bell on a grazing animal |
| `Cowbells on Monte Baldo.ogg` | CC BY-SA 4.0 | Share-alike not allowed |
| `Bells of the monastery church Uetersen 01.ogg` | CC BY 3.0 | European church bells |
| `Glocken der Klosterkirche Disentis Stundenschlag 3 Uhr.ogg` | CC BY-SA 4.0 | Share-alike; European church bell |
| `Klosterglocken Disentis drei Uhr.ogg` | CC BY-SA 4.0 | Share-alike; European church bell |
| `Church bell in Opatje selo.flac` | CC BY-SA 4.0 | Share-alike |
| `Glocke Voßhagen.ogg` | CC BY-SA 3.0 de | Share-alike |
| `Samariter Church Bell I (Es).ogg` | CC BY-SA 4.0 | Share-alike |
| `Rooster crowing.ogg`, `Young rooster crowing.ogg` | CC BY-SA 4.0 | Share-alike |
| `Shopping mall less crowded.ogg`, `1 minute at the alexa mall in berlin.ogg` | Public domain | Mall interior with reverb, not a rural evening |
