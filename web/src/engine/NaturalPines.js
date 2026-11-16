// Open pine crowns built from woody branches and small needle sprays. All trees
// in a place share two instanced draws, rather than one draw per twig or card.
export function createPineBatch({ THREE, rnd = Math.random, material, needleTexture, group }) {
  const woody = [], sprays = [], Y = new THREE.Vector3(0, 1, 0);
  const bark = typeof material === 'function'
    ? material(0x645344, .95)
    : material ?? new THREE.MeshStandardMaterial({ color: 0x645344, roughness: .95 });
  const foliage = new THREE.MeshStandardMaterial({
    color: 0xffffff, map: needleTexture ?? null, alphaTest: .31,
    side: THREE.DoubleSide, roughness: .9, envMapIntensity: .3,
  });
  const twigGeo = new THREE.CylinderGeometry(.9, 1, 1, 10, 1).translate(0, .5, 0);
  // Texture grows from the bottom of the card along +Y, just as a real twig does.
  const needleGeo = new THREE.PlaneGeometry(1, 1).translate(0, .5, 0);
  const v = (x, y, z) => new THREE.Vector3(x, y, z);
  const matrix = new THREE.Matrix4(), quaternion = new THREE.Quaternion(), roll = new THREE.Quaternion();
  const widthTint = new THREE.Color(0xd5d8c5);
  let completed = null;

  function wood(a, b, radius, tint) {
    const delta = b.clone().sub(a), length = delta.length();
    if (length < .00001) return;
    quaternion.setFromUnitVectors(Y, delta.multiplyScalar(1 / length));
    matrix.compose(a, quaternion, v(radius, length, radius));
    woody.push([matrix.clone(), tint.clone()]);
  }

  function spray(a, direction, length, width, tint, angle) {
    quaternion.setFromUnitVectors(Y, direction);
    roll.setFromAxisAngle(Y, angle); quaternion.multiply(roll);
    matrix.compose(a, quaternion, v(width, length, 1));
    sprays.push([matrix.clone(), tint.clone()]);
  }

  function add(x, y, z, scale = 1, color = 0x42583c) {
    if (completed) throw new Error('Add pines before finishing the batch.');
    const s = scale, height = (6.7 + rnd() * .95) * s;
    const bendAngle = rnd() * Math.PI * 2, bend = (.12 + rnd() * .22) * s;
    const leanX = Math.cos(bendAngle) * bend, leanZ = Math.sin(bendAngle) * bend;
    const at = (fraction) => v(x + leanX * fraction * fraction, y + height * fraction, z + leanZ * fraction * fraction);
    const woodTint = new THREE.Color(0xe0d4c3).offsetHSL((rnd() - .5) * .025, 0, (rnd() - .5) * .09);
    // The supplied texture already carries green needles. A light tint preserves
    // their detail; multiplying it by a dark green again would make black blocks.
    const green = widthTint.clone().lerp(new THREE.Color(color), .18);
    const rootRadius = (.095 + rnd() * .035) * s;
    for (let i = 0; i < 9; i++) {
      const f = i / 9, radius = rootRadius * Math.pow(1 - f, .78) + .009 * s;
      wood(at(f), at((i + 1) / 9), radius, woodTint);
    }
    // A few visible roots and dead lower boughs keep the trunk from resembling a pole.
    for (let i = 0; i < 4; i++) {
      const angle = bendAngle + i * 1.6 + rnd() * .4;
      const root = v(x + Math.cos(angle) * .42 * s, y + .02 * s, z + Math.sin(angle) * .42 * s);
      wood(root, at(.025), rootRadius * .45, woodTint);
    }
    for (let i = 0; i < 2; i++) {
      const a = rnd() * Math.PI * 2, base = at(.22 + rnd() * .12);
      wood(base, base.clone().add(v(Math.cos(a) * .55 * s, -.1 * s, Math.sin(a) * .55 * s)), .018 * s, woodTint);
    }

    const tiers = 6 + Math.floor(rnd() * 2), rotation = rnd() * Math.PI * 2;
    for (let tier = 0; tier < tiers; tier++) {
      const f = tier / (tiers - 1), base = at(.35 + f * .55);
      const reach = (2.0 * Math.pow(1 - f, .7) + .18) * s;
      const count = 4 + Math.floor(rnd() * 2);
      for (let b = 0; b < count; b++) {
        // Missing boughs, alternating reach and non-aligned whorls leave sky
        // between the branches instead of forming a continuous cone or curtain.
        if (rnd() < .12 && tier < tiers - 1) continue;
        const angle = rotation + b / count * Math.PI * 2 + tier * 2.37 + (rnd() - .5) * .6;
        const radial = v(Math.cos(angle), 0, Math.sin(angle));
        const side = v(-radial.z, 0, radial.x), length = reach * (.63 + rnd() * .5);
        const joint = base.clone().addScaledVector(radial, length * .46).add(v(0, -.09 * s, 0));
        const outer = base.clone().addScaledVector(radial, length * .84).add(v(0, -.04 * s, 0));
        const tip = base.clone().addScaledVector(radial, length).add(v(0, (.12 + rnd() * .17) * s, 0));
        const thickness = (.029 * (1 - f) + .008) * s;
        wood(base, joint, thickness, woodTint);
        wood(joint, outer, thickness * .78, woodTint);
        wood(outer, tip, thickness * .5, woodTint);

        for (let t = 0; t < 3; t++) {
          const u = .48 + t * .2, sign = t % 2 ? -1 : 1;
          const start = base.clone().lerp(tip, u);
          const out = radial.clone().multiplyScalar(.45 + rnd() * .3)
            .addScaledVector(side, sign * (.4 + rnd() * .4)).add(v(0, .18 + rnd() * .28, 0)).normalize();
          const twigLength = (.3 + rnd() * .28) * s * (.65 + .35 * (1 - f));
          const end = start.clone().addScaledVector(out, twigLength);
          wood(start, end, (.007 + .004 * (1 - f)) * s, woodTint);
          const tint = green.clone().offsetHSL((rnd() - .5) * .025, (rnd() - .5) * .08, (rnd() - .5) * .08);
          const cardStart = start.clone().lerp(end, .15);
          const cardLength = twigLength * (1.05 + rnd() * .35), cardWidth = cardLength * (.48 + rnd() * .2);
          const twist = rnd() * Math.PI;
          spray(cardStart, out, cardLength, cardWidth, tint, twist);
          spray(cardStart.clone().addScaledVector(out, .035 * s), out, cardLength * .9, cardWidth, tint, twist + Math.PI * .52);
        }
      }
    }
    // The leader has a sparse upward spray rather than a solid geometric spike.
    const leader = at(.91), leaderDir = at(1).sub(leader).normalize();
    for (let k = 0; k < 3; k++) spray(leader, leaderDir, height * .105, height * .045, green, k * Math.PI / 3);
  }

  function finish() {
    if (completed) return completed;
    completed = [];
    for (const [geometry, mat, pieces, name] of [[twigGeo, bark, woody, 'pine trunks and boughs'], [needleGeo, foliage, sprays, 'pine needle sprays']]) {
      if (!pieces.length) continue;
      const mesh = new THREE.InstancedMesh(geometry, mat, pieces.length);
      mesh.name = name; mesh.castShadow = true; mesh.receiveShadow = true;
      pieces.forEach(([transform, tint], i) => { mesh.setMatrixAt(i, transform); mesh.setColorAt(i, tint); });
      mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingBox(); mesh.computeBoundingSphere();
      group.add(mesh); completed.push(mesh);
    }
    return completed;
  }

  return { add, finish };
}
