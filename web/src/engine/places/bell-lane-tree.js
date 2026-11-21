// The court tree is built once as two static meshes: ridged wood and folded leaves.
export function addBellLaneTree({ THREE, V3, M, context }, [x, y, z]) {
  const bark = { positions: [], indices: [], colors: [], uv: [] };
  const leaves = { positions: [], indices: [], colors: [] };
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
    centers.forEach((center, ring) => {
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
    for (let ring = 1; ring < centers.length; ring++) for (let side = 0; side < sides; side++) {
      const a = first + (ring - 1) * sides + side;
      const b = first + (ring - 1) * sides + (side + 1) % sides;
      bark.indices.push(a, a + sides, b, b, a + sides, b + sides);
    }
  }

  limb([
    [0, -.03, 0, .39], [0, .023, 0, .34], [0, .082, 0, .295],
    [0, .17, 0, .275], [0, .32, 0, .264], [-.028, .67, .025, .25],
    [.055, 1.23, .018, .224], [.049, 1.80, -.06, .207], [-.07, 2.32, -.09, .183],
    [-.29, 2.90, -.18, .134], [-.43, 3.48, -.33, .09], [-.41, 3.99, -.49, .049],
    [-.64, 4.55, -.63, .021], [-.75, 4.86, -.67, .003],
  ], 32, true);
  limb([
    [.03, 1.80, -.05, .155], [.20, 2.31, -.10, .133], [.38, 2.72, -.07, .099],
    [.71, 3.06, -.22, .072], [.87, 3.38, -.18, .042], [1.11, 3.72, -.29, .02], [1.26, 4.03, -.44, .003],
  ], 10);
  limb([
    [.02, 1.95, -.024, .115], [-.20, 2.42, .32, .097], [-.43, 2.80, .61, .067],
    [-.68, 3.02, .89, .044], [-.78, 3.32, 1.13, .023], [-1.05, 3.65, 1.26, .003],
  ], 10);

  const limbs = [
    [[-.27, 2.83, -.17, .080], [-.63, 3.20, -.31, .059], [-1.12, 3.59, -.42, .026], [-1.64, 3.86, -.72, .004]],
    [[-.43, 3.47, -.32, .053], [-.75, 3.84, -.18, .036], [-1.23, 4.07, .20, .016], [-1.67, 4.39, .34, .004]],
    [[-.39, 3.78, -.45, .049], [-.39, 4.11, -.91, .035], [-.25, 4.45, -1.26, .016], [-.39, 4.72, -1.73, .004]],
    [[-.64, 4.55, -.62, .025], [-.72, 4.75, -.48, .021], [-.99, 4.98, -.36, .012], [-1.15, 5.19, -.20, .003]],
    [[.37, 2.69, -.08, .064], [.66, 2.92, .16, .047], [1.09, 3.11, .43, .024], [1.46, 3.45, .63, .004]],
    [[.70, 3.05, -.21, .048], [.79, 3.50, -.65, .034], [1.10, 3.80, -.84, .015], [1.32, 4.02, -1.21, .004]],
    [[.87, 3.37, -.19, .032], [1.13, 3.68, -.16, .025], [1.44, 3.88, .17, .013], [1.78, 4.22, .21, .003]],
    [[-.43, 2.79, .60, .048], [-.27, 3.12, .95, .038], [-.06, 3.39, 1.34, .018], [.06, 3.66, 1.65, .004]],
    [[-.69, 3.04, .90, .036], [-.86, 3.26, 1.05, .025], [-1.16, 3.42, 1.46, .012], [-1.49, 3.68, 1.53, .003]],
    [[-.09, 2.45, -.11, .067], [-.10, 2.85, -.54, .046], [.04, 3.23, -.95, .020], [.35, 3.50, -1.28, .004]],
  ];
  const palette = [0x51673b, 0x607847, 0x6c7c47, 0x818e54, 0x53694a].map(color => new THREE.Color(color));
  const rnd = context.rnd;

  function leaf(base, direction, size, color) {
    const across = V3(-direction.z, 0, direction.x).normalize().applyAxisAngle(direction, (rnd() - .5) * 1.7);
    const fold = across.clone().cross(direction);
    const mid = base.clone().addScaledVector(direction, size * .47);
    const width = size * (.20 + rnd() * .095);
    const vertices = [base, mid.clone().addScaledVector(across, width), mid.clone().addScaledVector(fold, size * .10),
      mid.clone().addScaledVector(across, -width * .90), base.clone().addScaledVector(direction, size)];
    const start = leaves.positions.length / 3;
    vertices.forEach((point, i) => addVertex(leaves, point, color.clone().multiplyScalar(i === 2 ? 1.12 : .88 + rnd() * .17)));
    leaves.indices.push(start, start + 1, start + 2, start, start + 2, start + 3,
      start + 1, start + 4, start + 2, start + 2, start + 4, start + 3);
  }

  for (const branch of limbs) {
    limb(branch, 8);
    const shoulder = V3(...branch[2].slice(0, 3));
    const tip = V3(...branch[3].slice(0, 3));
    const heading = tip.clone().sub(shoulder).normalize();
    const side = heading.clone().cross(up).normalize();
    // Three sprays per branch preserve the open spaces between the larger limbs.
    for (const offset of [-1, 0, 1]) {
      const start = offset === 0 ? tip : shoulder.clone().lerp(tip, .16 + rnd() * .48);
      const direction = heading.clone().addScaledVector(side, offset * (.85 + rnd() * .40))
        .addScaledVector(up, rnd() * .38 - .32).normalize();
      const reach = .41 + rnd() * .23;
      const mid = start.clone().addScaledVector(direction, reach * .54).addScaledVector(up, .07);
      const end = start.clone().addScaledVector(direction, reach);
      limb([[...start.toArray(), .013], [...mid.toArray(), .008], [...end.toArray(), .002]], 5);
      for (let i = 0; i < 26; i++) {
        const progress = .15 + .85 * rnd();
        const angle = rnd() * Math.PI * 2;
        const spread = (.11 + rnd() * .32) * Math.sin(Math.PI * progress);
        const base = start.clone().lerp(end, progress).addScaledVector(side, Math.cos(angle) * spread)
          .addScaledVector(up, Math.sin(angle) * spread);
        const axis = direction.clone().addScaledVector(side, Math.cos(angle) * .95)
          .addScaledVector(up, (rnd() - .5) * 1.15).normalize();
        leaf(base, axis, .14 + rnd() * .15, palette[Math.floor(rnd() * palette.length)]);
      }
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
    const object = new THREE.Mesh(geo, material);
    object.name = name;
    object.castShadow = true;
    object.receiveShadow = true;
    group.add(object);
  }
  mesh(bark, M(0xffffff, .97, { vertexColors: true }), 'Trunk and branches');
  mesh(leaves, M(0xffffff, .88, { vertexColors: true, bumpMap: null, side: THREE.DoubleSide }), 'Leaf sprays');
  context.G.add(group);
}
