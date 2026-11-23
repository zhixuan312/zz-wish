# One Light: experience and music brief

Status: approved by the owner.

## 1. The idea

One Light is one person's quiet moment. You carry a wish to a real-feeling temple, light one lamp and stay with it. The world
around you is full of people, but they have just passed through, so you see only what they left behind: footprints, smoke, warm
ash, old wishes. Your lamp joins theirs and is always the main character.

## 2. The whole journey

| Stage | What the player does | Length |
|---|---|---|
| Home | Reads the opening and writes a wish | Player's pace |
| Place | Chooses Snow Roof Court or Pine Gate Steps and sees its entrance | Player's pace |
| Walk | Walks to the temple; can skip | 30 s |
| Choose | Picks or draws a lamp, its colour and how long it burns | Player's pace |
| Ignition | Lights the lamp; the flame catches and the camera settles | About 13-15 s |
| Burning | Stays with the lamp | 5 minutes to 24 hours |
| Ending | The lamp burns down, or the player puts it out | Burn down about 30 s, put out about 12 s |
| Result | Sees what the time meant, then lights another or leaves | Player's pace |

## 3. Snow Roof Court

**Where:** a small temple at a pass on an old mountain road above a northern market town, in deep winter.

**Why it is here:** the pass is the windiest point of the crossing. A shelter was built long ago and became a temple. Travellers
rest here, and townspeople come up before a long journey or to wish for someone far away.

**What it looks like:** one modest walled court with a gate, main hall, two side rooms and a kitchen. It is old, patched and lived in.
The hall holds a generic seated Buddha. Nothing identifies a specific real temple.

**Signs of people:** a narrow swept path, footprints half covered by new snow, kitchen smoke, stacked firewood, a broom, warm paper windows.

**Ordinary lamps:** two oil lamps at the gate, an altar lamp and a veranda storm lantern.

**Other wishes:** one short, orderly row of six or seven red gauze lanterns with wooden tags hangs from a single hall beam. Most have
burnt out and faded to a warm soft red. Two still glow faintly. The cord at the centre is free. Calm, never crowded or eerie.

**The walk, 30 s:**

| Time | Moment |
|---|---|
| 0-12 s | The snowy road climbs through wind-bent pines and rock |
| 12-22 s | Two small warm lights appear far ahead at the gate |
| 22-26 s | Up the steps and through the shadow of the gate |
| 26-30 s | **The reveal:** the court opens and a great snow peak rises behind the hall |

**Burning:** your red lantern hangs close to camera, the old lanterns behind it, wind-blown snow glittering beyond the half-open door.

**Endings:** burnt down, the lantern dims slowly and becomes one more old lantern. Put out, it goes dark at once with a thread of smoke.

## 4. Pine Gate Steps

**Where:** a level mountain shoulder halfway up an old pilgrim road in the humid south, above a farming village.

**Why it is here:** it is the only flat ground and spring on the climb. Villagers built a small shrine and a free tea pavilion for
porters, pilgrims and woodcutters.

**What it looks like:** one small shrine with a simple local earth god, an open tea pavilion, a stone table, a spring basin and two
ancient pines. It is old and mossy, with new tiles among the old.

**Signs of people:** steps worn hollow, muddy footprints, a bamboo broom, coarse tea bowls, a stove with warm ash, a bamboo pipe feeding
the basin, a carrying pole left against a post.

**Ordinary lamps:** a storm lantern under the pavilion eave and a small oil lamp before the shrine's image.

**Other wishes:** stone ledges around the shrine hold many burnt-out candle stubs over layers of old wax. Two or three short candles
are still burning. Red cloth strips are tied to the old pine. The centre of the stone lamp shrine is free.

**The walk, 30 s:**

| Time | Moment |
|---|---|
| 0-12 s | A narrow stone path climbs the shaded back of a ridge under dense pines |
| 12-22 s | The path steepens and mist gathers |
| 22-26 s | Two ancient pines lean together at the crest and form a natural gate |
| 26-30 s | **The reveal:** beyond the crest a level shoulder opens onto a sea of cloud, terraced fields and the small shrine |

**Burning:** your candle stands in a pierced stone lamp shrine at the terrace edge, with the valley and slow cloud beyond it.

**Endings:** burnt down, the candle melts into the old wax. Put out, a shortened candle remains with a thread of smoke.

## 5. Six times of day

Each place follows the player's local time and blends smoothly. Everything stays easy to see at every time, including at night.

