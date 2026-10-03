// Minimal three.js stub so the mob model builders in Entities.ts can run in node for offline
// inspection (tools/mob-preview.mjs). Only the API surface the model builders touch is
// implemented; every BoxGeometry records its dimensions so a tool can re-draw the model.
// Plain JS on purpose: it is aliased over the real three.js module by tools/mob-preview-build.mjs.

function vec3(x = 0, y = 0, z = 0) {
  return {
    x, y, z,
    set(nx, ny, nz) { this.x = nx; this.y = ny; this.z = nz; return this; },
    setScalar(n) { this.x = this.y = this.z = n; return this; },
    copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; },
  };
}

export class Object3D {
  constructor() {
    this.children = [];
    this.position = vec3();
    this.rotation = vec3();
    this.scale = vec3(1, 1, 1);
    this.name = '';
    this.visible = true;
    this.parent = null;
  }
  add(...objs) {
    for (const o of objs) { o.parent = this; this.children.push(o); }
    return this;
  }
  remove(...objs) {
    for (const o of objs) {
      const i = this.children.indexOf(o);
      if (i >= 0) { this.children.splice(i, 1); o.parent = null; }
    }
    return this;
  }
  traverse(fn) { fn(this); for (const c of this.children) c.traverse(fn); }
  getObjectByName(name) {
    let found;
    this.traverse((o) => { if (!found && o.name === name) found = o; });
    return found;
  }
}

export class Group extends Object3D {}
export class Scene extends Object3D {}

export class BoxGeometry {
  constructor(w, h, d) { this.w = w; this.h = h; this.d = d; this.translatedBy = 0; }
  translate(x = 0, y = 0, z = 0) { this.offset = [x, y, z]; this.translatedBy = y; return this; }
  clone() {
    const c = new BoxGeometry(this.w, this.h, this.d);
    c.translatedBy = this.translatedBy;
    c.offset = this.offset ? [...this.offset] : undefined;
    return c;
  }
  // BufferGeometry API surface some builders touch (MobArt remaps UVs per box)
  setAttribute(name, attr) { (this.attributes ||= {})[name] = attr; return this; }
  getAttribute(name) { return (this.attributes ||= {})[name]; }
  get uv() { return this.attributes?.uv; }
  computeVertexNormals() {}
  dispose() {}
}

export class Mesh extends Object3D {
  constructor(geometry, material) { super(); this.geometry = geometry; this.material = material; }
}

export class MeshLambertMaterial {
  constructor(opts = {}) { Object.assign(this, opts); }
  dispose() {}
}
export class MeshBasicMaterial extends MeshLambertMaterial {}

export class CanvasTexture { constructor(image) { this.image = image; } dispose() {} }
export class Texture {}
export const NearestFilter = 1003;
export const LinearFilter = 1006;
export const RepeatWrapping = 1000;
export const SRGBColorSpace = 'srgb';
export const DoubleSide = 2;
export const FrontSide = 0;
export const BackSide = 1;
export class Box3 { setFromObject() { return this; } }
export class Vector2 { constructor(x = 0, y = 0) { this.x = x; this.y = y; } }
export class Vector3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
}
export class Euler { constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; } }
export class Color { constructor(value = 0) { this.value = value; } set() { return this; } }
export class BufferAttribute { constructor(array) { this.array = array; this.needsUpdate = false; } }
export class Float32BufferAttribute extends BufferAttribute {}
export class BufferGeometry {
  constructor() { this.attributes = {}; this.index = null; }
  setAttribute(name, attr) { this.attributes[name] = attr; return this; }
  setIndex(i) { this.index = i; return this; }
  computeBoundingSphere() {}
  dispose() {}
}
export class AmbientLight extends Object3D {}
export class DirectionalLight extends Object3D {}
export class PointLight extends Object3D {}
export class HemisphereLight extends Object3D {}
export class PerspectiveCamera extends Object3D { updateProjectionMatrix() {} }
export class OrthographicCamera extends Object3D { updateProjectionMatrix() {} }
export class WebGLRenderer {
  constructor() { this.domElement = { style: {}, addEventListener() {}, removeEventListener() {}, remove() {} }; }
  setSize() {} setPixelRatio() {} render() {} dispose() {} forceContextLoss() {}
  get outputColorSpace() { return ''; } set outputColorSpace(_v) {}
}

// used by the block texture atlas, which Entities.ts pulls in transitively
export class DataTexture { constructor(data, w, h) { this.image = { data, width: w, height: h }; } dispose() {} }
export const RGBAFormat = 1023;
export const RGBAIntegerFormat = 1035;
export const UnsignedByteType = 1009;
export const ClampToEdgeWrapping = 1001;
export const LinearMipmapLinearFilter = 1008;
export const NearestMipmapNearestFilter = 1004;
export const NearestMipmapLinearFilter = 1005;
export class LineSegments extends Object3D {}
export class LineBasicMaterial extends MeshLambertMaterial {}
export class BufferGeometryUtils {}
export class Raycaster { setFromCamera() {} intersectObjects() { return []; } }
export class Matrix4 { makeTranslation() { return this; } }
export class Quaternion { setFromEuler() { return this; } }
export class Fog { constructor() {} }
export class FogExp2 { constructor() {} }
export class Clock { getDelta() { return 0.016; } }
export const MathUtils = { clamp: (v, a, b) => Math.max(a, Math.min(b, v)) };
export default {};
