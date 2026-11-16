// A modest fictional timber hall. Geometry is built at real scale around its floor and column grid.
// The caller owns material caching, batching, illumination and disposal.
export function buildHall(o, h) {
  const { THREE, V3, M, box, put, roofGeo, roofMat, pavingTex, grainTex, latticeTex, context: C } = h;
  const x = o.x ?? 0, y = o.y ?? 0, z = o.z ?? 0, w = o.w, d = o.d, height = o.h;
  const base = o.base ?? .45, floorY = y + base, frontZ = z + d / 2, backZ = z - d / 2;
  const columnR = Math.max(.09, Math.min(.2, height * .032));
  const stone = o.baseM ?? M(0x929087, .94, { map: pavingTex });
  const timber = o.timber ?? C.col ?? M(0x543226, .83, { map: grainTex });
  const darkWood = M(0x39291f, .88, { map: grainTex });
  const beamWood = M(0x4a3024, .83, { map: grainTex });
  const infill = o.wall ?? M(0xb8b3a6, .97);
  const roof = o.roof ?? roofMat(0x414447);
  const beamH = Math.max(.17, Math.min(.3, height * .065));
  const beamY = floorY + height - beamH / 2;
  const roofY = floorY + height + .12, rise = Math.min(2.2, Math.max(.85, height * .28));
  const roofW = w + 1.25, roofD = d + 1.4, lift = Math.min(.28, o.lift ?? .18);
  const bayCount = Math.max(3, Math.min(7, Math.round(w / 2.4) | 1)), bayW = w / bayCount;

  // Plinth edge stays close to the nominal footprint, with three shallow front steps.
  box(w + .45, base, d + .45, stone, x, y + base / 2, z);
  box(w + .51, .06, d + .51, stone, x, floorY - .025, z);
  const stepW = Math.min(w * .6, Math.max(1.8, bayW * 1.6));
  for (let i = 0; i < 3; i++) {
    const top = y + base * (i + 1) / 3;
    box(stepW + (2 - i) * .13, top - y, .18, stone, x, y + (top - y) / 2, frontZ + .25 + (2 - i) * .16);
  }
  // Three walls enclose a real recessed room, while the front is a screen of separate bays.
  const wallH = height - beamH - .05;
  box(w, wallH, .16, infill, x, floorY + wallH / 2, backZ + .08);
  for (const side of [-1, 1]) box(.16, wallH, d, infill, x + side * (w / 2 - .08), floorY + wallH / 2, z);
  box(w - .35, .06, d - .35, darkWood, x, floorY + .015, z);
  // Exposed posts sit on stone drums. Front and rear grids carry the same longitudinal beams.
  const columnGeo = new THREE.CylinderGeometry(columnR * .91, columnR, height - .12, 20);
  const baseGeo = new THREE.CylinderGeometry(columnR * 1.43, columnR * 1.6, .14, 24);
  const postXs = [];
  for (let i = 0; i <= bayCount; i++) postXs.push(x - w / 2 + i * bayW);
  for (const px of postXs) for (const pz of [frontZ - .1, backZ + .12]) {
    put(baseGeo.clone(), stone, px, floorY + .07, pz);
    put(columnGeo.clone(), timber, px, floorY + .14 + (height - .12) / 2, pz);
    // Plain mortise-and-tenon caps, with short cross arms that visibly support the beam.
    box(columnR * 2.1, .09, columnR * 2.1, darkWood, px, floorY + height - .08, pz);
    box(.55, .11, .18, beamWood, px, floorY + height + .025, pz);
    box(.18, .11, .55, beamWood, px, floorY + height + .12, pz);
  }
  for (const pz of [frontZ - .1, backZ + .12]) {
    box(w + .48, beamH, .2, beamWood, x, beamY, pz);
    box(w + .54, .055, .22, darkWood, x, beamY - beamH / 2 - .025, pz);
  }
  for (const px of postXs) box(.16, .2, d + .5, beamWood, px, floorY + height + .2, z);

  // Recessed windows use physical timber bars, mullions, sills and opaque paper backing inside the room.
  const screenZ = frontZ - .2, screenBottom = floorY + .48, screenTop = floorY + height - .35;
  const center = Math.floor(bayCount / 2), warm = o.glowColor ?? 0xffb36a;
  const inside = M(0x6d5d45, .98, { emissive: warm, emissiveIntensity: (o.glow ?? .5) * .035, map: latticeTex });
  const doorWood = M(0x4b3021, .88, { map: grainTex });
  for (let i = 0; i < bayCount; i++) {
    const bx = x - w / 2 + (i + .5) * bayW, bw = bayW - columnR * 2 - .1;
    if (i === center) {
      // Separate double doors, quietly opened when a builder explicitly asks for an open hall.
      const doorH = height - .38, leafW = (bw - .04) / 2;
      for (const side of [-1, 1]) {
        if (o.open) {
          const leaf = new THREE.BoxGeometry(leafW, doorH, .065); leaf.translate(side * leafW / 2, 0, 0); leaf.rotateY(side * 1.05);
          put(leaf, doorWood, bx + side * bw / 2, floorY + doorH / 2 + .04, screenZ - .05);
        } else {
          const lx = bx + side * (leafW / 2 + .02);
          box(leafW, doorH, .065, doorWood, lx, floorY + doorH / 2 + .04, screenZ);
          box(leafW - .12, doorH * .44, .025, darkWood, lx, floorY + doorH * .3, screenZ + .045);
          for (const sy of [.12, .58, .91]) box(leafW - .06, .045, .035, beamWood, lx, floorY + doorH * sy, screenZ + .07);
          put(new THREE.TorusGeometry(.035, .005, 6, 20), M(0x66543a, .65, { metalness: .7 }), bx + side * .065, floorY + doorH * .48, screenZ + .075);
        }
      }
      continue;
    }
    const windowH = screenTop - screenBottom;
    box(bw, .42, .11, infill, bx, floorY + .21, screenZ);
    box(bw + .08, .07, .23, stone, bx, screenBottom - .035, screenZ + .015);
    box(bw, windowH, .025, inside, bx, (screenBottom + screenTop) / 2, screenZ - .095);
    for (const side of [-1, 1]) box(.06, windowH + .1, .08, darkWood, bx + side * bw / 2, (screenBottom + screenTop) / 2, screenZ + .005);
    for (const wy of [screenBottom, screenTop]) box(bw + .1, .06, .09, beamWood, bx, wy, screenZ + .015);
    const cells = Math.max(4, Math.round(bw / .19));
    for (let j = 1; j < cells; j++) box(.025, windowH, .04, darkWood, bx - bw / 2 + bw * j / cells, (screenBottom + screenTop) / 2, screenZ + .035);
    const rows = Math.max(4, Math.round(windowH / .24));
    for (let j = 1; j < rows; j++) box(bw, .024, .045, darkWood, bx, screenBottom + windowH * j / rows, screenZ + .04);
    // A broader central mullion gives each bay a practical opening rather than a repeated texture grid.
    box(.055, windowH, .07, beamWood, bx, (screenBottom + screenTop) / 2, screenZ + .05);
  }

  // A single plain pitched roof. Visible rafters and fascia carry its overhang; no rank ornaments.
  const r = roofGeo(roofW, roofD, rise, lift); put(r.g, roof, x, roofY, z);
  box(Math.max(.3, r.ridge * 2), .12, .2, roof, x, roofY + rise + .03, z);
  const frontHalf = roofD / 2;
  const roofHeight = (px, pz) => {
    const az = Math.abs(pz) / frontHalf, ax = Math.max(0, Math.abs(px) - r.ridge) / (roofW / 2 - r.ridge);
    const t = Math.min(1, Math.max(az, ax));
    return rise * Math.pow(1 - t, 1.7) + lift * Math.pow(t, 4) * (.25 + .75 * Math.pow(Math.min(ax, az) + .0001, 1.5));
  };
  for (let px = -roofW / 2 + .12; px <= roofW / 2; px += .32) {
    const edgeY = roofHeight(px, frontHalf);
    for (const side of [-1, 1]) {
      // Short joined lengths follow the roof's actual slight curve and hips without piercing the tiles.
      for (let k = 0; k < 5; k++) {
        const z0 = side * frontHalf * k / 5, z1 = side * frontHalf * (k + 1) / 5;
        const y0 = roofHeight(px, z0), y1 = roofHeight(px, z1), run = Math.abs(z1 - z0);
        const rafter = new THREE.BoxGeometry(.075, .085, Math.hypot(run, y1 - y0));
        rafter.rotateX(side * Math.atan2(y0 - y1, run));
        put(rafter, beamWood, x + px, roofY + (y0 + y1) / 2 - .11, z + (z0 + z1) / 2);
      }
      const tileEnd = new THREE.CylinderGeometry(.065, .065, .055, 12); tileEnd.rotateX(Math.PI / 2);
      put(tileEnd, roof, x + px, roofY + edgeY - .005, z + side * (frontHalf + .015));
    }
  }
  for (const side of [-1, 1]) box(roofW, .13, .08, darkWood, x, roofY - .09, z + side * frontHalf);
  return { top: roofY + rise + .09, front: frontZ + .72, doors: V3(x, floorY + Math.min(1.6, height * .45), frontZ) };
}