| Time | Snow Roof Court | Pine Gate Steps |
|---|---|---|
| Dawn | Pink-blue light on the peak, first kitchen smoke | Morning mist in the pines, thickest sea of cloud |
| Morning | Clear snow light, bright court and hall | Sun through pine needles, moving light on the steps |
| Midday | Deep blue sky, bright snow that does not glare | Valley and terraces at their clearest |
| Afternoon | Low sun and long eave shadows on snow | Warm light on pavilion and shrine, cloud rising |
| Dusk | The peak turns gold and red, ordinary lamps come on | Golden cloud, the storm lantern lights, village lights begin |
| Night | Moonlit snow and roofs, a clearly lit hall | Moonlit cloud and steps, shrine and pavilion clearly visible |

## 6. Music overview

Music plays from the first interaction to the end of the game. Browsers do not allow sound before the player's first tap or key press,
so the home music fades in at that moment. Natural sound (wind, water, snow, flame) is handled by the game and sits underneath the music.

- **Feeling:** calm, spacious, intimate and hopeful. Never sad, dramatic or new-age generic.
- **Instruments:** guqin, xiao, soft bamboo flute, guzheng harmonics, distant bronze bell and warm low pads.
- **Tempo and key:** 60 BPM throughout. Snow Roof in D minor pentatonic, Pine Gate in G major pentatonic.
- **Theme:** one simple 4-6 note motif appears in every cue, so the game feels like one piece.
- **Snow Roof colour:** cold air, long xiao tones, sparse guqin, deep bell.
- **Pine Gate colour:** warm and airy, plucked guqin, bamboo flute, water-like guzheng harmonics.
- **Avoid:** vocals, loud percussion, sudden volume changes, strong hooks in burning music, and any recognisable existing melody.

## 7. Music cue sheet

### Shared by the whole game

| File | Where it plays | Length | Type | Direction |
|---|---|---|---|---|
| `home_loop` | Home and wish writing | 3:00 | Seamless loop | The main theme, gentle and inviting |
| `result_loop` | Result, My Lamps and Ten Lights | 1:30 | Seamless loop | Quiet, warm afterglow of the theme |

### Needed for each place

Make one set with the prefix `snow_` and one with the prefix `pine_`.

| File | Where it plays | Length | Type | Direction |
|---|---|---|---|---|
| `place_loop` | Entrance screen | 1:00 | Seamless loop | First colour of this place, anticipation |
| `walk` | The walk | 0:36 | One shot | Follow the timing below, 6 s tail into Choose |
| `choose_loop` | Choosing the lamp | 1:30 | Seamless loop | Sparse and unhurried, leaves room to think |
| `ignite` | Starts when the flame catches | 0:20 | One shot | Soft accent at 0:00, bloom to 0:04, settle by 0:14 |
| `burn_bed_day` | Burning at dawn, morning, midday | 6:00 | Seamless loop | Very quiet, clear and open, no melody |
| `burn_bed_golden` | Burning in afternoon and dusk | 6:00 | Seamless loop | Very quiet, warm and slow, no melody |
| `burn_bed_night` | Burning at night | 6:00 | Seamless loop | Very quiet, deep and close, no melody |
| `burn_phrase_01` to `burn_phrase_08` | Occasional moments over the bed | 0:25-0:45 each, about 4:40 total | One shots | Short solo phrases of the theme, each different |
| `ending_burned` | The lamp burns down | 0:30 | One shot | Slow, complete resolution, ends in peace |
| `ending_putout` | The player puts it out | 0:12 | One shot | One soft unresolved phrase, then silence |

**Walk timing, the same for both places:**

| Time | Music |
|---|---|
| 0:00-0:12 | Very sparse, enclosed, low |
| 0:12-0:22 | The motif appears and slowly gathers |
| 0:22-0:26 | Thins almost to silence, like holding a breath |
| 0:26 | **The reveal:** the widest, warmest chord of the piece opens here |
| 0:26-0:30 | Full and spacious, the emotional peak |
| 0:30-0:36 | Tail settles into `choose_loop` |

**Burning music:** the bed plays continuously. The game plays one phrase at a random moment every 3-8 minutes and does not repeat a phrase until
all eight have played, so a long burn never feels like a short repeating track.

**Totals:** 36 files, about 58 minutes: 4:30 shared and 26:48 for each place.

## 8. Delivery format

| Item | Requirement |
|---|---|
| Format | WAV, 48 kHz, 24-bit, stereo |
| Loops | Exact length, sample-accurate and seamless, with reverb tails wrapped to the start |
| One shots | Clean start, natural fade to full silence at the end |
| Loudness | Burn beds about -30 LUFS, phrases about -26 LUFS, all other cues about -23 LUFS |
| Peak | At most -1 dBTP |
| Names | Use the file names above, for example `snow_burn_bed_night.wav` |
| Rights | Written confirmation that the music can be used commercially in this game |
