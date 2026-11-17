# Round 1 audio measurements

The actual sound module now passes the measured clipping, loop-boundary, mute and ending checks. Headphone/speaker balance and realism still require the owner’s listening review. No synthesis level or bell interval was changed.

Early mute was a real defect: after muting at 0.4 s, the old future startup ramp restored nonzero output in the 1.9–2.7 s window (-65.97 dBFS RMS). That same window is exact digital silence after cancelling pending automation. Ending audio reaches exact zero within 300 ms, including during a bell.

The first-channel raw loop boundary fell from 0.449287 to 0.034757; ordinary adjacent-sample RMS is 0.042535. A 250 ms equal-power overlap retains the original noise generator, filters and gains. Wind/flame now repeat every 11.75/10.39823 s.

| Measured source | RMS dBFS | Peak dBFS |
| --- | ---: | ---: |
| Snow wind, 3–13 s | -67.52 | -55.45 |
| Snow flame, 3–13 s | -69.54 | -57.15 |
| Bell, active eight seconds | -60.22 | -44.59 |
| Combined Snow, 100 s | -63.87 | -42.74 |

All measured PCM had zero clipped samples. Flame RMS is 2.02 dB below wind; the bell’s active-window RMS is 7.30 dB above wind. These are electrical levels, not a claim of perceived loudness. The higher-gain sea-bed stress case retained 25.86 dB peak headroom. Seeded bells began at 23.144 and 63.491 s, a 40.347 s gap; source design remains first 14–24 s, then 38–80 s.

Owner listening moments:

- **Live: tap Light; listen from 0–3 s.** Silence before tapping; a gentle ambience/flame fade-in after the tap. Device volume and subjective balance need owner approval.
- **Live: 10.398 s / 20.796 s flame joins and 11.75 s / 23.5 s wind joins after starting.** No repeating click or gain dip at the joins. Measured joins are ordinary adjacent-noise-size deltas; audibility still requires listening.
- **Live: first bell 14–24 s after starting, then 38–80 s between bells.** A distant, infrequent bell. In the seeded listening copy it starts at 23.144 s; the three partials decay over 8/5/3 s.
- **after-early-mute-and-ending.wav: mute at 0.4 s; unmute at 2.8 s; end at 4 s.** Silent after 0.56 s until unmute; smooth return by 2.96 s; silence by 4.3 s. Check the live mute button during the initial fade too.
- **Live: explicit put-out, leaving, and natural completion, including while a bell is ringing.** The same 300 ms ending fade; no next bell or audio leaking into the result screen. App settlement uses the shared sound.stop path for every reason.

[Exact measurements, source hashes and limitations](./round-1-audio.json). Raw float-PCM metrics and unnormalized PCM16 listening copies are in `artifacts/full-review/round-1/audio` (ignored). Reproduce with `node tests/visual/audio-review.mjs`. This uses a blank GPU-disabled Chrome page and native OfflineAudioContext, with seeded randomness and render-quantum timers; it does not test live-device autoplay or WebKit audio.
