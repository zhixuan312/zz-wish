const unit = value => Math.min(1, Math.max(0, value));
const smooth = value => value * value * (3 - 2 * value);

export function bambooOilFillFrame(progress) {
  const pour = unit((progress - .18) / .64);
  return {
    amount: smooth(pour),
    reach: smooth(unit(progress / .18)) * smooth(unit((1 - progress) / .18)),
    flow: Math.sin(Math.PI * pour),
  };
}

// The dipper enters along the shelf. Its lip and the falling stream line up
// over the cup as the level rises. The surrounding shelf receives no spill.
export function bambooOilFill(THREE) {
  const surface = new THREE.MeshPhysicalMaterial({
    color: 0x98602a, roughness: .12, clearcoat: 1, clearcoatRoughness: .035, envMapIntensity: .9,
  });
  return {
    seconds: 3.1,
    hold: .7,
    surface,
    frame: bambooOilFillFrame,
    create(parent, rimY) {
      const group = new THREE.Group();
      group.name = 'Bamboo oil dipper';
      parent.add(group);
      const dipper = new THREE.Group();
      group.add(dipper);
      const bronze = new THREE.MeshStandardMaterial({ color: 0x765339, roughness: .46, metalness: .58, side: THREE.DoubleSide });
      const wood = new THREE.MeshStandardMaterial({ color: 0x624834, roughness: .83 });
      const syrup = new THREE.MeshPhysicalMaterial({
        color: 0xb5772d, roughness: .2, clearcoat: 1, emissive: 0x322009, emissiveIntensity: .32,
      });
      const reflection = new THREE.MeshBasicMaterial({ color: 0xffc576, transparent: true, opacity: 0, depthWrite: false });
      const bowlProfile = [[0, 0], [.011, .001], [.019, .006], [.024, .015], [.023, .016], [.018, .009], [.01, .004], [0, .003]];
      const bowl = new THREE.Mesh(new THREE.LatheGeometry(bowlProfile.map(([r, y]) => new THREE.Vector2(r, y)), 28), bronze);
      bowl.position.set(0, 0, .024);
      bowl.rotation.x = -.18;
      dipper.add(bowl);
      const handle = new THREE.Mesh(new THREE.CylinderGeometry(.003, .0045, .36, 10), wood);
      handle.rotation.x = Math.PI * .54;
      handle.position.set(0, .047, .219);
      dipper.add(handle);
      const stream = new THREE.Mesh(new THREE.CylinderGeometry(1, .63, 1, 10), syrup);
      stream.name = 'Bamboo oil stream';
      group.add(stream);
      const ripple = new THREE.Mesh(new THREE.RingGeometry(.86, 1, 28).rotateX(-Math.PI / 2), reflection);
      ripple.name = 'Bamboo oil ripple';
      group.add(ripple);
      group.visible = false;

      return {
        update(progress, { reach, flow }, oilY, oilRadius) {
          group.visible = reach > .005;
          const lipY = rimY + .069 + (1 - reach) * .10;
          dipper.position.set(0, lipY - .014, (1 - reach) * .29);
          stream.visible = flow > .03;
          const length = Math.max(.001, lipY - oilY);
          stream.position.set(0, oilY + length / 2, 0);
          const width = .0014 + .0014 * flow;
          stream.scale.set(width, length, width);
          const wave = progress * 6 % 1;
          ripple.visible = stream.visible && oilRadius > .003;
          ripple.position.y = oilY + .00045;
          ripple.scale.setScalar(Math.min(.011, oilRadius * .76) * (.22 + .78 * wave));
          reflection.opacity = flow * (1 - wave) * .55;
        },
        dispose() {
          group.removeFromParent();
          for (const mesh of [bowl, handle, stream, ripple]) mesh.geometry.dispose();
          for (const material of [bronze, wood, syrup, reflection]) material.dispose();
        },
      };
    },
  };
}
