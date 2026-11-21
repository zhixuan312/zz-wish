// Creekside trees with leaning forks, roots that follow the bank and open leaf sprays.
const SITES = [
  // Side of the creek, z, distance from the wet edge, and tree height.
  [1, -16.4, 3.1, 4.2], [1, -23.8, 1.25, 5.25], [1, -27.6, 3.6, 4.75],
  [1, -32.6, 1.45, 3.95], [1, -37.3, 2.85, 5.9], [1, -44.7, 1.2, 4.5],
  [1, -49.8, 3.4, 5.45], [1, -61.3, 1.9, 5.1],
  [-1, -37.8, 2.65, 3.85], [-1, -46.8, 1.55, 4.45],
  [-1, -56.2, 2.8, 5.25], [-1, -65.8, 1.4, 4.05],
];

function makeRandom(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let bits = Math.imul(seed ^ seed >>> 15, 1 | seed);
    bits ^= bits + Math.imul(bits ^ bits >>> 7, 61 | bits);
    return ((bits ^ bits >>> 14) >>> 0) / 4294967296;
  };
}

function leafGeometry(THREE) {
  const leaf = new THREE.BufferGeometry();
  leaf.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0, 0, -.30, .31, -.06, -.24, .72, -.02, 0, 1, .07,
    .24, .72, -.02, .30, .31, -.06, 0, .52, .11,
  ], 3));
  leaf.setIndex([0, 1, 6, 1, 2, 6, 2, 3, 6, 3, 4, 6, 4, 5, 6, 5, 0, 6]);
  leaf.computeVertexNormals();
  return leaf;
}

