Source16 is physically frozen as a C6/B4 candidate at
`art/build/snow-roof-round1/source-v16.blend`, SHA256
`8f414ee9c99550192a767ef1d1e498316f760863f949a2b417c43d701b428814`.
The 2 W / 4 mm light is a **LOW8 proposal, not candle-power or optical approval**. At the initial source freeze, no rendering,
baking, runtime change, public install or commit had occurred.

The scene starts from the exact frozen `402d192b…` source, not a reconstruction.
It imports all 56 real indexed runtime parts and their normals/UVs, preserving
the open bottom, actual top/vent supports, 12 ribs, cup, spokes, wick and tassel.
The short exported cord stays unchanged. A separate actual
`THREE.CylinderGeometry(1,1,1,8)` extension matches the runtime radius 2.5 mm,
CSS `#746041`, metalness 0.7 and roughness 0.5. The obsolete Source15 36-triangle
suspension is removed; every other construction object and material stays exact.

| Saved-source measurement | Actual result |
| --- | --- |
| Point source | `[-1.5,2.25,-1.299999952]`, 2 W, radius 0.00400000019 m |
| Body attachment | `[-1.499300003,2.838900089,-1.299999952]` |
| Fresh upward ceiling hit | `[-1.499300003,5.039999962,-1.299999952]` |
| Bearing surface | Dark boarded ceiling, polygon 48, Dark old timber |
| Actual upper embedding | 0.999928 mm |
| Whole-triangle body clearance | conservatively at least 1.44562 m |
| Proxy geometry | 57 parts / 24,316 triangles, export excluded |
| Remaining static scene | 1,871 objects / 330,740 triangles |
| Import position / normal / UV error | 1.19209e−7 m / 9.65899e−8 / 0 |

The clearance certificate uses actual evaluated architecture and a conservative
distance bound covering every body triangle. The upward ray starts on the
actual suspension axis and hits the underside; it never guesses from a roof
bound. The two zero-normal cup vertices occur exclusively on two exactly
collapsed, zero-area triangles. All indices remain; every nondegenerate normal
keeps the 1e−6 import guard.

The gauze uses the real photographed weave/normal/roughness maps. It has no
emission nodes: ordinary rays see diffuse/translucent dyed fabric; shadow rays
see exact specified throughput `linearCSS × .22 / max(linearCSS)`, red RGB
`[.22,.0130084233384385,.00652419177550621]`. Actual opaque cap/rib/cup geometry
blocks light. The inherited warm source chromaticity stays unchanged.

`configure_light_pass` verifies zero visible proxy meshes and 0 W visitor light
for night/dusk/day; the lamp pass has all 57 meshes and 2 W. The authored full
scene retains the proxy and candle for native composition review. Consequently,
use the authored full-scene mode when reviewing the visible lantern; a night-only
ambient preview deliberately omits it.

The reopened file passes all 47 strict resting/mounted contacts and actual
static wick/incense/light anchors, plus the +3 mm / −6 mm challenges. All 1,871
remaining static meshes have byte-exact positions, UV0, world normals and tint
against the frozen base, with maximum errors zero. Original used material/image
inputs, world/exposure, other lights and object transforms remain unchanged.

The compact source certificate and `lampBasis.transport` carry the actual
geometry/script hashes, physical endpoints and `actual-gauze` version-1 runtime
handshake. Proxy arrays are hashed in the transport fingerprint, not copied
into scene JSON. Untagged Source15 and Cloud behavior remains unchanged.

Reproduction uses `art/blender/patch_snow_lantern_transport.py` with the frozen
base `402d192b…`, actual geometry file `4a8c0b97…` and
`--basis=-1.5,2.25,-1.3`. The source records those full input hashes, helper paths
and the source-freeze recipe. [The JSON handoff](round-1-snow-source16-c6.json)
binds the actual saved source, build/reopen/contact receipts and complete script
identities. Large sources and full per-object audit arrays remain ignored.

Native LOW8 and actual app optical review remain pending, including cloth
brightness, the floor/altar light pool and the baked/live handoff. Fresh unique
UV/source/contact/normal guards and all new GI are still required; Source15
lightmap pixels are not reusable. Full64 and final delivery remain unapproved.
