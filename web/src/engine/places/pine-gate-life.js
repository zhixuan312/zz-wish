// Pine Gate living atmosphere. Stage 1: wind in the pine sprays and undergrowth.
// Everything is procedural; no image or model asset is added.
//
// The place API does not hand a camera to a place, so the camera is read from the
// sky sphere the engine pins to it every frame, and power saver from the renderer's
// shadow-map flag, which the engine clears only in that mode.

const WIND_MATERIALS = ['Open pine needle sprays', ...[0, 1, 2, 3, 4].map((i) => `Woodland understory ${i}`)];

export function createPineGateLife({ THREE, group, scene, renderer }) {
  if (!THREE || !group) throw new Error('Pine Gate life needs THREE and the baked group.');
  const disposers = [];
  const own = (fn) => disposers.push(fn);
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- Wind ----------
  // Two sine layers whose phase comes from world position, under a slow gust
  // envelope. The lift term keeps each spray anchored at its root, so nothing
  // slides across the lightmap; bark, stone and ground are never touched.
  const windUniforms = [];
  const touched = [];
  group.traverse((object) => {
    if (!object.isMesh) return;
    for (const material of [object.material].flat()) {
      if (!material || !WIND_MATERIALS.includes(material.name) || material.userData.pineWind) continue;
      material.userData.pineWind = true;
      const uniforms = { uPineTime: { value: 0 }, uPineGust: { value: 0 }, uPineAmp: { value: 0.028 } };
      const compile = material.onBeforeCompile, key = material.customProgramCacheKey.bind(material);
      material.onBeforeCompile = (shader, renderer2) => {
        compile.call(material, shader, renderer2);
        Object.assign(shader.uniforms, uniforms);
        shader.vertexShader = 'uniform float uPineTime,uPineGust,uPineAmp;\n' + shader.vertexShader.replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          {
            vec3 wp=(modelMatrix*vec4(transformed,1.)).xyz;
            float phase=wp.x*.37+wp.z*.29+wp.y*.11;
            float a=sin(uPineTime*1.15+phase)*.6+sin(uPineTime*2.7+phase*1.7)*.4;
            float b=sin(uPineTime*.43+phase*.6);
            float lift=smoothstep(.15,2.4,wp.y);
            float amp=uPineAmp*(.35+.65*lift)*(1.+uPineGust*1.8);
            transformed.x+=a*amp;
            transformed.z+=b*amp*.55;
          }`);
      };
      material.customProgramCacheKey = () => key() + '-pine-wind-1';
      material.needsUpdate = true;
      windUniforms.push(uniforms);
      touched.push(material);
    }
  });
  // Restore the original shader hooks when the place is released.
  own(() => { for (const material of touched) { material.userData.pineWind = false; material.needsUpdate = true; } });

  let sky = null, elapsed = 0, disposed = false;
  const cameraAt = new THREE.Vector3(0, 0, 34);

  return {
    update(dt, time) {
      if (disposed) return;
      if (!sky && scene) sky = scene.children.find((o) => o.material?.uniforms?.uHorizon) ?? null;
      if (sky) cameraAt.copy(sky.position);
      const still = reduced();
      const saver = !!renderer && renderer.shadowMap?.enabled === false;
      elapsed += dt;
      // A gust every eleven seconds or so, easing in and out rather than switching.
      const gust = Math.pow(0.5 + 0.5 * Math.sin(elapsed * 0.57) * Math.sin(elapsed * 0.23 + 1.1), 3);
      for (const u of windUniforms) {
        u.uPineTime.value = still || saver ? 0 : time;
        u.uPineGust.value = still || saver ? 0 : gust;
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const dispose of disposers.splice(0)) { try { dispose(); } catch { /* already released */ } }
    },
    // Exposed for the capture harness and for diagnostics, not used by the engine.
    describe: () => ({ windMaterials: windUniforms.length, cameraProxy: sky ? 'sky' : 'fallback' }),
  };
}
