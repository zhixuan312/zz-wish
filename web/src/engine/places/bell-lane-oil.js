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

  // A flat pool and the part that rises against the clay share one dielectric surface.
  // The changing normals catch an arc of daylight along the contact line.
  const contactRadius = wellRadius - .0001;
  const oil = new THREE.Mesh(lathe([
    [contactRadius, .00056], [contactRadius - .00043, .00027],
    [contactRadius - .00098, .00010], [contactRadius - .00165, .00002],
    [contactRadius - .0023, 0], [0, 0],
  ], 40), new THREE.MeshPhysicalMaterial({ color: 0x735028, roughness: .075, ior: 1.46, envMapIntensity: .82 }));
  oil.name = 'Bell Lane remaining oil';
  oil.material.userData.lampOwned = true;
  // This cup faces the open door and reflects the actual sky of the active court.
  oil.material.userData.useSceneEnvironment = true;
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
    oil.scale.y = Math.min(1, 8 * fraction);
  }
  setFuelLevel(1);
  return { wickMesh, setFuelLevel };
}
