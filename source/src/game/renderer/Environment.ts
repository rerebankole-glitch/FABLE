import * as THREE from 'three';
import { SKY_FRAG, SKY_VERT } from './Shaders';
import { getAtlas } from '../blocks/TextureAtlas';
import { ATLAS_COLS, ATLAS_ROWS, T } from '../blocks/Tiles';
import { mulberry32 } from '../world/Noise';

export type WeatherKind = 'clear' | 'rain' | 'storm';

const WHITE = new THREE.Color(1, 1, 1);
const VOID_FOG: [number, number, number] = [0.35, 0.08, 0.1];

/** Vertex-shader patch: draw at the far plane (behind everything, never frustum-clipped by camera.far). */
const pinToFarPlane = (shader: { vertexShader: string }) => {
  shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n\tgl_Position.z = gl_Position.w * 0.99998;');
};

/**
 * Sky dome, sun / moon / stars, clouds, precipitation and fog colour.
 * All objects live in `group`; the game adds it to the scene once.
 * Day time is in ticks 0..24000 (0 = sunrise, 6000 = noon, 12000 = sunset, 18000 = midnight).
 */
export class Environment {
  group = new THREE.Group();
  skyMesh: THREE.Mesh;
  skyMat: THREE.ShaderMaterial;
  sun: THREE.Mesh;
  moon: THREE.Mesh;
  stars: THREE.Points;
  clouds: THREE.Mesh;
  rain: THREE.LineSegments;
  private rainSeg: Float32Array;
  private celestial = new THREE.Group();
  private rainPositions: Float32Array;
  private rainVel: Float32Array;

  // ---- inputs set by the game every frame
  weather: WeatherKind = 'clear';
  cold = false;
  underwater = false;
  biomeFog: [number, number, number] | null = null;

  // ---- outputs
  daylight = 1;
  fogColor = new THREE.Color(0xc0d8ff);
  skyTint = new THREE.Color(0xc0d8ff);
  /** Colour of sunlight reaching sky-lit block faces: white at noon, orange at sunrise/sunset, blue-grey at night. */
  sunTint = new THREE.Color(1, 1, 1);
  private cNoonLight = new THREE.Color(1, 1, 1);
  private cSunsetLight = new THREE.Color(1.0, 0.78, 0.6);
  private cNightLight = new THREE.Color(0.6, 0.68, 0.95);
  private cRainLight = new THREE.Color(0.8, 0.82, 0.88);
  weatherIntensity = 0;
  private cWaterDeep = new THREE.Color(0x1d4f8a);
  /** Video setting: draw rain / snow particles (the sky still darkens during storms). */
  renderPrecipitation = true;
  lightningFlash = 0;
  sunDir = new THREE.Vector3(0, 1, 0);
  /** shader-pack sun halo strength for the sky dome (0 = off) */
  skyGlow = 0;
  /**
   * True while PostFX composites: the sky then writes LINEAR colour and the composite pass does the
   * single sRGB encode. Set alongside the chunk materials so sky and terrain never disagree about
   * the colour space -- if only one of them encoded, the horizon would not match the ground.
   */
  private linearOut = false;
  /** Drive the sky's colour space from the same predicate that enables PostFX (see Settings.postFxActive). */
  setLinearOut(v: boolean): void { this.linearOut = v; }
  /** cloud layer height in blocks (settings) */
  cloudHeight = 150;

  private cDaySky = new THREE.Color(0x78a7ff);
  private cDayHorizon = new THREE.Color(0xc0d8ff);
  private cNightSky = new THREE.Color(0x02030a);
  private cNightHorizon = new THREE.Color(0x0a1020);
  private cSunset = new THREE.Color(0xff8c4a);
  private cRainSky = new THREE.Color(0x4a5566);
  private cRainHorizon = new THREE.Color(0x6a7482);
  private cVoidSky = new THREE.Color(0x0b0512);
  private cVoidHorizon = new THREE.Color(0x2a1245);
  private cWater = new THREE.Color(0x0c2f5c);
  private tmpA = new THREE.Color();
  private tmpB = new THREE.Color();
  private tmpC = new THREE.Color();
  private cloudDrift = 0;
  private isVoid = false;
  private farPlane = 296;
  /** Constant scene lights: entities scale their own material colour by block/sky light, so these stay fixed. */
  ambient = new THREE.AmbientLight(0xffffff, 2.6);
  sunLight = new THREE.DirectionalLight(0xffffff, 1.0);
  private cloudFade = { value: 200 };

