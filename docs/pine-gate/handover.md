# Pine Gate Steps handover

The approved site and product cameras are frozen at `4eb4627`. The current day review is [P2 R15](quality-log.md) at capture source `7be59e7`. The app under review uses an isolated staged package. The public package still has manifest SHA-256 `45c31e502dc4a645bdc4d9034a3b7fe106227a345c1e6bb81c79b916627b1c1f` and predates the shoulder, tea pavilion and layered valley. A green run against that package cannot approve the new scene.

On this Mac the active branch is `s1/pine-gate-candle`. The latest near-scene inputs, frozen asset receipts and local working scripts remain in `/Users/xuan/OpenBot/Shared/one-light/s1-pine-gate/art/build/pine-gate` and `/Users/xuan/OpenBot/Shared/one-light/tmp/s1`. These are ignored local data. Use your assigned worktree and worker name for new files, jobs and commits. Read the current shared `GOALS.md` and `world-bible.md` before changing the layout or approval stages.

## Tools and ownership

Run the shell blocks from your Pine Gate worktree. Use a fresh output name for every run.

```sh
shared=/Users/xuan/OpenBot/Shared/one-light
previous="$shared/s1-pine-gate/art/build/pine-gate"
previous_tmp="$shared/tmp/s1"
worker=s2
export TMPDIR="$shared/tmp/$worker/"
mkdir -p "$TMPDIR"
export PYTHONDONTWRITEBYTECODE=1
export ONE_LIGHT_GLTF_TOOLS="$previous_tmp/one-light-gltf-tools"
ktx_tools="$previous_tmp/one-light-ktx-tools"
toktx="$ktx_tools/KTX-Software-4.4.2-Darwin-arm64-tools.pkg/Payload/usr/local/bin/toktx"
blender=/Applications/Blender.app/Contents/MacOS/Blender
blender_python=/Applications/Blender.app/Contents/Resources/5.3/python/bin/python3.13
artifacts=/Users/xuan/Documents/code/zz-wish/artifacts/pine-gate
lease="$shared/gpu-lease.sh"

python3 art/blender/pine_materials.py
test -x "$toktx" && test -x "$blender" && command -v cwebp
```

Use the resident Node and project's dependencies. Bake tooling uses `watlas@1.0.1`, `@gltf-transform/cli@4.5.1`, KTX-Software 4.4.2, Blender 5.3, Metal Cycles and Metal OpenImageDenoise. See [bake.md](bake.md) and the [shared bake pipeline](../../art/blender/README.md). The source scans, elevation data and external photo references have separate provenance in `docs/assets.json`, `docs/licenses/` and each evidence directory.

Before each Blender or Playwright batch, take the shared lease with `"$lease" wait "$worker"`. Record the identity with `stat -f '%d:%i' "$shared/gpu.lock"`. Keep each batch at most 15 minutes except a full final bake. Release with `"$lease" release "$worker"` only if its owner and identity still match. The shell blocks below use this lease function. Run them in a subshell so the exit trap runs at the end of each batch.

```sh
take_gpu() {
  "$lease" wait "$worker" || return
  lease_identity="$(stat -f '%d:%i' "$shared/gpu.lock")"
  release_gpu() {
    if [ "$(stat -f '%d:%i' "$shared/gpu.lock" 2>/dev/null)" = "$lease_identity" ] &&
       [ "$(cat "$shared/gpu.lock/owner" 2>/dev/null)" = "$worker" ]; then
      "$lease" release "$worker"
    fi
  }
  trap release_gpu EXIT
  trap 'exit 130' INT
  trap 'exit 143' TERM
}
```

## Author, bake and replay contacts

`pine_gate.py` authors the path, ground, approach pines and surveyed shoulder. `pine_tea_shoulder.py` builds the tea pavilion, spring and Earth shrine. The live visitor lamp uses `web/src/engine/PineWax.js`. Its shared physical reference and baked indirect-only lamp pass are described in [bake.md](bake.md). In the most recent R15 build, the impostors came from `p2-near-05/impostors` and the sculpt from `r1-wax-sculpt`.

