export function addSnowCourtGauzeTransmission(shader, ribs, aged) {
  shader.vertexShader = 'varying vec2 vSnowGauze;\n' + shader.vertexShader.replace('#include <uv_vertex>',
    '#include <uv_vertex>\nvSnowGauze = uv;');
  shader.fragmentShader = `varying vec2 vSnowGauze;
    float snowGauzeBamboo() {
      float h = vSnowGauze.y;
      float verticalDistance = abs(fract(vSnowGauze.x * ${ribs.toFixed(1)} + .5) - .5);
      float rib = 1. - smoothstep(.021, .087 + fwidth(vSnowGauze.x) * ${ribs.toFixed(1)}, verticalDistance);
      return rib * smoothstep(0., .09, h) * smoothstep(0., .09, 1. - h);
    }
    \n` + shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      float gauzeBamboo = snowGauzeBamboo();
      diffuseColor.rgb *= 1. - ${aged ? '.095' : '.065'} * gauzeBamboo;
      diffuseColor.a *= 1. - ${aged ? '.045' : '.055'} * sin(3.141593 * vSnowGauze.y);
    `);
}