export function addValleyRiparianTrees(h, terrainHeight, streamCenter, streamHalfWidth) {
  const { THREE } = h;
  const group = h.context.G;
  const V3 = h.V3 ?? ((x, y, z) => new THREE.Vector3(x, y, z));
  const up = V3(0, 1, 0);
  const orientation = new THREE.Quaternion();
  const roll = new THREE.Quaternion();
  const transform = new THREE.Matrix4();
  const scale = V3(1, 1, 1);
  const daylightLeaf = new THREE.Color(0x64804b);
  const shadeLeaf = new THREE.Color(0x304a34);
  const bark = new THREE.Color(0x574e3c);
  const moss = new THREE.Color(0x526744);
  const woody = [], leaves = [], bases = [];

  function wood(from, to, radius, color) {
    const direction = to.clone().sub(from);
    const length = direction.length();
    if (length < .001) return;
    orientation.setFromUnitVectors(up, direction.divideScalar(length));
    scale.set(radius, length + Math.min(.035, radius * .38), radius);
    transform.compose(from, orientation, scale);
    woody.push([transform.clone(), color]);
  }

  function spray(from, to, size, breadth, depth, colorBias, rnd) {
    const axis = to.clone().sub(from);
    const reach = axis.length();
    axis.divideScalar(reach);
    const across = V3(-axis.z, 0, axis.x).normalize();
    for (let i = 0; i < 34; i++) {
      // Leaves build up on both sides of a twig, leaving gaps between sprays.
      const along = .11 + rnd() * .9;
      const envelope = Math.sin(along * 2.55 + .22);
      const outward = (i % 2 ? 1 : -1) * (.07 + rnd() * .93);
      const point = from.clone().addScaledVector(axis, along * reach);
      point.addScaledVector(across, outward * breadth * envelope);
      point.y += (rnd() - .55) * depth * envelope - along * along * depth * .17;

      const direction = axis.clone().multiplyScalar(.45 + rnd() * .65)
        .addScaledVector(across, outward * (.5 + rnd() * .8));
      direction.y += (rnd() - .65) * .85;
      orientation.setFromUnitVectors(up, direction.normalize());
      roll.setFromAxisAngle(up, (rnd() - .5) * 2.1);
      orientation.multiply(roll);
      const length = size * (.60 + rnd() * .75);
      scale.set(length * (.82 + rnd() * .46), length, length);
      transform.compose(point, orientation, scale);
      const sun = Math.max(0, Math.min(1, colorBias + (rnd() - .46) * .42 + along * .12));
      const tint = shadeLeaf.clone().lerp(daylightLeaf, sun);
      tint.offsetHSL((rnd() - .5) * .028, 0, (rnd() - .5) * .043);
      leaves.push([transform.clone(), tint]);
    }
  }

  for (const [index, [side, z, offset, height]] of SITES.entries()) {
    const rnd = makeRandom(6319 + index * 7681);
    const bankWidth = typeof streamHalfWidth === 'function' ? streamHalfWidth(z) : streamHalfWidth;
    const x = streamCenter(z) + side * (bankWidth + offset);
    const y = terrainHeight(x, z);
    const root = V3(x, y - .065, z);
    const tall = index % 3 !== 0;
    const trunkWidth = height * (.038 + rnd() * .013);
    const stretch = tall ? .24 : .31;
    const drift = V3(-side * (.35 + rnd() * .56), 0, (rnd() - .5) * 1.3);
    const lean = V3(-side * (height * stretch), 0, (rnd() - .57) * height * .36);
    const treeTint = bark.clone().offsetHSL((rnd() - .5) * .026, 0, (rnd() - .5) * .064);
    const rootMoss = treeTint.clone().lerp(moss, .48);
    const spine = t => V3(
      root.x + drift.x * t + lean.x * t * t,
      root.y + height * t,
      root.z + drift.z * t + lean.z * t * t,
    );
    bases.push({ x, y, z, size: trunkWidth, height, side });

    const trunkNodes = [0, .12, .28, .43, .57, .71, .83, .93, 1];
    for (let i = 1; i < trunkNodes.length; i++) {
      const level = trunkNodes[i - 1];
      wood(spine(level), spine(trunkNodes[i]),
        trunkWidth * Math.pow(1 - level, .87) * (level === 0 ? 1.15 : 1),
        i === 1 ? rootMoss : treeTint);
    }
    const rootHeading = rnd() * 2 * Math.PI;
    for (let i = 0; i < 5; i++) {
      const angle = rootHeading + i * 1.257 + (rnd() - .5) * .60;
      const outward = V3(Math.cos(angle), 0, Math.sin(angle));
      const length = trunkWidth * (2.1 + rnd() * 3.5);
      const knee = root.clone().addScaledVector(outward, length * .57);
      knee.y = terrainHeight(knee.x, knee.z) + trunkWidth * .27;
      const tip = root.clone().addScaledVector(outward, length);
      tip.y = terrainHeight(tip.x, tip.z) - .018;
      wood(spine(.031), knee, trunkWidth * (.35 + rnd() * .21), rootMoss);
      wood(knee, tip, trunkWidth * .25, rootMoss);
    }

    const branchHeading = rnd() * 2 * Math.PI;
    const primaryLevels = [.35, .43, .48, .55, .62, .66, .72, .78, .84, .89, .94];
    for (const [i, level] of primaryLevels.entries()) {
      const angle = branchHeading + i * 2.398 + (rnd() - .5) * 1.1;
      const outward = V3(Math.cos(angle), 0, Math.sin(angle));
      const cross = V3(-outward.z, 0, outward.x);
      const towardWater = -side * outward.x;
      const shape = (1.04 - level * .74) * (tall ? 1 : 1.18);
      const spread = height * (.28 + rnd() * .25) * shape * (1 + towardWater * .23);
      const rise = height * (.064 + rnd() * .135) * (tall ? 1.18 : .83);
      const thickness = trunkWidth * (.27 + (1 - level) * .28);
      const joint = spine(level);
      const elbow = joint.clone().addScaledVector(outward, spread * .48).addScaledVector(cross, (rnd() - .5) * spread * .37);
      elbow.y += rise * .69;
      const end = joint.clone().addScaledVector(outward, spread);
      end.y += rise;
      wood(joint, elbow, thickness, treeTint);
      wood(elbow, end, thickness * .60, treeTint);

      for (const fork of [-1, 1]) {
        const shoulder = elbow.clone().lerp(end, fork < 0 ? .18 : .56);
        const tip = end.clone().addScaledVector(cross, fork * spread * (.30 + rnd() * .23));
        tip.addScaledVector(outward, spread * (.13 + rnd() * .14));
        tip.y += (rnd() - .35) * height * .076;
        wood(shoulder, tip, thickness * (.23 + rnd() * .12), treeTint);
        const bias = .20 + level * .52 + rnd() * .12;
        const leafSize = height * (.042 + rnd() * .012);
        const sprayBase = shoulder.clone().lerp(tip, .35);
        spray(sprayBase, tip, leafSize, spread * .33, height * .112, bias, rnd);
        // A shorter offset twig nests above the outer spray on a few boughs.
        if (i % 3 !== 1) {
          const shortTip = shoulder.clone().lerp(tip, .80)
            .addScaledVector(cross, fork * spread * .19);
          shortTip.y += height * (.102 + rnd() * .02);
          wood(shoulder, shortTip, thickness * .16, treeTint);
          spray(shoulder.clone().lerp(shortTip, .33), shortTip, leafSize *.9,
            spread * .24, height * .09, bias * .83, rnd);
        }
      }
    }
  }

  const branchGeometry = new THREE.CylinderGeometry(.60, 1, 1, 7, 1).translate(0, .5, 0);
  const barkMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .96, envMapIntensity: .23 });
  const leafMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: .86, envMapIntensity: .27, side: THREE.DoubleSide,
  });
  function addMesh(name, geometry, material, pieces) {
    const mesh = new THREE.InstancedMesh(geometry, material, pieces.length);
    mesh.name = name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    for (const [index, [matrix, color]] of pieces.entries()) {
      mesh.setMatrixAt(index, matrix);
      mesh.setColorAt(index, color);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
    return mesh;
  }
  const branches = addMesh('Valley riparian trunks, roots and branches', branchGeometry, barkMaterial, woody);
  branches.userData.treeBases = bases;
  addMesh('Valley riparian leaf sprays', leafGeometry(THREE), leafMaterial, leaves);
  return { treeCount: bases.length, branchInstances: woody.length, leafInstances: leaves.length };
}