Use `samples=8` for the review and a fresh `samples=64` directory for a proposed release. Keep a low-sample visual review separate from the final Metal record. The local 32-sample transport investigation used a scratch Node test hook and remains diagnostic only. Do not change repository validation to accept 32 as 8 or 64.

```sh
samples=8
near="art/build/pine-gate/s2-near-${samples}-01"
mkdir "$near"
(
  set -e
  take_gpu
  "$blender" -b --python-exit-code 1 --python art/blender/pine_gate.py -- \
    --output "$near/pine-gate.blend" \
    --impostors "$previous/p2-near-05/impostors/impostors.json" --wax-sculpt "$previous/r1-wax-sculpt"
  "$blender" -b "$near/pine-gate.blend" --python-exit-code 1 --python art/blender/bake_export.py -- \
    --out "$near/preflight" --skip-bake --samples "$samples" --device METAL --oidn-device METAL
  "$blender" -b --python-exit-code 1 --python art/blender/audit_prepared_mapping.py -- \
    --source "$near/pine-gate.blend" --prepared "$near/preflight/pine-gate-prepared.blend" \
    --manifest "$near/preflight/manifest.json" --out "$near/mapping.json"
  "$blender" -b --python-exit-code 1 --python art/blender/audit_prepared_resting_contacts.py -- \
    --source-audit "$near/pine-gate.audit.json" --prepared "$near/preflight/pine-gate-prepared.blend" \
    --raw "$near/preflight/pine-gate.raw.glb" --out "$near/prepared-contact.json"
)

(
  set -e
  take_gpu
  mkdir "$near/baked"
  cp "$near/preflight/"*-coverage.npz "$near/baked/"
  "$blender" -b "$near/preflight/pine-gate-prepared.blend" --python-exit-code 1 --python art/blender/bake_export.py -- \
    --out "$near/baked" --resume --samples "$samples" --device METAL --oidn-device METAL \
    --prepared-preview-audit "$near/mapping.json" --resting-contact-audit "$near/prepared-contact.json"
)

(
  set -e
  set --
  if [ "$samples" = 8 ]; then set -- --preview; fi
  node scripts/pack-blender-assets.mjs --source "$near/baked" --out "$near/delivery" \
    --tools "$ONE_LIGHT_GLTF_TOOLS" --ktx "$ktx_tools" --material-profile mobile \
    --screen-base-pattern pine-niche-granite-gray --screen-base-size 1024 \
    --position-format float32 --normal-format snorm16 --max-bytes 40000000 "$@"
  jq -e --argjson samples "$samples" '
    [.lightmaps[] | .[]] | length == 12 and
    all(.[]; .samples == $samples and .bakeDevice == "METAL" and .denoiseDevice == "METAL")
  ' "$near/delivery/manifest.json"
  node scripts/decode-baked-for-contact-audit.mjs --input "$near/delivery/pine-gate.glb" \
    --output "$near/decoded.glb" --receipt "$near/decoded-streams.json" --tools "$ONE_LIGHT_GLTF_TOOLS"
  take_gpu
  "$blender" -b --python-exit-code 1 --python art/blender/audit_prepared_resting_contacts.py -- \
    --source-audit "$near/pine-gate.audit.json" --prepared "$near/preflight/pine-gate-prepared.blend" \
    --raw "$near/decoded.glb" --out "$near/decoded-contact.json"
  "$blender" -b "$near/pine-gate.blend" --python-exit-code 1 --python art/blender/export_pine_crest_anchors.py -- \
    --manifest "$near/preflight/manifest.json" --out "$near/crest-anchors.json"
  jq -e '.passed' "$near/decoded-contact.json"
)
```

The legacy monolithic delivery uses `node scripts/attach-place-runtime-assets.mjs --out "$near/delivery" --native-view docs/licenses/native-agx.json` for its AgX and 15 MB checks. The tiered build below counts the same native AgX bytes in its base and permits larger deferred tiers. The final tiered release still needs an end-to-end proof. The R15 diagnostic retained signed 16-bit normals with float32 positions and passed decoded contact replay. Follow the accepted release recipe if Boss requires float32 normals on the new final package.

