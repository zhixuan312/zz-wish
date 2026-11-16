import { WebGLRenderTarget, ShaderMaterial, Vector2 } from 'three';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';

// A downsampled separable Gaussian avoids sparse, repeated images of tiny flames.
export class FocusBlur extends Pass {
  constructor() {
    super();
    this.a = new WebGLRenderTarget(1, 1); this.b = new WebGLRenderTarget(1, 1);
    this.material = new ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, step: { value: new Vector2() }, sourcePixel: { value: new Vector2() }, downsample: { value: false } },
      vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: `varying vec2 vUv; uniform sampler2D tDiffuse; uniform vec2 step,sourcePixel; uniform bool downsample;
      void main(){
        vec4 sum=vec4(0.); float weight=0.;
        if(downsample){
          for(int x=-1;x<=1;x++)for(int y=-1;y<=1;y++)sum+=texture2D(tDiffuse,vUv+vec2(float(x),float(y))*sourcePixel*1.5);
          gl_FragColor=sum/9.;
        }else{
          for(int i=-8;i<=8;i++){float w=exp(-float(i*i)/18.);sum+=texture2D(tDiffuse,vUv+float(i)*step)*w;weight+=w;}
          gl_FragColor=sum/weight;
        }
      }`,
      depthTest: false, depthWrite: false,
    });
    this.quad = new FullScreenQuad(this.material);
    // 1 = the full blur; less keeps the place around the lamp readable.
    this.amount = 1;
  }
  setSize(width, height) {
    this.a.setSize(Math.max(1, Math.ceil(width / 4)), Math.max(1, Math.ceil(height / 4)));
    this.b.setSize(this.a.width, this.a.height);
    this.material.uniforms.sourcePixel.value.set(1 / width, 1 / height);
  }
  render(renderer, write, read) {
    const u = this.material.uniforms;
    u.downsample.value = true; u.tDiffuse.value = read.texture;
    renderer.setRenderTarget(this.a); this.quad.render(renderer);
    u.downsample.value = false; u.tDiffuse.value = this.a.texture; u.step.value.set(this.amount / this.a.width, 0);
    renderer.setRenderTarget(this.b); this.quad.render(renderer);
    u.tDiffuse.value = this.b.texture; u.step.value.set(0, this.amount / this.b.height);
    renderer.setRenderTarget(this.renderToScreen ? null : write); this.quad.render(renderer);
  }
  dispose() { this.a.dispose(); this.b.dispose(); this.material.dispose(); this.quad.dispose(); }
}
