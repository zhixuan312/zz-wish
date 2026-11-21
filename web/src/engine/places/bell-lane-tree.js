// The court tree is built once as two static meshes: ridged wood and leaf blades.
export function addBellLaneTree({ THREE, V3, M, context }, [x, y, z]) {
  const bark = { positions: [], indices: [], colors: [], uv: [] };
  const leaves = { positions: [], indices: [], colors: [], uv: [] };
  const up = V3(0, 1, 0);
  const wood = new THREE.Color(0x65584a);
  const moss = new THREE.Color(0x50513a);
  const roots = [[.43, .47, .25], [2.51, .43, .22], [4.70, .29, .30], [5.64, .20, .23]];
  const addVertex = (mesh, point, color) => {
    mesh.positions.push(point.x, point.y, point.z);
    mesh.colors.push(color.r, color.g, color.b);
  };

  function limb(nodes, sides, grounded = false) {
    const centers = nodes.map(node => V3(...node.slice(0, 3)));
    const first = bark.positions.length / 3;
    const axis = centers.at(-1).clone().sub(centers[0]).normalize();
    const reference = Math.abs(axis.x) > .7 ? up : V3(1, 0, 0);
    // A single vertex closes the taper. A child shoot always starts upstream
    // of this point, inside a part of the parent that can support it.
    const ringCount = centers.length - 1;
    centers.slice(0, ringCount).forEach((center, ring) => {
      const tangent = centers[Math.min(ring + 1, centers.length - 1)].clone()
        .sub(centers[Math.max(ring - 1, 0)]).normalize();
      const u = reference.clone().addScaledVector(tangent, -reference.dot(tangent)).normalize();
      const v = u.clone().cross(tangent);
      const radius = nodes[ring][3];
      for (let side = 0; side < sides; side++) {
        const a = side / sides * Math.PI * 2;
        const groove = Math.sin(5 * a + center.y * 1.1) * .55 + Math.cos(9 * a - center.y * .7) * .45;
        const edge = radius * (1 + .13 * groove);
        // Buttresses are folds of the trunk itself. The paving intersects
        // each fold low on its slope, where the exposed ridge tapers away.
        const foot = grounded ? Math.max(0, 1 - (center.y + .03) / .40) ** 2 : 0;
        const flare = roots.reduce((sum, [angle, reach, width]) => {
          const arc = Math.acos(Math.cos(a - angle));
          return sum + reach * Math.exp(-.5 * (arc / width) ** 2) * foot;
        }, 0);
        const point = center.clone().addScaledVector(u, Math.cos(a) * (edge + flare))
          .addScaledVector(v, Math.sin(a) * (edge + flare));
        const color = wood.clone().lerp(moss, foot * .45).multiplyScalar(1 + groove * .19);
        addVertex(bark, point, color);
        bark.uv.push(side / sides, center.y);
      }
    });
    for (let ring = 1; ring < ringCount; ring++) for (let side = 0; side < sides; side++) {
      const a = first + (ring - 1) * sides + side;
      const b = first + (ring - 1) * sides + (side + 1) % sides;
      bark.indices.push(a, a + sides, b, b, a + sides, b + sides);
    }
    const tip = bark.positions.length / 3;
    addVertex(bark, centers.at(-1), wood);
    bark.uv.push(.5, centers.at(-1).y);
    const lastRing = tip - sides;
    for (let side = 0; side < sides; side++) {
      bark.indices.push(lastRing + side, tip, lastRing + (side + 1) % sides);
    }
    return first;
  }

  const trunk = [
    [0, -.03, 0, .39], [0, .023, 0, .34], [0, .082, 0, .295],
    [0, .17, 0, .275], [0, .32, 0, .264], [-.028, .67, .025, .25],
    [.055, 1.23, .018, .224], [.049, 1.80, -.06, .221], [-.07, 2.32, -.09, .194],
    [-.29, 2.90, -.18, .146], [-.43, 3.48, -.33, .10], [-.41, 3.99, -.49, .049],
    [-.64, 4.55, -.63, .021], [-.75, 4.86, -.67, 0],
  ];
  limb(trunk, 32, true);
  limb([
    [.03, 1.80, -.05, .155], [.20, 2.31, -.10, .133], [.38, 2.72, -.07, .099],
    [.71, 3.06, -.22, .075], [.98, 3.31, -.28, .046], [1.20, 3.51, -.38, .023], [1.39, 3.76, -.45, 0],
  ], 10);
  // The foreground fork starts inside the trunk and grows through a broad
  // collar before resuming the original branch profile.
  const collarSides = 12;
  const collarStart = limb([
    [.047, 1.72, -.050, .090], [.018, 1.91, -.007, .116], [-.039, 2.09, .080, .127],
    [-.117, 2.245, .205, .114], [-.20, 2.42, .32, .097], [-.43, 2.80, .61, .067],
    [-.68, 3.02, .89, .044], [-.78, 3.32, 1.13, .023], [-1.05, 3.65, 1.26, 0],
  ], collarSides);

  const limbs = [
    [[-.27, 2.83, -.17, .079], [-.67, 3.12, -.31, .053], [-1.20, 3.43, -.55, .021], [-1.60, 3.77, -.73, 0]],
    [[-.43, 3.47, -.32, .053], [-.80, 3.79, -.15, .035], [-1.20, 4.10, .16, .018], [-1.56, 4.35, .32, 0]],
    [[-.39, 3.78, -.45, .049], [-.39, 4.13, -.92, .035], [-.21, 4.45, -1.26, .017], [-.39, 4.72, -1.73, 0]],
    [[-.47, 4.20, -.53, .034], [-.75, 4.66, -.40, .025], [-1.05, 4.92, -.36, .014], [-1.29, 5.16, -.20, 0]],
    [[-.40, 3.90, -.46, .040], [-.18, 4.38, -.22, .027], [.13, 4.68, -.21, .015], [.33, 4.99, -.41, 0]],
    [[.37, 2.69, -.08, .064], [.68, 2.92, .19, .047], [1.04, 3.07, .49, .027], [1.29, 3.38, .79, 0]],
    [[.70, 3.05, -.21, .049], [.95, 3.38, -.53, .033], [1.17, 3.70, -.77, .016], [1.42, 3.93, -1.07, 0]],
    [[.96, 3.30, -.28, .034], [1.21, 3.53, -.07, .026], [1.54, 3.75, .06, .015], [1.79, 3.99, .12, 0]],
    [[1.18, 3.49, -.38, .021], [1.28, 3.84, -.35, .017], [1.24, 4.15, -.25, .010], [1.19, 4.36, -.19, 0]],
    [[1.27, 3.86, -.35, .012], [1.08, 4.09, -.04, .010], [.98, 4.35, .29, .007], [.88, 4.63, .48, 0]],
    [[-.43, 2.79, .60, .048], [-.26, 3.13, .97, .036], [-.01, 3.52, 1.16, .017], [.08, 3.79, 1.43, 0]],
    [[-.69, 3.04, .90, .036], [-.90, 3.29, 1.18, .025], [-1.24, 3.47, 1.41, .013], [-1.51, 3.71, 1.55, 0]],
    [[-.09, 2.45, -.11, .067], [-.10, 2.85, -.54, .047], [.04, 3.24, -.95, .023], [.36, 3.54, -1.29, 0]],
  ];
  const palette = [0x617643, 0x627648, 0x708150, 0x788652, 0x566c40].map(color => new THREE.Color(color));
  const rnd = context.rnd;

  function foliage(attachment, axis, size, color, cluster) {
    const across = V3(-axis.z, 0, axis.x).normalize().applyAxisAngle(axis, (rnd() - .5) * 2.2);
    const heel = attachment.clone().addScaledVector(axis, -size * .11);
    const index = leaves.positions.length / 3;
    addVertex(leaves, heel.clone().addScaledVector(across, size * .60), color);
    addVertex(leaves, heel.clone().addScaledVector(across, -size * .60), color);
    addVertex(leaves, attachment.clone().addScaledVector(axis, size * 1.08), color);
    const lower = cluster ? 0 : .5;
    leaves.uv.push(0, lower, 1, lower, .5, lower + .5);
    leaves.indices.push(index, index + 1, index + 2);
  }

  for (const branch of limbs) {
    limb(branch, 8);
    const axis = branch.map(node => V3(...node.slice(0, 3)));
    // Offset each fork both along and around the branch. Short shoots then
    // carry alternate leaves on several levels across each rounded clump.
    for (const [joint, sign, depth] of [[1, -1, .30], [1, 1, -.73], [2, -1, .82], [2, 1, -.46]]) {
      const parent = axis[joint + 1].clone().sub(axis[joint]);
      const fraction = .13 + rnd() * .38;
      const start = axis[joint].clone().addScaledVector(parent, fraction);
      const forward = parent.normalize();
      const lateral = forward.clone().cross(up).normalize();
      const reach = .30 + rnd() * .39;
      const elbow = start.clone().addScaledVector(forward, reach * .36)
        .addScaledVector(lateral, sign * reach * .55).addScaledVector(up, depth * .18);
      const tip = elbow.clone().addScaledVector(forward, reach * .45)
        .addScaledVector(lateral, sign * reach * .37).addScaledVector(up, .05 + depth * .24);
      const r = (branch[joint][3] * (1 - fraction) + branch[joint + 1][3] * fraction) * .64;
      limb([[...start.toArray(), r], [...elbow.toArray(), r * .54], [...tip.toArray(), 0]], 4);
      const green = palette[Math.floor(rnd() * palette.length)];

      for (const [at, turn, rise] of [[.08, 1, .38], [.36, -1, -.51], [.70, .7, .29], [.86, -.60, .56]]) {
        const base = elbow.clone().lerp(tip, at);
        const ray = tip.clone().sub(elbow).normalize().addScaledVector(lateral, turn * (.7 + rnd() * .5))
          .addScaledVector(up, rise).normalize();
        const shootLength = .14 + rnd() * .24;
        const end = base.clone().addScaledVector(ray, shootLength);
        limb([[...base.toArray(), Math.min(.004, r * .42 * (1 - at))], [...end.toArray(), 0]], 3);
        const cross = ray.clone().cross(up).normalize();
        const blades = 11 + Math.floor(rnd() * 5);
        for (let i = 0; i < blades; i++) {
          const t = (i + .36 + rnd() * .57) / blades;
          const attach = base.clone().lerp(end, t);
          const stalk = ray.clone().addScaledVector(cross, (i % 2 ? -1 : 1) * (.83 + rnd() * 1.3))
            .addScaledVector(up, (rnd() - .44) * 1.28).normalize();
          // Fill the heart of each lobe with short sprays. Individual blades
          // on the outside preserve the smaller openings between their tips.
          const cluster = t > .14 && t < .89 && rnd() < .77;
          const size = (cluster ? .197 + rnd() * .085 : .062 + rnd() * .059) * (1 - .17 * t);
          foliage(attach, stalk, size, green.clone().multiplyScalar(.87 + rnd() * .25), cluster);
        }
      }
    }
  }

  function smoothCollar(geo) {
    const { position, normal, color } = geo.attributes;
    // Use the parent cylinder's local surface direction at the junction.
    // A few centimetres from the trunk, leave the branch normals intact.
    const blendEnd = collarStart + 5 * collarSides;
    for (let i = collarStart; i < blendEnd; i++) {
      const point = V3().fromBufferAttribute(position, i);
      const upper = trunk.findIndex(node => node[1] >= point.y);
      const [ax, ay, az, ar] = trunk[upper - 1];
      const [bx, by, bz, br] = trunk[upper];
      const t = (point.y - ay) / (by - ay);
      const radial = V3(point.x - THREE.MathUtils.lerp(ax, bx, t), 0, point.z - THREE.MathUtils.lerp(az, bz, t));
      const angle = Math.atan2(radial.z, radial.x);
      const groove = Math.sin(5 * angle + point.y * 1.1) * .55 + Math.cos(9 * angle - point.y * .7) * .45;
      const radius = THREE.MathUtils.lerp(ar, br, t) * (1 + .13 * groove);
      const weight = 1 - THREE.MathUtils.smoothstep(radial.length() - radius, .008, .113);
      const stemNormal = radial.normalize();
      stemNormal.y = -(stemNormal.x * (bx - ax) + stemNormal.z * (bz - az) + br - ar) / (by - ay);
      stemNormal.normalize();
      const n = V3().fromBufferAttribute(normal, i).lerp(stemNormal, weight).normalize();
      normal.setXYZ(i, n.x, n.y, n.z);
      const tint = new THREE.Color().fromBufferAttribute(color, i)
        .lerp(wood.clone().multiplyScalar(1 + groove * .19), weight);
      color.setXYZ(i, tint.r, tint.g, tint.b);
    }
  }

  const group = new THREE.Group();
  group.name = 'Bell Lane old tree';
  group.position.set(x, y, z);
  function mesh(data, material, name) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(data.colors, 3));
    if (data.uv) geo.setAttribute('uv', new THREE.Float32BufferAttribute(data.uv, 2));
    geo.setIndex(data.indices);
    geo.computeVertexNormals();
    if (data === bark) smoothCollar(geo);
    const object = new THREE.Mesh(geo, material);
    object.name = name;
    object.castShadow = true;
    object.receiveShadow = true;
    group.add(object);
  }
  mesh(bark, M(0xffffff, .97, { vertexColors: true }), 'Trunk and branches');
  mesh(leaves, M(0xffffff, .84, {
    map: camphorLeaves(THREE), alphaTest: .42, vertexColors: true, bumpMap: null, side: THREE.DoubleSide,
  }), 'Leaf sprays');
  context.G.add(group);
}