  constructor() {
    this.sunLight.position.set(0.4, 1, 0.25);
    this.group.add(this.ambient, this.sunLight, this.sunLight.target);
    this.skyMat = new THREE.ShaderMaterial({
      vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        uTop: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uSunset: { value: new THREE.Color() },
        uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uMoonDir: { value: new THREE.Vector3(0, -1, 0) }, uSunsetAmount: { value: 0 }, uVoid: { value: 0 }, uGlow: { value: 0 }, uNight: { value: 0 },
      },
    });
    this.skyMat.defines = {};
    this.skyMesh = new THREE.Mesh(new THREE.SphereGeometry(500, 24, 12), this.skyMat);
    this.skyMesh.renderOrder = -10;
    this.skyMesh.frustumCulled = false;
    this.group.add(this.skyMesh);

    const atlas = getAtlas();
    const mkCel = (tile: number, size: number, additive: boolean) => {
      const col = tile % ATLAS_COLS, row = Math.floor(tile / ATLAS_COLS);
      const g = new THREE.PlaneGeometry(size, size);
      const uv = g.attributes.uv as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (col + uv.getX(i)) / ATLAS_COLS, (row + (1 - uv.getY(i))) / ATLAS_ROWS);
      const m = new THREE.MeshBasicMaterial({ map: atlas.texture, transparent: true, depthWrite: false, fog: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
      m.onBeforeCompile = pinToFarPlane;
      const mesh = new THREE.Mesh(g, m);
      mesh.renderOrder = -9;
      mesh.frustumCulled = false;
      return mesh;
    };
    this.sun = mkCel(T.sun, 60, true);
    this.moon = mkCel(T.moon, 38, false);
    this.celestial.add(this.sun, this.moon);

    const rnd = mulberry32(1234);
    const n = 900;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3(rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1).normalize().multiplyScalar(420);
      pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false });
    starMat.onBeforeCompile = pinToFarPlane;
    this.stars = new THREE.Points(sg, starMat);
    this.stars.renderOrder = -9;
    this.stars.frustumCulled = false;
    this.celestial.add(this.stars);
    this.celestial.frustumCulled = false;
    this.group.add(this.celestial);

    // clouds: a big textured plane generated procedurally
    const cw = 64;
    const cdata = new Uint8Array(cw * cw * 4);
    const crnd = mulberry32(99);
    const noise = new Float32Array(cw * cw);
    for (let i = 0; i < noise.length; i++) noise[i] = crnd();
    for (let i = 0; i < cw * cw; i++) {
      const x = i % cw, y = Math.floor(i / cw);
      let s = 0;
      for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) s += noise[((y + dy + cw) % cw) * cw + ((x + dx + cw) % cw)];
      const v = s / 25 > 0.52 ? 255 : 0;
      cdata[i * 4] = 255; cdata[i * 4 + 1] = 255; cdata[i * 4 + 2] = 255; cdata[i * 4 + 3] = v;
    }
    const ctex = new THREE.DataTexture(cdata, cw, cw, THREE.RGBAFormat);
    ctex.magFilter = THREE.NearestFilter; ctex.minFilter = THREE.NearestFilter;
    ctex.wrapS = ctex.wrapT = THREE.RepeatWrapping;
    ctex.repeat.set(4, 4);
    ctex.needsUpdate = true;
    const cg = new THREE.PlaneGeometry(2048, 2048);
    cg.rotateX(-Math.PI / 2);
    const cloudMat = new THREE.MeshBasicMaterial({ map: ctex, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide, fog: false });
    // fade the clouds out towards the far plane instead of clipping them hard
    cloudMat.onBeforeCompile = (shader) => {
      shader.uniforms.uCloudFade = this.cloudFade;
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying float vCloudDist;').replace('#include <project_vertex>', '#include <project_vertex>\n\tvCloudDist = length(mvPosition.xyz);');
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uCloudFade;\nvarying float vCloudDist;').replace('#include <dithering_fragment>', '#include <dithering_fragment>\n\tgl_FragColor.a *= 1.0 - smoothstep(uCloudFade * 0.55, uCloudFade, vCloudDist);');
    };
    this.clouds = new THREE.Mesh(cg, cloudMat);
    this.clouds.position.y = 150;
    this.clouds.renderOrder = -8;
    this.clouds.frustumCulled = false;
    this.group.add(this.clouds);

    // rain: drawn as short vertical streaks (line segments); snow reuses the same buffer with short segments
    const rn = 1400;
    this.rainPositions = new Float32Array(rn * 3);
    this.rainVel = new Float32Array(rn);
    this.rainSeg = new Float32Array(rn * 6);
    for (let i = 0; i < rn; i++) {
      this.rainPositions[i * 3] = (Math.random() - 0.5) * 40;
      this.rainPositions[i * 3 + 1] = Math.random() * 30;
      this.rainPositions[i * 3 + 2] = (Math.random() - 0.5) * 40;
      this.rainVel[i] = 14 + Math.random() * 6;
    }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.BufferAttribute(this.rainSeg, 3));
    this.rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: 0x9fb8ff, transparent: true, opacity: 0, depthWrite: false }));
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    this.group.add(this.rain);
  }

  flashLightning(): void { this.lightningFlash = 1; }

  /** [near, far] fog distances for a render distance in chunks. */
  fogRange(renderDistance: number): [number, number] {
    this.farPlane = renderDistance * 16 + 200; // mirrors Game.applySettings camera.far
    const far = renderDistance * 16;
    let near = far * 0.62, f = far * 0.96;
    if (this.weatherIntensity > 0) { near *= 1 - this.weatherIntensity * 0.45; f *= 1 - this.weatherIntensity * 0.3; }
    if (this.isVoid) { near = far * 0.35; f = far * 0.9; }
    if (this.underwater) { near = 3; f = 22 + this.daylight * 10; }
    return [Math.max(2, near), Math.max(6, f)];
  }

  /**
   * @param dt seconds
   * @param dayTime ticks 0..24000
   * @param camPos camera position (sky follows it)
   * @param getTop terrain height lookup (used to keep rain above ground)
   * @param clouds whether to draw clouds (also implies "overworld" visuals)
   */
  update(dt: number, dayTime: number, camPos: THREE.Vector3, getTop: (x: number, z: number) => number, clouds: boolean): void {
    // Game signals the Void by freezing time at 18000, disabling clouds and forcing the void fog colour.
    this.isVoid = !clouds && dayTime === 18000 && !!this.biomeFog && this.biomeFog[0] === VOID_FOG[0] && this.biomeFog[1] === VOID_FOG[1] && this.biomeFog[2] === VOID_FOG[2];
    const angle = ((dayTime / 24000) * Math.PI * 2) - Math.PI / 2; // sunrise at 0, noon 6000
    const sunY = Math.sin(angle + Math.PI / 2);
    // sun rises in +x and sets in -x, arcing over +z
    this.sunDir.set(Math.cos(angle + Math.PI / 2), sunY, 0.25).normalize();
    this.celestial.position.copy(camPos);
    this.skyMesh.position.copy(camPos);
    // Orient the square discs along the arc (their "up" is the arc tangent) so they stay upright at noon
    // instead of rolling arbitrarily when lookAt's world-up becomes parallel to the view direction.
    const a = angle + Math.PI / 2;
    this.sun.up.set(-Math.sin(a), Math.cos(a), 0);
    this.moon.up.set(Math.sin(a), -Math.cos(a), 0);
    this.sun.position.copy(this.sunDir).multiplyScalar(400);
    this.sun.lookAt(camPos);
    this.moon.position.copy(this.sunDir).multiplyScalar(-400);
    this.moon.lookAt(camPos);
    this.stars.rotation.set(0, 0, (dayTime / 24000) * Math.PI * 2);
    this.clouds.visible = clouds;
    // keep the cloud plane inside the camera frustum (camera.far = renderDistance*16+200) without changing cloud size
    const k = Math.min(1, (this.farPlane * 0.92) / 1024);
    this.cloudFade.value = this.farPlane * 0.9;
    this.clouds.scale.setScalar(k);
    this.clouds.position.x = camPos.x; this.clouds.position.z = camPos.z;
    this.clouds.position.y = Math.max(this.cloudHeight, camPos.y + 40);
    this.cloudDrift += dt * 0.6;
    const ctex = (this.clouds.material as THREE.MeshBasicMaterial).map!;
    ctex.repeat.set(4 * k, 4 * k);
    ctex.offset.x = ((camPos.x + this.cloudDrift) / 512) % 1;
    ctex.offset.y = (camPos.z / 512) % 1;

    // weather blend
    const target = this.weather === 'clear' ? 0 : this.weather === 'storm' ? 1 : 0.7;
    this.weatherIntensity += (target - this.weatherIntensity) * Math.min(1, dt * 0.35);
    if (this.weatherIntensity < 0.01) this.weatherIntensity = 0;
    const rainT = this.weatherIntensity;

    // daylight curve
    let day = THREE.MathUtils.clamp((sunY + 0.1) / 0.32, 0, 1);
    day = day * day * (3 - 2 * day);
    const sunset = THREE.MathUtils.clamp(1 - Math.abs(sunY) / 0.2, 0, 1);

    this.tmpA.copy(this.cNightSky).lerp(this.cDaySky, day);
    this.tmpB.copy(this.cNightHorizon).lerp(this.cDayHorizon, day);
    if (this.cold) { this.tmpA.lerp(WHITE, 0.08 * day); this.tmpB.lerp(WHITE, 0.15 * day); }
    this.tmpA.lerp(this.cRainSky, rainT * (0.3 + day * 0.6));
    this.tmpB.lerp(this.cRainHorizon, rainT * (0.3 + day * 0.6));
    if (this.isVoid) { this.tmpA.copy(this.cVoidSky); this.tmpB.copy(this.cVoidHorizon); day = 0.35; }
    if (this.biomeFog) { this.tmpC.setRGB(this.biomeFog[0], this.biomeFog[1], this.biomeFog[2]); this.tmpB.lerp(this.tmpC, this.isVoid ? 0.6 : 0.5 * day); }

    this.lightningFlash = Math.max(0, this.lightningFlash - dt * 4);
    if (this.lightningFlash > 0) { this.tmpA.lerp(WHITE, this.lightningFlash * 0.7); this.tmpB.lerp(WHITE, this.lightningFlash * 0.6); }

    (this.skyMat.uniforms.uTop.value as THREE.Color).copy(this.tmpA);
    (this.skyMat.uniforms.uHorizon.value as THREE.Color).copy(this.tmpB);
    (this.skyMat.uniforms.uSunset.value as THREE.Color).copy(this.cSunset);
    (this.skyMat.uniforms.uSunDir.value as THREE.Vector3).copy(this.sunDir);
    this.skyMat.uniforms.uSunsetAmount.value = sunset * (1 - rainT) * (this.isVoid ? 0 : 1);
    this.skyMat.uniforms.uGlow.value = this.skyGlow * (1 - rainT) * (this.isVoid ? 0 : 1);
    // keep the sky's colour-space define in step with the world materials
    const wantLinear = this.linearOut;
    const hasLinear = this.skyMat.defines?.LINEAR_OUT !== undefined;
    if (wantLinear !== hasLinear) {
      this.skyMat.defines = wantLinear ? { LINEAR_OUT: '1' } : {};
      this.skyMat.needsUpdate = true;
    }
    this.skyMat.uniforms.uVoid.value = this.isVoid ? 1 : 0;
    (this.skyMat.uniforms.uMoonDir.value as THREE.Vector3).copy(this.sunDir).multiplyScalar(-1);
    this.skyMat.uniforms.uNight.value = this.isVoid ? 0 : Math.max(0, Math.min(1, (0.25 - this.daylight) / 0.25));
    this.sun.visible = this.moon.visible = !this.isVoid;
    (this.stars.material as THREE.PointsMaterial).opacity = this.isVoid ? 0.9 : (1 - day) * (1 - rainT) * 0.9;
    (this.sun.material as THREE.MeshBasicMaterial).opacity = 1 - rainT * 0.85;
    (this.moon.material as THREE.MeshBasicMaterial).opacity = 1 - rainT * 0.85;
    (this.clouds.material as THREE.MeshBasicMaterial).color.setScalar(0.14 + 0.86 * day - rainT * 0.35 * day);
    (this.clouds.material as THREE.MeshBasicMaterial).opacity = 0.75 + rainT * 0.25;

    // fog colour & daylight
    this.fogColor.copy(this.tmpB);
    if (this.underwater) this.fogColor.copy(this.cWater).lerp(this.cWaterDeep, day);
    // night floor 0.3: a moonlit surface stays readable (caves still go near-black because their sky light is 0)
    this.daylight = this.isVoid ? 0.35 : Math.max(0.3, day * (1 - rainT * 0.4));
    if (this.lightningFlash > 0) this.daylight = Math.min(1, this.daylight + this.lightningFlash);
    this.skyTint.copy(this.tmpB);
    // sunlight colour on block faces
    this.sunTint.copy(this.cNightLight).lerp(this.cNoonLight, day);
    this.sunTint.lerp(this.cSunsetLight, sunset * day * 0.85);
    this.sunTint.lerp(this.cRainLight, rainT * 0.6);
    if (this.isVoid) this.sunTint.setRGB(0.85, 0.55, 0.6);
    if (this.lightningFlash > 0) this.sunTint.lerp(WHITE, this.lightningFlash);

    // rain / snow particles
    if (rainT > 0.02 && !this.isVoid && this.renderPrecipitation) {
      this.rain.visible = true;
      const mat = this.rain.material as THREE.LineBasicMaterial;
      mat.opacity = rainT * (this.cold ? 0.85 : 0.55);
      mat.color.set(this.cold ? 0xf4f8ff : 0x9fb8ff);
      const p = this.rainPositions, seg = this.rainSeg;
      const fall = this.cold ? 0.25 : 1;
      const len = this.cold ? 0.08 : 0.6;   // streak length: long for rain, a dot for snow
      const groundY = getTop(Math.floor(camPos.x), Math.floor(camPos.z));
      for (let i = 0; i < this.rainVel.length; i++) {
        p[i * 3 + 1] -= this.rainVel[i] * dt * fall;
        if (this.cold) p[i * 3] += Math.sin((i + this.cloudDrift * 3) * 0.5) * dt * 0.4;
        if (camPos.y + p[i * 3 + 1] < groundY - 2 || p[i * 3 + 1] < -12) {
          p[i * 3] = (Math.random() - 0.5) * 40; p[i * 3 + 1] = 16 + Math.random() * 12; p[i * 3 + 2] = (Math.random() - 0.5) * 40;
        }
        const o = i * 6;
        seg[o] = p[i * 3]; seg[o + 1] = p[i * 3 + 1]; seg[o + 2] = p[i * 3 + 2];
        seg[o + 3] = p[i * 3]; seg[o + 4] = p[i * 3 + 1] + len; seg[o + 5] = p[i * 3 + 2];
      }
      this.rain.position.copy(camPos);
      (this.rain.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    } else this.rain.visible = false;
  }

  dispose(): void {
    this.skyMesh.geometry.dispose(); this.skyMat.dispose();
    (this.sun.material as THREE.Material).dispose(); (this.moon.material as THREE.Material).dispose();
    this.stars.geometry.dispose(); (this.stars.material as THREE.Material).dispose();
    this.clouds.geometry.dispose(); (this.clouds.material as THREE.Material).dispose();
    this.rain.geometry.dispose(); (this.rain.material as THREE.Material).dispose();
  }
}
