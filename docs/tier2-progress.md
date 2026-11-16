# One Light: Tier 2 and Tier 3 evidence

Baseline: `f1bdbdc`, three.js 0.160, GPU Chrome on Apple M1 Metal.

Screenshots: `artifacts/tier2/baseline/{desktop-en,phone-zh}/`; prototype references: `artifacts/tier2/prototype/{desktop-en,phone-zh}/`. Full raw measurements are in each baseline `metrics.json`.

Baseline Tier 1: 10 unit tests and 6 GPU Chrome browser tests pass.

- desktop-en: wish DOM ready 835.7 ms; warm 336.3 ms; longest observed main-thread task 4085.0 ms.
- phone-zh: wish DOM ready 266.6 ms; warm 292.7 ms; longest observed main-thread task 166.0 ms.

Measurements are local-server desktop GPU observations. Phone screenshots emulate viewport and touch. They do not verify real phones, 4G, Safari, Firefox, heat, battery, or 30-minute/24-hour phone endurance. Baseline startup overlapped the end of the Tier 1 suite; prototype captures overlapped part of the visual sweep. Repeat isolated measurements before final comparison.

Remaining: hero composition/light; flame/wax/ignition/endings; place audio and hall character; UI typography and records; smoothness and self-hosted fonts; repeat visual comparison; Tier 3 boundaries/lint/typecheck; final evidence and tier pushes.
