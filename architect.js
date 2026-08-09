// A structure under construction — the hero model.
//
// "Software architect" pulls in two directions, so this leans on what they share: stacked
// tiers joined by columns and cross-braces, with nodes at the junctions. Read one way it is a
// building's frame; read the other it is layers, components and the edges between them. Either
// reading is the point.
//
// It is generated, not modelled: every beam is a box placed by loop, merged into ONE geometry
// and drawn by ONE shader, so the whole scene is a single draw call and the animation costs no
// per-frame allocation.
//
// The bare "three" specifier is resolved by an import map — this site has no bundler.

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

const PALETTE = {
  dark: { a: new THREE.Color("#f0a742"), b: new THREE.Color("#e0725f"), c: new THREE.Color("#a06bff") },
  light: { a: new THREE.Color("#b8690a"), b: new THREE.Color("#c0503c"), c: new THREE.Color("#6a37cc") },
};

const isLight = () => document.documentElement.dataset.theme === "light";

/** A beam between two points, as a thin box rotated onto the segment. */
function beam(from, to, thickness) {
  const dir = new THREE.Vector3().subVectors(to, from);
  const len = dir.length();
  if (len < 1e-6) return null;
  const geo = new THREE.BoxGeometry(thickness, len, thickness);
  // Boxes are built along +Y; rotate that axis onto the segment.
  const q = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    dir.clone().normalize()
  );
  const m = new THREE.Matrix4()
    .makeRotationFromQuaternion(q)
    .setPosition(new THREE.Vector3().addVectors(from, to).multiplyScalar(0.5));
  geo.applyMatrix4(m);
  return geo;
}

/**
 * Stacked tiers, narrowing as they rise: floor plates, corner columns, cross-braces, and a
 * node block at every junction. Deterministic — no randomness, so it looks the same every load.
 */
function buildStructure({ tiers, baseSpan, tierHeight, taper, thickness, nodeSize }) {
  const parts = [];
  const cornersFor = (level) => {
    const half = (baseSpan * (1 - taper * level)) / 2;
    const y = level * tierHeight;
    return [
      new THREE.Vector3(-half, y, -half),
      new THREE.Vector3(half, y, -half),
      new THREE.Vector3(half, y, half),
      new THREE.Vector3(-half, y, half),
    ];
  };

  for (let level = 0; level < tiers; level++) {
    const ring = cornersFor(level);

    // Floor plate outline.
    for (let i = 0; i < 4; i++) parts.push(beam(ring[i], ring[(i + 1) % 4], thickness));

    // One diagonal per plate, alternating direction so the frame reads as braced rather than
    // decorated.
    parts.push(beam(ring[level % 2], ring[(level % 2) + 2], thickness * 0.6));

    // Junction nodes — the components sitting on each layer.
    for (const c of ring) {
      const n = new THREE.BoxGeometry(nodeSize, nodeSize, nodeSize);
      n.translate(c.x, c.y, c.z);
      parts.push(n);
    }

    // Columns up to the next tier, plus a cross-brace on one face.
    if (level < tiers - 1) {
      const next = cornersFor(level + 1);
      for (let i = 0; i < 4; i++) parts.push(beam(ring[i], next[i], thickness));
      const f = level % 4;
      parts.push(beam(ring[f], next[(f + 1) % 4], thickness * 0.45));
    }
  }

  const merged = mergeGeometries(parts.filter(Boolean), false);
  for (const p of parts) p?.dispose();
  return merged;
}

const VERT = /* glsl */ `
  uniform float uTime;
  uniform float uHeight;
  varying float vUp;
  void main() {
    vec3 p = position;
    // A slow breath, strongest at the top: a tall frame should feel like it is settling under
    // its own weight rather than sitting perfectly rigid.
    float t = clamp(p.y / uHeight, 0.0, 1.0);
    p.x += sin(uTime * 0.6 + p.y * 0.8) * 0.02 * t;
    p.z += cos(uTime * 0.5 + p.y * 0.7) * 0.02 * t;
    vUp = t;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const FRAG = /* glsl */ `
  precision mediump float;
  uniform vec3 uA;
  uniform vec3 uB;
  uniform vec3 uC;
  uniform float uOpacity;
  uniform float uLight;
  varying float vUp;
  void main() {
    // Amber at the foundations, violet at the top — the site's ramp, mapped to height.
    vec3 col = vUp < 0.5 ? mix(uA, uB, vUp * 2.0) : mix(uB, uC, (vUp - 0.5) * 2.0);
    // Lift the upper tiers slightly so the structure reads as receding into light.
    col *= mix(0.82, 1.06, vUp) * mix(1.0, 0.92, uLight);
    gl_FragColor = vec4(col, uOpacity);
  }
