# One Light evidence history

Baseline: `f1bdbdc`, three.js 0.160, GPU Chrome on Apple M1 Metal.

The completed implementation, before/after paths, isolated comparisons and verification limits are recorded in [the Tier 2 report](tier2-report.md).

Initial capture numbers below are retained for traceability, not used for the final performance comparison: baseline startup overlapped the end of the Tier 1 suite, and prototype captures overlapped part of the visual sweep.

- Desktop: wish DOM ready 835.7 ms; warm 336.3 ms; longest observed task 4085 ms.
- Phone viewport: wish DOM ready 266.6 ms; warm 292.7 ms; longest observed task 166 ms.

The final report uses isolated baseline and release runs to remove that contention. Real phone, browser compatibility and endurance limitations remain explicit.
