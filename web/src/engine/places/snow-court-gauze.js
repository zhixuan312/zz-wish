export const snowCourtGauzeHoops = [.25, .50, .75];

export function addSnowCourtGauzeTransmission(shader, ribs, aged) {
  shader.vertexShader = 'varying vec2 vSnowGauze;\n' + shader.vertexShader.replace('#include <uv_vertex>',
    '#include <uv_vertex>\nvSnowGauze = uv;');
  shader.fragmentShader = `varying vec2 vSnowGauze;
    float snowGauzeBamboo() {
      float h = vSnowGauze.y;
      float ringDistance = min(abs(h - .25), min(abs(h - .50), abs(h - .75)));
      float verticalDistance = abs(fract(vSnowGauze.x * ${ribs.toFixed(1)} + .5) - .5);
      float hoop = 1. - smoothstep(.009, .024 + fwidth(h), ringDistance);
      float rib = 1. - smoothstep(.047, .103 + fwidth(vSnowGauze.x) * ${ribs.toFixed(1)}, verticalDistance);
      return max(hoop, rib * .60);
    }
    \n` + shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      float gauzeBamboo = snowGauzeBamboo();
      diffuseColor.rgb *= 1. - ${aged ? '.22' : '.13'} * gauzeBamboo;
      diffuseColor.a *= 1. - ${aged ? '.15' : '.08'} * smoothstep(.03, .88, 1. - abs(2. * vSnowGauze.y - 1.));
    `);
}
