// A visitor lifts the tag off the tray and ties its cord to the shade's front corner.
export function addBellLaneWishTag({ THREE, grainTex }, lamp, post, { side: sideOfPost = 1, saved = false } = {}) {
  const { Vector3, MathUtils } = THREE;
  const rig = new THREE.Group();
  rig.name = 'Bell Lane wish tag rig';
  // The lattice has another matching front corner. Reflect the entire tie,
  // including its knot and eyelet, so the cord still wraps the physical post.
  rig.scale.x = sideOfPost;
  lamp.add(rig);

  const profile = new THREE.Shape();
  profile.moveTo(-.022, -.042);
  profile.lineTo(-.022, .037);
  profile.lineTo(-.016, .045);
  profile.lineTo(.016, .045);
  profile.lineTo(.022, .037);
  profile.lineTo(.022, -.042);
  profile.lineTo(.019, -.045);
  profile.lineTo(-.019, -.045);
  profile.closePath();
  const eyelet = new THREE.Path();
  eyelet.absarc(0, .032, .0039, 0, -2 * Math.PI, true);
  profile.holes.push(eyelet);
  const board = new THREE.ExtrudeGeometry(profile, { depth: .004, bevelEnabled: false, curveSegments: 10 });
  board.translate(0, 0, -.002);
  const uv = board.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / .044 + .5, uv.getY(i) / .09 + .5);
  const wood = new THREE.MeshStandardMaterial({
    color: saved ? 0xd7b783 : 0xc39a68, roughness: saved ? .85 : .91, map: grainTex,
  });
  const hemp = new THREE.MeshStandardMaterial({ color: 0x9f8053, roughness: .96 });
  wood.userData.lampOwned = hemp.userData.lampOwned = true;
  const tag = new THREE.Mesh(board, wood);
  tag.name = 'Bell Lane visitor tag';
  tag.castShadow = tag.receiveShadow = true;
  rig.add(tag);

  const cord = new THREE.Group();
  cord.name = 'Bell Lane wish tag cord';
  rig.add(cord);
  const strand = new THREE.CylinderGeometry(.0022, .0022, 1, 7);
  const ends = Array.from({ length: 4 }, () => {
    const piece = new THREE.Mesh(strand, hemp);
    cord.add(piece);
    return piece;
  });
  const { path, tubularSegments, radius } = post.geometry.parameters;
  post.updateMatrix();
  // Use an actual tube section. Choose one close to the cup, outside the flame column,
  // even when a drawn shade is much taller or narrower than a preset.
  const sections = Array.from({ length: tubularSegments - 1 }, (_, i) => {
    const index = i + 1;
    return { index, point: path.getPointAt(index / tubularSegments).applyMatrix4(post.matrix) };
  });
  const clear = sections.filter(({ point }) =>
    Math.hypot(point.x, point.y - MathUtils.clamp(point.y, .536, .576), point.z) >= .028);
  const { index: section, point: anchor } = (clear.length ? clear : sections).reduce((best, candidate) =>
    Math.abs(candidate.point.y - .565) < Math.abs(best.point.y - .565) ? candidate : best);
  const tangent = post.geometry.tangents[section].clone().transformDirection(post.matrix);
  const up = new Vector3(0, 1, 0);
  const wrapRadius = radius + .0021;
  const knot = new THREE.Group();
  knot.name = 'Bell Lane wish tag knot';
  knot.position.copy(anchor);
  knot.quaternion.setFromUnitVectors(up, tangent);
  const wrap = new THREE.Mesh(new THREE.TorusGeometry(wrapRadius, .0022, 6, 24).rotateX(Math.PI / 2), hemp);
  const hitch = new THREE.Mesh(new THREE.SphereGeometry(.0042, 8, 6), hemp);
  hitch.position.set(.001, 0, -wrapRadius);
  knot.add(wrap, hitch);
  cord.add(knot);

  const rest = new Vector3(.080, .513, -.059);
  const hanging = anchor.clone().add(new Vector3(.046, -.055, -.037));
  hanging.z = Math.min(hanging.z, -.144);
  if (saved) {
    hanging.x = .117;
    hanging.y += .012;
  }
  const faceYaw = saved ? .24 * sideOfPost : -.08;
  const lift = hanging.clone().add(new Vector3(0, .072, -.012));
  const direction = new Vector3();
  const hole = new Vector3(), bend = new Vector3(), tail = new Vector3(), fixed = new Vector3();
  function connect(mesh, a, b) {
    direction.subVectors(b, a);
    mesh.position.copy(a).lerp(b, .5);
    mesh.scale.y = direction.length();
    mesh.quaternion.setFromUnitVectors(up, direction.normalize());
  }

  function setProgress(value) {
    const progress = MathUtils.clamp(value, 0, 1);
    if (rig.userData.progress === progress) return;
    rig.userData.progress = progress;
    rig.userData.state = progress === 0 ? 'loose' : progress === 1 ? 'tied' : 'tying';
    const raised = MathUtils.smoothstep(progress, 0, .51);
    const lowered = MathUtils.smoothstep(progress, .51, 1);
    const tighten = MathUtils.smoothstep(progress, .48, .93);
    tag.position.copy(rest).lerp(lift, raised).lerp(hanging, lowered);
    tag.rotation.set(-(1 - raised) * Math.PI / 2, faceYaw * raised, -.12 * lowered);
    knot.visible = progress >= .76;
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? -1 : 1;
      hole.set(.0018 * side, .032, 0).applyQuaternion(tag.quaternion).add(tag.position);
      tail.set(.014 * side, .062, .001).applyQuaternion(tag.quaternion).add(tag.position);
      fixed.set(.003 * side, 0, -Math.sqrt(wrapRadius ** 2 - .003 ** 2)).applyQuaternion(knot.quaternion).add(anchor);
      tail.lerp(fixed, tighten);
      bend.copy(hole).lerp(tail, .55);
      bend.x += .007 * side * (1 - tighten);
      bend.y += .009 * raised * (1 - tighten);
      if (hole.y < .513) {
        // A short shade can leave the eye below the tray. Lead the cord over its lip.
        bend.y = MathUtils.lerp(bend.y, Math.max(bend.y, .515), tighten);
        bend.z = MathUtils.lerp(bend.z, Math.min(bend.z, -.134), tighten);
      }
      connect(ends[i * 2], hole, bend);
      connect(ends[i * 2 + 1], bend, tail);
    }
  }

  setProgress(0);
  return { setProgress };
}