Source and prepared fingerprints, actual device records, 8 px chart gutters, three filtered mips, native camera coverage, distinct-world UV overlaps, and literal gap ≤ 2 mm and penetration ≤ 5 mm all matter. Do not promote a near-scene if its actual raw or decoded contact replay fails. Bind `web/src/engine/places/pine-crest-needle-anchors.json` to the delivered geometry fingerprint only after verifying the pads against `"$near/crest-anchors.json"`. Changing the fingerprint alone is valid when all 130 pad objects match exactly.

For changed source assets, these commands regenerate the local prerequisites. Use leased Blender blocks as above. All output destinations are ignored.

```sh
pine_source="$previous_tmp/pine-sapling-medium-polyhaven/pine_sapling_medium_1k.blend"
"$blender" -b --python-exit-code 1 --python art/blender/pine_impostors.py -- \
  --output "$near/impostors" --polyhaven-blend "$pine_source" --width 384 --samples 8
"$blender" -b --python-exit-code 1 --python art/blender/pine_wax_sculpt.py -- --out "$near/wax-sculpt"
"$blender_python" scripts/recompress-pine-wax-normal.py "$near/wax-sculpt" "$near/wax-sculpt-lossless"
"$blender" -b --python-exit-code 1 --python art/blender/pine_forest_backdrop.py -- \
  --pines "$pine_source" --out "$near/approach-master" --width 1008 --samples 8
"$blender_python" art/blender/encode_pine_forest.py --input "$near/approach-master" --out "$near/approach-encoded"
"$blender" -b --python-exit-code 1 --python art/blender/pine_native_runtime_trees.py -- \
  --source-blend "$pine_source" --output "$near/high-trees" --gltf-tools "$ONE_LIGHT_GLTF_TOOLS" --texture-size 512
```

## Valley layers and tiered packaging

`pine_valley_backdrop.py` renders the same fixed projection for all far, middle and cloud plates. The DEM, canopy, 14+8 flooded fields, irrigation and hamlet authoring live in sibling `pine_valley_*.py` files. `shared/pine-gate-backdrop.json` binds the cameras and plate distances. Keep the native 8K EXRs with their receipt outside Git. Use separate lease blocks for the three native layers. The R10 day run used 8 samples on far and middle and 24 on cloud, and took roughly 13 minutes in total on this M1 before encoding. The first nighttime pilot only uses 2048×1024 and is not the native final night scene.

```sh
day="art/build/pine-gate/s2-valley-day-01"
for layer in far mid cloud; do (
  set -e
  take_gpu
  set --
  if [ "$layer" != far ]; then set -- --resume; fi
  "$blender" -b -t 6 --python-exit-code 1 --python art/blender/pine_valley_backdrop.py -- \
    --out "$day" --lighting day --width 8192 --samples 8 --cloud-samples 24 --device METAL \
    --layers "$layer" "$@"
) || break; done

"$blender_python" art/blender/encode_pine_backdrop.py --input "$day" --out "$day-base" --width 2048 --quality 88
"$blender_python" art/blender/encode_pine_backdrop.py --input "$day" --out "$day-native" --quality 88
node scripts/encode-pine-walk.mjs --native "$day-native" --out "$day-walk" --toktx "$toktx"

night="art/build/pine-gate/s2-valley-night-01"
(
  set -e
  take_gpu
  "$blender" -b -t 6 --python-exit-code 1 --python art/blender/pine_valley_backdrop.py -- \
    --out "$night" --lighting night --width 2048 --samples 8 --cloud-samples 16 --device METAL
)
"$blender_python" art/blender/encode_pine_backdrop.py --input "$night" --out "$night-webp" --quality 88
```

Use `"$previous/p2-valley-04-base2048"` and `"$previous/p2-valley-04-walk"` instead when iterating on near geometry only. Staging verifies every file hash and the projection, receipt, layer names, dimensions, straight alpha and linear radiometry. The walk upgrade needs the full authored 8192×4096 KTX2 with authorized transfer, orientation and block format. It rejects invalid or incompatible receipts, unknown locators, repeated URIs, stale sizes/hashes or any of the three excess budgets. The day and walk must trace to the same masters. The night receipt must trace to a different render of the same projection. The following stages the new outputs.

