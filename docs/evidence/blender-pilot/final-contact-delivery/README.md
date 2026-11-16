# Final contact-sampling delivery

The staged candidate is `art/build/snow-roof-final-contact-delivery`. `delivery-summary.json` binds its actual files, manifest hash and byte total. No public files were installed by this pipeline task.

All twelve original 64-sample Metal/Cycles + Metal OpenImageDenoise transport maps remain the source. The eight hall/court night, dusk, day and lamp images receive the accepted bounded sampling-domain correction; the four gate maps remain byte-identical. No new Cycles bake, OIDN pass, authored geometry or light change occurred.

For each look, 2,098 court and 682 hall texel centres are replaced only because geometry independently certifies them hidden. Donors are the nearest permitted sample within eight base pixels, in the same original chart and snow owner. Ambiguous, near-contact, covered-support and unclassified donor points are excluded without any radiance threshold. Other hidden centres with no valid donor stay unchanged. `classification-summary.json` records the source/hash bindings and local sparse certificate paths.

Every visible or uncertified linear base RGBA sample and every original noisy/denoised EXR remains bit-exact. Derived EXRs, PNGs and three mips are local build artifacts; full pixel arrays and EXRs are not copied into Git. Mips are averaged in linear radiance before gain4096 log encoding; UASTC/linear transfer/gutters8/anisotropy1/maxLod2 remain unchanged. Lossy UASTC re-encoding can change decoded block samples outside modified input pixels; exactness claims apply to linear image inputs, not decoded KTX neighborhoods. The accepted night optical diagnostic measured and disclosed those codec effects.

Production geometry uses genuine authored FLOAT32 positions, followed by freshly proven hidden-roof export pruning and exact attribute-record welding. POSITION stays5126/non-normalized/filterNONE. All retained positions, UVs, colors, materials, image payloads, scene ownership and winding were independently checked. No decoded SHORT positions were cast back to float. Full source/bake occluders remain intact; transport provenance is recorded separately.

The matching eight-sample Metal/OIDN native night reference at the exact held walk-3 projection, with visitor lamp OFF, has a smooth join. The two-night-map optical comparison reduced the jagged fringe substantially at both sizes; a faint seam remains and was accepted as a bounded improvement. New production runtime/capture acceptance is separate from the data and encoding proofs here.

Reproducible code: `art/blender/contact_padding.py --passes night,dusk,day,lamp`, `scripts/prune-float32-baked.mjs`, and `scripts/assemble-contact-delivery.py`. The four included receipts independently bind geometry, changed texels, original masters and the assembled data.
