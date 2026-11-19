import * as THREE from 'three';

const prototypes = new Set(['PineRidgeNative', 'PineYoungNative']);

function readMounts(group) {
  const mounts = JSON.parse(group.userData.one_light_pine_native_mounts ?? '[]');
  if (!Array.isArray(mounts) || mounts.length !== prototypes.size || new Set(mounts.map(mount => mount.node)).size !== prototypes.size) {
    throw new Error('Pine Gate needs two distinct native tree mounts');
  }
  return mounts.map(mount => {
    if (!prototypes.has(mount.node) || mount.position?.length !== 3 || !mount.position.every(Number.isFinite)
      || !Number.isFinite(mount.height) || mount.height <= 0 || !Number.isFinite(mount.yawRadians)
      || typeof mount.proxyMaterial !== 'string' || (mount.stemMaterial != null && typeof mount.stemMaterial !== 'string')) {
      throw new Error('Invalid Pine Gate native tree mount');
    }
    const names = new Set([mount.proxyMaterial, mount.stemMaterial].filter(Boolean));
    const proxies = [];
    group.traverse(object => {
      const materials = [object.material].flat();
      if (object.isMesh && materials.every(material => names.has(material.name))) proxies.push(object);
    });
    if (!proxies.length || ![...names].every(name => proxies.some(proxy => [proxy.material].flat().some(material => material.name === name)))) {
      throw new Error('Missing Pine Gate native tree fallback');
    }
    return { ...mount, proxies };
  });
}

export function preparePineHighTrees(baked, file) {
  if (!file) return null;
  const mounts = readMounts(baked.group);
  const group = new THREE.Group();
  group.name = 'Pine Gate native trees';
  let active = false, disposed = false, request;

  async function load(canInstall) {
    const detail = await baked.loadDetailModel(file.uri);
    if (!detail || disposed || !canInstall()) return false;

    const trees = mounts.map(mount => {
      const tree = detail.getObjectByName(mount.node);
      if (!tree) throw new Error('Missing native tree prototype: ' + mount.node);
      const box = new THREE.Box3().setFromObject(tree);
      const height = box.max.y - box.min.y;
      if (!Number.isFinite(height) || height <= 0 || Math.abs(box.min.y) > .005) {
        throw new Error('Invalid native tree root or height: ' + mount.node);
      }
      tree.position.fromArray(mount.position);
      tree.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), mount.yawRadians);
      tree.scale.setScalar(mount.height / height);
      return tree;
    });
    group.add(...trees);
    for (const mount of mounts) for (const proxy of mount.proxies) proxy.visible = false;
    active = true;
    return true;
  }

  return {
    group,
    start(canInstall) {
      if (disposed || active) return;
      if (!request) request = load(canInstall).catch(() => false).finally(() => { request = null; });
      return request;
    },
    dispose() {
      disposed = true;
      group.removeFromParent();
      group.clear();
      if (active) for (const mount of mounts) for (const proxy of mount.proxies) proxy.visible = true;
    },
  };
}