```sh
node scripts/compact-place-manifest.mjs --input "$near/delivery" --out "$near/compact" --report "$near/compact.json"
node scripts/recompress-pine-ktx.mjs "$near/compact" "$near/compact-textures"
node scripts/gzip-place-models.mjs --input "$near/compact-textures" --out "$near/compact-zstd" --codec zstd
node scripts/stage-pine-backdrop.mjs --near "$near/compact-zstd" \
  --plates "$day-base" --walk "$day-walk" --night "$night-webp" \
  --high-trees "$previous/r1-native-trees-03" --sculpt "$previous/r1-wax-sculpt-lossless" \
  --approach-forest "$previous_tmp/forest-p2-r17-encoded" --fern-detail "$previous/r14-fern-native" \
  --defer-near-lightmaps --out "$near/ready"
shasum -a 256 "$near/ready/manifest.json"
```

Base is ≤ 15,000,000 B including native AgX and manifest. It carries the walk entrance, model, soft valley, full approach maps and soft gate/niche maps. Walk is shared by phone and desktop. It streams native daytime plates and the deferred gate/niche banks while the visitor walks, before the crest at about 20 s. It also budgets every byte of the separate night WebPs, which load after entry when the night weight is nonzero. Count both sets across a visit that spans dusk. Phone total is ≤ 30,000,000 B. Desktop total is ≤ 40,000,000 B and adds high trees after entry. Crossfades preserve plate placement and silhouettes. Never stall the walk for a texture. Measure exact bytes, Step inside ≤ 5 s, phone burning about 30 FPS and 0 runtime errors, HTTP errors and source reloads in app. Physical iOS memory is unverified.

## Run the real app

`tests/visual/pine-gate-journey.mjs` owns the capture poses, lighting hours, request checks and journey. Keep its 8-sample preview and 64-sample final predicates. Use the following shell function instead of the old S1 launchers, which assume the S1 checkout and worker identity. The function uses ignored diagnostics and an isolated database. Chrome and WebKit close through Playwright's `finally` blocks. The launcher stops only its own API and Vite PIDs.

```sh
run_capture() (
  set -e
  take_gpu
  api_port=8966
  vite_port=8967
  if lsof -nP -iTCP:"$api_port" -iTCP:"$vite_port" -sTCP:LISTEN; then exit 1; fi
  run_dir="$(mktemp -d "${TMPDIR}pine-gate-capture-XXXXXX")"
  export DB_FILE="$run_dir/pine-gate-capture-test.sqlite"
  export ONE_LIGHT_VITE_CACHE="$run_dir/vite-cache"
  export OUTPUT="$artifacts" GPU_LOCK_DIR="$shared/gpu.lock"
  export CAPTURE_SOURCE_REV="$(git rev-parse HEAD)"
  export CAPTURE_CODE_SHA="$(git ls-tree -r HEAD -- server shared web/src web/vite.config.ts package.json package-lock.json | shasum -a 256 | awk '{print $1}')"
  git diff --quiet HEAD -- server shared web/src web/vite.config.ts package.json package-lock.json
  test -z "$(git ls-files --others --exclude-standard -- server shared web/src web/vite.config.ts package.json package-lock.json)"
  api_pid=
  vite_pid=
  stop_capture() {
    result=$?
    for pid in "$api_pid" "$vite_pid"; do
      if [ -n "$pid" ]; then
        if kill -0 "$pid" 2>/dev/null; then kill "$pid"; fi
        wait "$pid" 2>/dev/null || true
      fi
    done
    printf 'Capture diagnostics and disposable database: %s\n' "$run_dir"
    if lsof -nP -iTCP:"$api_port" -iTCP:"$vite_port" -sTCP:LISTEN; then result=1; fi
    release_gpu
    exit "$result"
  }
  trap stop_capture EXIT
  PORT="$api_port" HOST=127.0.0.1 node server/main.ts > "$run_dir/api.log" 2>&1 &
  api_pid=$!
  ONE_LIGHT_API_TARGET="http://127.0.0.1:$api_port" node node_modules/vite/bin/vite.js \
    --config web/vite.config.ts --host 127.0.0.1 --port "$vite_port" --strictPort > "$run_dir/vite.log" 2>&1 &
  vite_pid=$!
  printf 'Capture API PID=%s Vite PID=%s\n' "$api_pid" "$vite_pid"
  for url in "http://127.0.0.1:$api_port/api/places/stats" "http://127.0.0.1:$vite_port/"; do
    curl -fsS --retry 30 --retry-connrefused --retry-delay 1 "$url" > /dev/null
  done
  for job in "$@"; do export "$job"; done
  BASE_URL="http://127.0.0.1:$vite_port/" node tests/visual/pine-gate-journey.mjs
)
```

