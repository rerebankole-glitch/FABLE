import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { getAtlas } from '../game/blocks/TextureAtlas';
import { World } from '../game/world/World';
import { Environment } from '../game/renderer/Environment';
import { settings } from '../game/core/Settings';

/** Slowly panning 3D world behind the main menu. */
export function MenuBackground() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'low-power' });
    } catch { return; }
    // same policy as the game view and the figure preview: never render below native, supersample
    // up to 2x so the menu backdrop stays crisp on a 1080p panel instead of being upscaled
    renderer.setPixelRatio(Math.max(2, Math.min(window.devicePixelRatio || 1, 3)));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 600);
    camera.rotation.order = 'YXZ';
    getAtlas();
    const seed = (Math.random() * 1e9) | 0;
    const world = new World({ seed, worldType: 'default', structures: true, dimension: 'overworld' }, settings.value.smoothLighting);
    world.renderDistance = 5;
    world.chunkSpeed = 2;
    scene.add(world.group);
    const env = new Environment();
    scene.add(env.group);
    let dayTime = 1500;
    let angle = Math.random() * Math.PI * 2;
    let raf = 0;
    let alive = true;
    const cx = 0.5, cz = 0.5;
    const resize = () => {
      const w = canvas.clientWidth || window.innerWidth, h = canvas.clientHeight || window.innerHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h; camera.updateProjectionMatrix();
    };
    resize();
    window.addEventListener('resize', resize);
    let last = performance.now();
    let camY = 90;
    const tint = new THREE.Color(1, 1, 1);
    const loop = () => {
      if (!alive) return;
      raf = requestAnimationFrame(loop);
      if (document.hidden) return;
      const now = performance.now();
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      angle += dt * 0.035;
      dayTime = (dayTime + dt * 60) % 24000;
      world.update(cx, cz);
      const groundY = world.isLoaded(cx, cz) ? world.surfaceY(Math.floor(cx), Math.floor(cz)) : 70;
      camY += (Math.max(groundY + 14, 70) - camY) * Math.min(1, dt * 2);
      camera.position.set(cx, camY, cz);
      camera.rotation.set(-0.22, angle, 0);
      env.update(dt, dayTime, camera.position, (x, z) => world.getTop(x, z), true);
      const [near, far] = env.fogRange(world.renderDistance);
      world.setTime(now / 1000);
      world.setLighting(env.daylight, env.fogColor, near, far, tint);
      renderer.render(scene, camera);
    };
    loop();
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      world.dispose();
      env.dispose();
      renderer.dispose();
    };
  }, []);
  return <canvas ref={ref} className="menu-bg-canvas" />;
}
