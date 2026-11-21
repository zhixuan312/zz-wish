// The visitor's shallow, straight-sided oil well keeps the surface visible at the seated angle.
// Its outer wall, foot and rim follow the lattice lantern's original clay cup.
export function addBellLaneOilCup({ THREE, lathe }, group, clay, baseY) {
  const floor = baseY + .0292;
  const full = baseY + .031;
  const wellRadius = .0195;
  const cup = new THREE.Mesh(lathe([
    [0, baseY + .010], [.022, baseY + .010], [.024, baseY + .030], [.020, baseY + .032],
    [wellRadius, full], [wellRadius, floor], [0, floor],
  ], 32), clay);
  cup.name = 'Bell Lane visitor oil cup';
  cup.castShadow = cup.receiveShadow = true;

  const oil = new THREE.Mesh(new THREE.CircleGeometry(wellRadius - .0001, 32).rotateX(-Math.PI / 2),
    new THREE.MeshPhysicalMaterial({ color: 0x8e5c2b, roughness: .13, clearcoat: .8, clearcoatRoughness: .1,
      ior: 1.46, envMapIntensity: 1.2 }));
  oil.name = 'Bell Lane remaining oil';
  oil.material.userData.lampOwned = true;
  oil.receiveShadow = true;

  // The wick reaches the clay floor while retaining the original tip and flame anchor.
  const wickTip = baseY + .040;
  const wickMesh = new THREE.Mesh(new THREE.CylinderGeometry(.0008, .001, wickTip - floor, 8),
    new THREE.MeshStandardMaterial({ color: 0x15100c, roughness: 1 }));
  wickMesh.name = 'Bell Lane visitor wick';
  wickMesh.material.userData.lampOwned = true;
  wickMesh.position.set(.0007, (floor + wickTip) / 2, 0);
  group.add(cup, oil, wickMesh);

  function setFuelLevel(fraction) {
    // Volume and height are proportional in this well. At zero the clay is exposed.
    oil.visible = fraction > 0;
    oil.position.y = THREE.MathUtils.lerp(floor, full, fraction);
  }
  setFuelLevel(1);
  return { wickMesh, setFuelLevel };
}