Set the preview directory and SHA to an exact staged 8-sample package under **your worktree**. The private route checks all bytes and leaves the installed 64-sample manifest alone. Do not start captures while the app code is dirty or change it while they run. For the currently staged R15/R16 32-sample diagnostic only, the original invocation is recorded in `capture-pine-p2-r15-set-stone.zsh` under the S1 scratch directory. The 32-sample hook is tied to that checkout and never a release path.

```sh
export CAPTURE_PREVIEW_DIR="$PWD/$near/ready"
export CAPTURE_PREVIEW_SHA256="$(shasum -a 256 "$CAPTURE_PREVIEW_DIR/manifest.json" | awk '{print $1}')"
overview='{"space":"world","position":[0,6.5,7.05],"look":[-0.5,5.05,1.93],"fov":68}'
details='[{"name":"spring-basin","space":"world","position":[0.70,5.64,4.84],"look":[2.17,4.59,3.55],"fov":58},{"name":"ancient-pine-uphill","space":"world","position":[4.4,4.8,2.8],"look":[0.65,7.65,6.35],"fov":75},{"name":"creek-up-channel","space":"world","position":[2.39,3.42,20.52],"look":[2.07,2.71,18.12],"fov":37}]'
run_capture CAPTURE_MILESTONE=quality QUALITY_PASS=preview CAPTURE_DIRECTION_ONLY=1 \
  QUALITY_LABEL=s2-site-01 CAPTURE_SITE_DAY_ONLY=1 CAPTURE_WALK_TIER=1 \
  "CAPTURE_DIRECTION_OVERVIEW=$overview" "CAPTURE_SITE_DETAILS=$details"

run_capture CAPTURE_MILESTONE=quality QUALITY_PASS=preview CAPTURE_DIRECTION_ONLY=1 \
  QUALITY_LABEL=s2-night-fixtures-01 \
  'CAPTURE_DIRECTION_OVERVIEW={"space":"world","position":[0.70,5.64,4.84],"look":[2.17,4.59,3.55],"fov":58}'

run_capture CAPTURE_MILESTONE=quality QUALITY_PASS=preview CAPTURE_DIRECTION_ONLY=1 \
  CAPTURE_REALISM_ONLY=1 CAPTURE_REQUIRE_BACKDROP=1 CAPTURE_WALK_TIER=1 QUALITY_LABEL=s2-runtime-01
```

