import * as THREE from 'three';

/**
 * Optional post-processing for the shader pack: bloom (bright-pass, two-tap separable blur at quarter
 * resolution) + vignette + colour temperature, composited in one fullscreen pass.
 *
 * Colour pipeline: while the post chain is active the scene is rendered into a linear 8-bit target. The
 * game's own shaders switch to linear output (LINEAR_OUT define) and three's built-in materials already
 * write linear values into render targets, so the composite pass is the single place that sRGB-encodes.
 */
export class PostFX {
  enabled = false;
  bloom = true;
  bloomStrength = 0.28; // balanced default: a glow around sun/lava/torches without haloing bright scenes
  vignette = true;
  colorTemp = 0; // -1 cool .. 1 warm
  private sceneRT: THREE.WebGLRenderTarget;
  private brightRT: THREE.WebGLRenderTarget;
  private blurRT: THREE.WebGLRenderTarget;
  private quad: THREE.Mesh;
  private cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private scene = new THREE.Scene();
  private brightMat: THREE.ShaderMaterial;
  private blurMat: THREE.ShaderMaterial;
  private compMat: THREE.ShaderMaterial;
  private w = 2; private h = 2;

  constructor(private renderer: THREE.WebGLRenderer) {
    const mk = (w: number, h: number, depth: boolean) => new THREE.WebGLRenderTarget(w, h, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: depth, stencilBuffer: false, type: THREE.UnsignedByteType, colorSpace: THREE.NoColorSpace });
    this.sceneRT = mk(2, 2, true);
    this.brightRT = mk(2, 2, false);
    this.blurRT = mk(2, 2, false);
    const VERT = /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
    this.brightMat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: /* glsl */ `
        uniform sampler2D tSrc; varying vec2 vUv;
        void main() {
          vec3 c = texture2D(tSrc, vUv).rgb;
          float l = dot(c, vec3(0.299, 0.587, 0.114));
          // soft knee above ~0.62 linear (~0.8 sRGB): sun, lava, torches, glowing ore, bright sky near the sun
          float k = smoothstep(0.62, 0.95, l);
          gl_FragColor = vec4(c * k, 1.0);
        }`,
      uniforms: { tSrc: { value: null } }, depthTest: false, depthWrite: false,
    });
    this.blurMat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: /* glsl */ `
        uniform sampler2D tSrc; uniform vec2 uDir; varying vec2 vUv;
        void main() {
          vec3 c = texture2D(tSrc, vUv).rgb * 0.227;
          c += (texture2D(tSrc, vUv + uDir * 1.385).rgb + texture2D(tSrc, vUv - uDir * 1.385).rgb) * 0.316;
          c += (texture2D(tSrc, vUv + uDir * 3.231).rgb + texture2D(tSrc, vUv - uDir * 3.231).rgb) * 0.070;
          gl_FragColor = vec4(c, 1.0);
        }`,
      uniforms: { tSrc: { value: null }, uDir: { value: new THREE.Vector2() } }, depthTest: false, depthWrite: false,
    });
    this.compMat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: /* glsl */ `
        uniform sampler2D tScene; uniform sampler2D tBloom; uniform float uBloom; uniform float uVignette; uniform float uTemp; varying vec2 vUv;
        void main() {
          vec3 c = texture2D(tScene, vUv).rgb;
          c += texture2D(tBloom, vUv).rgb * uBloom;
          // colour temperature: warm pushes red/yellow, cool pushes blue
          c *= vec3(1.0 + uTemp * 0.08, 1.0 + uTemp * 0.02, 1.0 - uTemp * 0.09);
          vec2 d = vUv - 0.5;
          float v = 1.0 - smoothstep(0.35, 0.95, dot(d, d) * 2.2) * uVignette;
          c *= v;
          gl_FragColor = vec4(pow(max(c, 0.0), vec3(1.0 / 2.2)), 1.0);
        }`,
      uniforms: { tScene: { value: null }, tBloom: { value: null }, uBloom: { value: 0.28 }, uVignette: { value: 0.24 }, uTemp: { value: 0 } }, depthTest: false, depthWrite: false,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.compMat);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
  }

  setSize(w: number, h: number): void {
    w = Math.max(2, w | 0); h = Math.max(2, h | 0);
    if (w === this.w && h === this.h) return;
    this.w = w; this.h = h;
    this.sceneRT.setSize(w, h);
    this.brightRT.setSize(Math.max(1, w >> 2), Math.max(1, h >> 2));
    this.blurRT.setSize(Math.max(1, w >> 2), Math.max(1, h >> 2));
  }

  render(scene: THREE.Scene, camera: THREE.Camera): void {
    const r = this.renderer;
    const size = r.getDrawingBufferSize(new THREE.Vector2());
    this.setSize(size.x, size.y);
    r.setRenderTarget(this.sceneRT);
    r.clear();
    r.render(scene, camera);
    let bloomTex: THREE.Texture | null = null;
    if (this.bloom) {
      const bw = this.brightRT.width, bh = this.brightRT.height;
      this.quad.material = this.brightMat;
      this.brightMat.uniforms.tSrc.value = this.sceneRT.texture;
      r.setRenderTarget(this.brightRT); r.render(this.scene, this.cam);
      this.quad.material = this.blurMat;
      this.blurMat.uniforms.tSrc.value = this.brightRT.texture; (this.blurMat.uniforms.uDir.value as THREE.Vector2).set(1 / bw, 0);
      r.setRenderTarget(this.blurRT); r.render(this.scene, this.cam);
      this.blurMat.uniforms.tSrc.value = this.blurRT.texture; (this.blurMat.uniforms.uDir.value as THREE.Vector2).set(0, 1 / bh);
      r.setRenderTarget(this.brightRT); r.render(this.scene, this.cam);
      bloomTex = this.brightRT.texture;
    }
    this.quad.material = this.compMat;
    this.compMat.uniforms.tScene.value = this.sceneRT.texture;
    this.compMat.uniforms.tBloom.value = bloomTex ?? this.blurRT.texture;
    this.compMat.uniforms.uBloom.value = bloomTex ? this.bloomStrength : 0;
    this.compMat.uniforms.uVignette.value = this.vignette ? 0.24 : 0;
    this.compMat.uniforms.uTemp.value = this.colorTemp;
    r.setRenderTarget(null);
    r.render(this.scene, this.cam);
  }

  dispose(): void {
    this.sceneRT.dispose(); this.brightRT.dispose(); this.blurRT.dispose();
    this.brightMat.dispose(); this.blurMat.dispose(); this.compMat.dispose(); this.quad.geometry.dispose();
  }
}
