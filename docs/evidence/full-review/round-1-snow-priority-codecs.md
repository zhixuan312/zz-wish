The raw lightmap alternatives do not improve the Source15 budget. The reviewed
UASTC package remains unchanged at **16,921,440 bytes**, above the 15,000,000-byte
limit. These are CPU measurements of separate files, with no browser, loader,
performance, adoption or full-quality bake approval.

| Lightmap encoding | Actual map bytes | Comparison |
| --- | ---: | --- |
| Existing UASTC, all 16 maps | 9,943,179 | Reference |
| Raw RGBA8 + Zstd22, all 16 maps | 12,155,659 | 2,212,480 bytes larger |
| UASTC hall-day / court-day | 1,096,164 / 1,106,775 | Two largest reference maps |
| Raw RGBA16F + Zstd22, hall-day / court-day | 2,389,240 / 3,153,258 | Both larger |

RGBA8 compression is lossless **after explicit conversion of the existing
16-bit log-HDR PNG signal to 8-bit RGB**, with alpha 255. It is not lossless to
the 16-bit PNGs or EXR masters. The maximum normalized signal conversion error
is 0.00195315. All 48 actual KTX mip arrays decode byte-for-byte to the derived
RGBA8 PNG arrays using Three 160's Zstd decoder. The actual headers are linear
`VK_FORMAT_R8G8B8A8_UNORM`, three levels and Zstd supercompression. Every map is
larger than its UASTC reference; the separate complete package is 19,139,493 bytes.

Official `ktx create --raw --format R16G16B16A16_SFLOAT` supports the HalfFloat
probe. Both maps have three linear levels and Zstd compression, and all six
decoded half arrays match the explicitly converted source data. The implemented conversion passes the normalized signal through Float32 before
half conversion; an exhaustive check found two of 65,536 possible levels differ
from direct nearest-half rounding. The actual measured payload and errors below
remain valid. Half conversion is also quantization: maximum normalized signal error is 0.0002430 for hall-day
and 0.0002401 for court-day. Maximum relative decoded HDR error above 0.0001 is
0.2524% / 0.3157%. Only these two maps were encoded; no all-16 HalfFloat download
size is claimed. Original PNGs and EXRs are unchanged.

| Resident mip storage | Existing 1-byte/pixel block format | Raw RGBA8 |
| --- | ---: | ---: |
| Active night + lamp, eight maps | 17,891,328 B (17.0625 MiB) | 71,565,312 B (68.25 MiB) |
| All 16 maps, worst case | 35,782,656 B (34.125 MiB) | 143,130,624 B (136.5 MiB) |

These count actual mip texels and exclude driver alignment and other render
targets. The runtime normally uploads only the active ambient banks and lamp
maps; fetching other looks as bytes does not itself add GPU residency. Raw
HalfFloat would double the RGBA8 storage at identical dimensions, a projection
rather than an all-16 encode. Devices using an RGBA fallback for the existing
block format may already pay the RGBA8 amount.

A separate lossless model-container size probe finds Brotli quality 11 at
5,974,565 bytes versus the existing gzip's 6,439,992 bytes, with exact decoded
GLB bytes. Its 465,427-byte saving still leaves 1,456,013 bytes over budget. No
runtime loader change or adoption is included in that size-only observation.

Zstd22 on the same actual GLB is 6,102,225 bytes. Native decode and Three 160's
actual embedded-WASM Zstd decoder both reproduce the original model byte for
byte. This saves 337,767 bytes versus gzip, but is 127,660 bytes larger than the
Brotli size probe. Single-run Node timings were 12.7 ms for WASM initialization
and 24.3 ms for decode; they are not browser performance measurements. The
reusable helper is `scripts/probe-model-zstd.mjs` and the complete input/tool/
output bindings are in the JSON companion.

The current phone poses at world Z 2.0 were rechecked against the actual
postbatch geometry. Coarse chart coverage remains complete with no certified
hidden visible hits. Burning median worst-axis floor/column/beam pitch is
5.18 / 5.60 / 5.57 cm per texel. This numeric coverage check does not substitute
for actual app visual review.

The [JSON receipt](round-1-snow-priority-codecs.json) contains complete hashes,
per-map sizes and errors, official commands, script identities, immutable source
references and the updated camera proofs. Reproduction helpers are
`scripts/probe-raw-lightmap-zstd.mjs` and
`scripts/probe-half-lightmap-zstd.mjs`; each requires a new ignored output
directory and never rewrites the reference package or masters.