| View | Source and output under `artifacts/pine-gate/quality/` |
| --- | --- |
| Entrance | Product entrance from `shared/pine-gate-path.json`. `direction/s2-site-01/desktop-en/entrance.png`. |
| Forest | Live product walk, 6 s. `direction/s2-site-01/desktop-en/forest-06s.png`. |
| Ancient pines | Live crest, 21.5 s. `direction/s2-site-01/desktop-en/ancient-pine-crest.png`. The separate `ancient-pine-uphill.png` records the crown from below. |
| Terrace reveal | Live product walk, 28 s. `direction/s2-site-01/desktop-en/terrace-reveal-28s.png`. The independent stream and performance report is under `r1/s2-runtime-01/report.json`. |
| Shrine, pavilion and Earth god | Declared overview pose in the first command. `direction/s2-site-01/desktop-en/shrine-pavilion.png`. The current evidence compiler also creates the unscaled `earth-god-and-oil-lamp-game.png` crop. Add a closer declared supplemental pose for a genuine stone-statue inspection. |
| Day burning | Live settled wax on the standard product camera. `direction/s2-site-01/desktop-en/day-burning.png`. |
| Night burning | Same product camera at 22:00. `direction/s2-night-fixtures-01/desktop-en/night-burning.png`. The existing direction switch captures only burning at night. Extend the test-only capture selection to replay all six approved cameras at 22:00 for the next review. |
| Nearby water and fixtures | `direction/s2-site-01/desktop-en/spring-basin.png` and `creek-up-channel.png`. The fixture capture uses the spring camera for its overview. |

Use the full PNGs, native pixel crops and genuine photo references. The exact local P2 script verifies the source and SHA of the captured pixels before writing sheets. It reads S1's retained static references and invokes the repository's `tests/visual/pine-realism-pixels.swift` for native crops and comparisons. To transfer the evidence generator to your checkout, replace its hardcoded S1 source path in a copy and keep the reference hashes and image size guards.

```sh
node "$previous_tmp/build-pine-p2-r13-site-evidence.mjs" \
  "$artifacts/quality/direction/s2-site-01/report.json" \
  "$artifacts/quality/p2/s2-site-01" \
  --night "$artifacts/quality/direction/s2-night-fixtures-01/report.json"
```

A finished review folder contains `full/`, `native-crops/`, `photo-pairs/`, `references.md` and `evidence.json`. Run a fresh real app capture for each visual change. Preserve the before material at its original labelled path. Compare identical cameras and note timing drift for live walk frames. Sources are in `quality/p2/references/` and `quality/r1/references-late-spring/`. The native Swift compositor also accepts a JSON worklist with `tiles` and `pairs` for individual comparisons. The R1 builder is `tests/visual/pine-realism-review.mjs BASELINE_RUNTIME_FOLDER CANDIDATE_RUNTIME_FOLDER PHOTOS_FOLDER OUTPUT_FOLDER`.

After approval, verify the new final candidate from an isolated worktree where the local test server serves that candidate as its 64-sample Pine package. Keep a record of the installed candidate SHA before and after capture. The following run eight contexts in two batches, with independent output reports under `m3-smoke-chromium-hour-22/` and `m3-smoke-webkit-hour-22/`. Repeat separate ambient-only sessions for the time-of-day proof. Tier 1 uses port 8790 and requires its own lease.

```sh
unset CAPTURE_PREVIEW_DIR CAPTURE_PREVIEW_SHA256
run_capture CAPTURE_MILESTONE=m3 CAPTURE_BROWSER=chromium PINE_HOUR=22
run_capture CAPTURE_MILESTONE=m3 CAPTURE_BROWSER=webkit PINE_HOUR=22
npm run lint
npm run typecheck
npm run check:evidence
( take_gpu && npm run test:tier1 )
```

## Last captures and open work

