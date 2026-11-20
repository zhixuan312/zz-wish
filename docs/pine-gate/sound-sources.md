# Pine Gate sounds, sources and licences

The four recorded layers at Pine Gate. Every file is CC0 or public domain, taken from Wikimedia
Commons because its file page states the licence and needs no sign-in. Nothing here is
CC-BY or CC-BY-SA; candidates under those licences were rejected.

All files live in `web/public/places/pine-gate/sound/`, are mono-or-stereo AAC (`.m4a`,
`PresetAppleM4A` around 64 kbps), trimmed and level-matched. They load only after `Step inside`
and are not part of the base tier. A failed fetch is silence.

Downloaded 2026-11-20.

## Temple bell (distant, large, one to three strikes minutes apart)

| File | Source | Author | Licence | Bytes |
| --- | --- | --- | --- | --- |
| `temple-bell-1.m4a` | https://commons.wikimedia.org/wiki/File:Gro%C3%9Fe-Glocke-nm.flac | Rockhunt2000 | CC0 1.0 Public Domain Dedication | 45,852 |
| `temple-bell-2.m4a` | https://commons.wikimedia.org/wiki/File:Laurein_Glocke.wav | Cirolini P | CC0 1.0 Public Domain Dedication | 96,416 |

Licence text as recorded by Commons: "CC0 1.0 Universal (CC0 1.0) Public Domain Dedication".
`temple-bell-1` is the large bell of the Christuskirche Nieder-Mörlen; `-2` is the midday bell at
Lauregno. Both are full-size tower bells with a long decay.

A third CC0 candidate, `Bell-ring.flac` by qubodup, was **dropped after reading its description**:
it is a bicycle bell ("Just my bike's bell"), not a temple bell, so two takes are used and the
rotation picks between them.

## Rooster (dawn and morning)

| File | Source | Author | Licence | Bytes |

| --- | --- | --- | --- | --- |
| `rooster-1.m4a` | https://commons.wikimedia.org/wiki/File:Small_rooster_crowing.ogg | alys | Public domain | 60,394 |
| `rooster-2.m4a` | https://commons.wikimedia.org/wiki/File:Medium_rooster_crowing.ogg | alys | Public domain | 67,348 |

Licence text as recorded by Commons: "Public domain". Both are single crows with the recorder
close, trimmed to just the crow.

## Ox bell (morning to afternoon, occasional)

| File | Source | Author | Licence | Bytes |

| --- | --- | --- | --- | --- |
| `ox-bell-1.m4a` | https://commons.wikimedia.org/wiki/File:Cowbell.ogg | Freddythehat at English Wikipedia | Public domain | 69,172 |
| `ox-bell-2.m4a` | https://commons.wikimedia.org/wiki/File:Cowbell.ogg | Freddythehat at English Wikipedia | Public domain | 53,432 |

Licence text as recorded by Commons: "Public domain". Both takes come from the same recording at
different strikes, so the timbre is consistent while the rhythm differs.

## Evening village voices (dusk only, far and unintelligible)

| File | Source | Author | Licence | Bytes |

| --- | --- | --- | --- | --- |
| `village-voices-1.m4a` | https://commons.wikimedia.org/wiki/File:Shopping_mall_less_crowded.ogg | natalie | Public domain | 98,213 |
| `village-voices-2.m4a` | https://commons.wikimedia.org/wiki/File:1_minute_at_the_alexa_mall_in_berlin.ogg | thore | Public domain | 82,860 |

Licence text as recorded by Commons: "Public domain". Both are distant crowd murmur with no
audible words; they are level-reduced further in `pine-ambience.ts` so nothing is intelligible.

## Total

| Layer | Files | Bytes |
| --- | --- | --- |
| Temple bell | 2 | 142,268 |
| Rooster | 2 | 127,742 |
| Ox bell | 2 | 122,604 |
| Evening voices | 2 | 181,073 |
| **Total** | **8** | **578,695 (about 565 KiB)** |

The budget was 1 MB across the four layers and 120 KB per file; both hold. The largest file is
`village-voices-1.m4a` at 98,213 B.

## Rejected candidates, for the record

These were found and dropped because their licence is not CC0 or public domain:
`Sonnerie de l'angélus de la cathédrale Notre-Dame du Havre.wav` (CC BY-SA 4.0),
`Bells of the monastery church Uetersen 01.ogg` (CC BY 3.0),
`Glocken der Klosterkirche Disentis Stundenschlag 3 Uhr.ogg` (CC BY-SA 4.0),
`Klosterglocken Disentis drei Uhr.ogg` (CC BY-SA 4.0),
`Church bell in Opatje selo.flac` (CC BY-SA 4.0),
`Glocke Voßhagen.ogg` (CC BY-SA 3.0 de),
`Samariter Church Bell I (Es).ogg` (CC BY-SA 4.0),
`Rooster crowing.ogg` and `Young rooster crowing.ogg` (CC BY-SA 4.0),
`Cowbells on Monte Baldo.ogg` (CC BY-SA 4.0), and `Bell-ring.flac`, dropped for content rather
than licence because it is a bicycle bell.