// The atlas carries a single blade and one five-leaf sprig. Both fit
// within a triangle, so the silhouettes can use small overlapping layers.
function camphorLeaves(THREE) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  function blade(x, y, tipX, tipY, width, tint) {
    const dx = tipX - x, dy = tipY - y;
    const length = Math.hypot(dx, dy);
    const sx = -dy / length * width, sy = dx / length * width;
    ctx.fillStyle = tint;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(x + dx * .18 + sx, y + dy * .18 + sy,
      x + dx * .60 + sx, y + dy * .60 + sy, tipX, tipY);
    ctx.bezierCurveTo(x + dx * .68 - sx, y + dy * .68 - sy,
      x + dx * .17 - sx, y + dy * .17 - sy, x, y);
    ctx.fill();
    ctx.strokeStyle = '#c6ceb0';
    ctx.lineWidth = .8;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + dx * .87, y + dy * .87);
    ctx.stroke();
  }

  blade(64, 115, 64, 12, 25, '#f3f4ef');
  ctx.strokeStyle = '#9da980';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(64, 251);
  ctx.quadraticCurveTo(62, 211, 65, 186);
  ctx.stroke();
  blade(64, 240, 29, 218, 10, '#d9e0c9');
  blade(64, 247, 104, 223, 11, '#e6ecd8');
  blade(63, 222, 39, 199, 9, '#e7ecd8');
  blade(64, 232, 95, 202, 10, '#d0d9bd');
  blade(64, 208, 65, 146, 13, '#f3f4ef');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