`;

/**
 * Mount into `canvas`; returns a dispose function, or null when WebGL is unavailable.
 *
 * Guards, learned the hard way on this site's previous model: no WebGL falls back silently,
 * reduce-motion renders one static frame, and the loop parks when the canvas is off-screen or
 * the tab is hidden so it never burns battery unseen.
 */
export function mountArchitecture(canvas, options = {}) {
  const {
    tiers = 6,
    baseSpan = 3.4,
    tierHeight = 0.72,
    taper = 0.12,
    thickness = 0.035,
    nodeSize = 0.1,
    opacity = 0.95,
    spin = 0.16,
  } = options;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "low-power" });
  } catch {
    return null;
  }
  if (!renderer.getContext()) return null;

  const prefersReduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  const param = new URLSearchParams(location.search).get("motion");
  const still = param === "0";
  const calm = param === "1" ? false : prefersReduced;

  renderer.setClearColor(0x000000, 0);
  // Supersample regardless of devicePixelRatio: on a scaled display it reports 1, and thin
  // beams stair-step badly at 1:1 even with MSAA on.
  renderer.setPixelRatio(Math.min(Math.max(window.devicePixelRatio || 1, 1.8), 2.5));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
  const height = (tiers - 1) * tierHeight;
  camera.position.set(3.6, height * 0.78 + 2.1, 6.4);
  camera.lookAt(0, height * 0.42, 0);

  const geometry = buildStructure({ tiers, baseSpan, tierHeight, taper, thickness, nodeSize });
  const material = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    uniforms: {
      uTime: { value: 0 },
      uHeight: { value: height },
      uA: { value: PALETTE.dark.a.clone() },
      uB: { value: PALETTE.dark.b.clone() },
      uC: { value: PALETTE.dark.c.clone() },
      uOpacity: { value: opacity },
      uLight: { value: 0 },
    },
  });

  const frame = new THREE.Mesh(geometry, material);
  frame.position.y = -height * 0.42;
  scene.add(frame);

  const applyTheme = () => {
    const light = isLight();
    const p = light ? PALETTE.light : PALETTE.dark;
    material.uniforms.uA.value.copy(p.a);
    material.uniforms.uB.value.copy(p.b);
    material.uniforms.uC.value.copy(p.c);
    material.uniforms.uLight.value = light ? 1 : 0;
  };
  applyTheme();
  const themeObserver = new MutationObserver(() => {
    applyTheme();
    if (still) renderer.render(scene, camera);
  });
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  const resize = () => {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  resize();

  let targetX = 0;
  const onPointer = (e) => {
    targetX = (e.clientX / window.innerWidth - 0.5) * 0.5;
  };

  const t0 = performance.now();
  let raf = 0;
  let visible = true;

  const tick = () => {
    raf = requestAnimationFrame(tick);
    const t = (performance.now() - t0) / 1000;
    material.uniforms.uTime.value = t;
    frame.rotation.y += (calm ? spin * 0.35 : spin) * 0.016;
    frame.rotation.x += (targetX * 0.12 - frame.rotation.x) * 0.03;
    renderer.render(scene, camera);
  };

  const start = () => {
    if (raf || still || !visible) return;
    raf = requestAnimationFrame(tick);
  };
  const stop = () => {
    if (!raf) return;
    cancelAnimationFrame(raf);
    raf = 0;
  };

  const onVisibility = () => (document.hidden ? stop() : start());
  const io = new IntersectionObserver(
    ([entry]) => {
      visible = entry.isIntersecting;
      visible ? start() : stop();
    },
    { threshold: 0 }
  );
  const onResize = () => {
    resize();
    if (still) renderer.render(scene, camera);
  };

  window.addEventListener("resize", onResize, { passive: true });
  document.addEventListener("visibilitychange", onVisibility);
  io.observe(canvas);
  if (!still && !calm) window.addEventListener("pointermove", onPointer, { passive: true });

  renderer.render(scene, camera);
  if (!still) start();

  return function dispose() {
    stop();
    themeObserver.disconnect();
    io.disconnect();
    window.removeEventListener("resize", onResize);
    window.removeEventListener("pointermove", onPointer);
    document.removeEventListener("visibilitychange", onVisibility);
    geometry.dispose();
    material.dispose();
    renderer.dispose();
  };
}
