# One Light — Tier 3

Tier 2 was committed and pushed at `50579ea` before this work began. Its [visual report](tier2-report.md) remains the design and device-evidence record.

## Boundary and cleanup

React calls only `web/src/engine/index.ts`: initialization, offering shape, remaining fraction, phase, quality, camera/place transitions and ignition/extinction. It passes no wishes, visitor identity, history or statistics to the renderer. The renderer keeps its own animation loop. `ScenePhase` is a shared finite union rather than an arbitrary string. An ESLint import restriction prevents UI modules from reaching into Three.js, scene internals, place builders or the blur pass.

Removed the unused prototype `wobble` and `resample` functions, unused place-helper bindings and the unused capture-script import. The root `index.html` and historical requirement reference remain outside the production build. Their two remaining legacy-brand mentions were removed to honor the naming constraint; the prototype rendering code is retained as reference.

ESLint covers production JS/TS, configuration, scripts and browser checks. Strict TypeScript covers UI, API/server, shared rules, the engine facade/declaration, Vite configuration and Tier 1 tests. The imperative JavaScript renderer is linted but not semantically typechecked; library declarations use `skipLibCheck`. This is a deliberately explicit coverage boundary, not a claim that all scene code is typed.

The compiler is TypeScript 6.0.3 because typescript-eslint 8.72.2 supports TypeScript >=4.8.4 and <6.1.0; the prior TypeScript 7 compiler was outside that supported peer range. No forced peer-dependency override is used. three.js and its types remain exactly 0.160.0.

The isolated performance runner now labels confirmation and ignition separately so the four-second setup sample is not mixed with the intentional 30 fps burning cap. Both baseline and release are remeasured with the same revised runner; the original runs remain under their original artifact paths.

## Validation

- `npm run lint`: passed, zero warnings. [Log](evidence/lint.log).
- `npm run typecheck`: passed, zero diagnostics. [Log](evidence/typecheck.log).
- `npm run test:tier1`: 11 unit tests and 8 GPU Chrome browser tests passed. Its browser setup also builds the production bundle. [Log](evidence/tier1-tier3.log).
- Final isolated baseline/release performance comparison and touch rerun completed without page errors; see the Tier 2 report and [touch results](evidence/touch-report.json). The limitations in the Tier 2 report, including real hardware/browser/endurance gaps, still apply.
