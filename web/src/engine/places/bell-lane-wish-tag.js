// A visitor lifts the blank-backed tag off the lantern tray and draws its cord around the front post.
export function addBellLaneWishTag({ THREE, grainTex }, lamp) {
  const { Vector3, MathUtils } = THREE;
  const rig = new THREE.Group();
  rig.name = 'Bell Lane wish tag rig';
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
  const wood = new THREE.MeshStandardMaterial({ color: 0xc39a68, roughness: .91, map: grainTex });
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
  const anchor = new Vector3(.11, .479, -.11);
  const knot = new THREE.Group();
  knot.name = 'Bell Lane wish tag knot';
  knot.position.copy(anchor);
  const wrap = new THREE.Mesh(new THREE.TorusGeometry(.0175, .0023, 6, 24).rotateX(Math.PI / 2), hemp);
  const hitch = new THREE.Mesh(new THREE.SphereGeometry(.0047, 8, 6), hemp);
  hitch.position.set(.003, .001, -.018);
  knot.add(wrap, hitch);
  cord.add(knot);

  const rest = new Vector3(.080, .513, -.059);
  const lift = new Vector3(.118, .554, -.162);
  const hanging = new Vector3(.112, .453, -.159);
  const up = new Vector3(0, 1, 0), direction = new Vector3();
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
    tag.rotation.set(-(1 - raised) * Math.PI / 2, -.08 * raised, -.12 * lowered);
    knot.visible = progress >= .76;
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? -1 : 1;
      hole.set(.0018 * side, .032, 0).applyQuaternion(tag.quaternion).add(tag.position);
      tail.set(.014 * side, .062, .001).applyQuaternion(tag.quaternion).add(tag.position);
      fixed.set(anchor.x + .005 * side, anchor.y + .001, anchor.z - .017);
      tail.lerp(fixed, tighten);
      bend.copy(hole).lerp(tail, .55);
      bend.x += .007 * side * (1 - tighten);
      bend.y += .009 * raised * (1 - tighten);
      connect(ends[i * 2], hole, bend);
      connect(ends[i * 2 + 1], bend, tail);
    }
  }

  setProgress(0);
  return { setProgress };
}
