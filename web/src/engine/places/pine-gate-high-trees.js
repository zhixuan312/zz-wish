import * as THREE from 'three';
import { preparePineBaseCrowns } from './pine-base-crowns.js';

const primaryMounts = ['PineRidgeNative', 'PineYoungNative'];
const mountPrototypes = new Map([
  ...primaryMounts.map(node => [node, node]),
  ['PineShoulderNative', 'PineRidgeNative'],
]);

// A stable 32-bit hash of the mount's name, then yaw in [-12°, 12°] and scale in [0.85, 1.15].
// Math.random would make the forest differ between loads and between the two clients.
function jitterFor(seedText) {
  let hash = 2166136261;
  for (let index = 0; index < seedText.length; index++) {
    hash ^= seedText.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const unit = ((hash >>> 0) % 1000003) / 1000003;
  const unit2 = (((hash >>> 11) ^ (hash >>> 3)) >>> 0) % 1000003 / 1000003;
  return { yaw: (unit * 2 - 1) * (12 * Math.PI / 180), scale: .85 + unit2 * .30 };
}

function readMounts(group) {
  const mounts = JSON.parse(group.userData.one_light_pine_native_mounts ?? '[]');
  const nodes = new Set(Array.isArray(mounts) ? mounts.map(mount => mount?.node) : []);
  // A model may back several trees: the ridge prototype now plants four mounts. Require one mount per
  // authored label, and both valley prototypes present; do not require the nodes to be distinct.
  const labels = new Set(Array.isArray(mounts) ? mounts.map(mount => mount?.label ?? mount?.proxyMaterial) : []);
  if (!primaryMounts.every(node => nodes.has(node)) || !Array.isArray(mounts)
    || labels.size !== mounts.length || labels.has(undefined)) {
    throw new Error('Pine Gate needs one native mount per authored valley tree');
  }
  return mounts.map(mount => {
    const prototype = mountPrototypes.get(mount.node);
    if (!prototype || (mount.prototype ?? mount.node) !== prototype || mount.position?.length !== 3 || !mount.position.every(Number.isFinite)
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
    return { ...mount, prototype, proxies };
  });
}

function retainNeedleProfile(tree, needle, height) {
  let replaced = false;
  tree.traverse(mesh => {
    if (mesh.isMesh && [mesh.material].flat().every(material => material.name === 'PineNativeNeedles')) {
      mesh.visible = false;
      replaced = true;
    }
  });
  if (!replaced) throw new Error('Missing native needle layer: ' + tree.name);
  const crown = needle.clone();
  crown.scale.setScalar(height);
  tree.add(crown);
}

export function preparePineHighTrees(baked, file) {
  if (!file) return null;
  const mounts = readMounts(baked.group);
  const base = preparePineBaseCrowns(mounts, file);
  const group = new THREE.Group();
  group.name = 'Pine Gate native trees';
  let active = false, disposed = false, request;

  async function load(canInstall) {
    const detail = await baked.loadDetailModel(file.uri);
    if (!detail || disposed || !canInstall()) return false;

    const trees = mounts.map(mount => {
      const prototype = detail.getObjectByName(mount.prototype);
      if (!prototype) throw new Error('Missing native tree prototype: ' + mount.prototype);
      const box = new THREE.Box3().setFromObject(prototype);
      const height = box.max.y - box.min.y;
      if (!Number.isFinite(height) || height <= 0 || Math.abs(box.min.y) > .005) {
        throw new Error('Invalid native tree root or height: ' + mount.node);
      }
      // One clone per mount, sharing the prototype's geometry and materials. A deterministic per-tree
    // yaw and scale break the repeated silhouette without changing what loads: the seed is the mount's
    // own label, so every load draws the same forest.
    const jitter = jitterFor(mount.label ?? mount.node);
    const tree = prototype.clone();
      tree.name = mount.label ?? mount.node;
      tree.position.fromArray(mount.position);
      tree.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), mount.yawRadians + jitter.yaw);
      tree.scale.setScalar((mount.height / height) * jitter.scale);
      if (base) retainNeedleProfile(tree, base.needles.get(mount.label ?? mount.node), height);
      return tree;
    });
    group.add(...trees);
    for (const mount of mounts) for (const proxy of mount.proxies) proxy.visible = false;
    if (base) base.group.visible = false;
    active = true;
    return true;
  }

  return {
    group, base: base?.group,
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
      base?.restore();
    },
  };
}