- Day R15 is in `quality/p2/p2-r15-set-stone/` with 11 originals, 37 native crops and 13 real-photo comparisons. Its staged 32-sample manifest starts with `d3d82f8c`. The base, phone and desktop totals were 14,989,662, 29,278,403 and 36,684,123 B. Desktop and emulated phone enabled Step inside in 3.435 and 2.439 s. Phone burning measured 29.99 FPS. Native day plates were present by 20.033 and 20.016 s, with zero runtime errors, HTTP errors and source reloads. At `7be59e7`, Tier 1 passed 62 unit and 17 browser tests with one configured skip.
- Night R16 at source `3736cee` is a first app prototype at `quality/direction/p2-r16-moon-first/`. Its staged manifest is `d3c693570a9650242b110af0479e57c9ace79aae22c0a269770012f64e5e0821`. It uses 383,874 B of late night plates. Actual base, phone and desktop package totals are 14,990,309, 29,662,924 and 37,068,644 B. The day and night desktop takes enabled Step inside in 3.364 and 3.419 s and recorded zero runtime errors, HTTP errors and source reloads. The day requested no night plates. The night requested exactly the three declared plates.
- **Night valley first.** The R15 sky was flat deep blue because the daytime backdrop disappeared at night. The R16 plate prototype shows the ridge and some paddy reflections and clouds. The dark slopes still show conspicuous colour blocks under WebP compression. Village doorway lights were authored into the scene, but legibility from the product views is unverified. Improve shadow encoding and detail using the retained linear masters before approving night. The three-layer source is `p2-night-valley-02/`, the encoded set `p2-night-valley-02-webp/`, and the isolated package `p2-runtime-28-night01/`. Full six-view night coverage, slow-night continuity, phone cadence and P3 lighting approval remain open.
- **Prayer cloth.** Three similar saturated bands read like tape. Vary dyed and faded states, weave, wet sag, measured knot and tail profile, ragged ends and restrained wind. The existing fold and tie measurements are useful anchors. `crest_ribbons()` in `pine_gate.py` authors the cloth and `pine-crest-cloth.js` adds its surface detail.
- **Landing stone.** R15 removed photographed false joints and added damp grit. Large smooth pavers still look like cushions beside the older approach granite. Use a coherent granite surface with wear, chips, cracks and restrained local height changes. Preserve the surveyed structure footprints and real contact points.
- **Crest trees.** The fixed route camera shows mostly trunks. Its upper edge is about 20 degrees while the lowest visible-direction crown pad is about 33 degrees. Keep the existing uphill close-up for branch inspection. Make credible leaning, taper and branch structure. If showing more branches requires a product camera change, ask Boss before touching the frozen camera.
- **Candle.** The current wax has some rim and runnel detail, but the normal burning distance still reads as a smooth cylinder. Improve the actual melt pool, wax tears and wax behaviour, and retain verified flame/wick contact, continuous shortening and both ends. The spent stubs have improved.
- **Near pines and Earth god.** The thin conifers beside the shoulder still resemble cedar or bamboo. Replace visible flat sprays and establish fuller Masson pine branch profiles, preserving measured roots. Add an Earth-god detail capture, since the overview does not resolve the stone carving.
- **Approach treads.** Thin noses and black joints remain in the forest and creek crops. Most dark points hit wet soil or shaded granite, not open holes. The visible bands are approximately courses 26–28 and 37–41. The packed bedding fold uses fixed station spacing; fitting a damp, stone-bearing foot to the real upper toe and lower rear edge is a useful next step. Preserve the measured rises and crown clearance. R15 also darkens the overly bright new creek bed, but its mineral texture still reads too much like a continuous slab.

## Pitfalls to preserve

- Never run Blender, a native browser capture, Playwright or Tier 1 without your own verified lease. Release it after the batch. Never use process-name cleanup or touch a lease directory manually. Use the recorded PIDs and use `lsof` on your exact private ports. The public demo listens on 8810 and runs the same server command. Leave it and cloudflared alone.
- Keep source and receipts from the same build. `--resume` rejects incompatible width, samples, device, source hash or lighting receipts. Keep the four maps per region together. Use raw EXRs before native AgX and apply the common pre-exposure of 6 only once. Night has a separate Cycles light setup. Its temporary soft loading silhouette is only a transition.
- Authored pine spray UV marks each attached edge. Blender v=0 becomes glTF v=1. Attach weight must stay zero. Do not swap back to a centroid heuristic. Preserve the 130 crest pads and existing route, structures and approved field limits at `4eb4627`.
- Preserve genuine seeded preview evidence, verified native plate orientation and the 2 mm gap / 5 mm penetration bounds. Do not loosen timeout, tests, UV coverage or overlap criteria to advance a candidate.
- No publishing or merges without Boss. Commit English code, docs and validated final delivery files only. Leave Blender projects, EXR masters, screenshots, videos, downloaded tools and scratch scripts outside Git. Do not modify Snow Roof, Cloud Cliff, the cover or the main checkout. The allowed main-checkout writes are the ignored Pine Gate artifacts.
