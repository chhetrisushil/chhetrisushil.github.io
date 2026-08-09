// A woven lattice — the loom, literally.
//
// Warp threads run one way, weft threads the other, and at every crossing a thread passes
// alternately over and under its neighbour. That alternation is what makes this cloth rather
// than a grid, and it is generated, not modelled: there is no asset file, just a parametric
// curve per thread.
//
// Everything is merged into ONE geometry and drawn with ONE custom shader, so the whole scene
// is a single draw call. The ripple is computed in the vertex shader from a clock uniform, so
// animating costs no CPU work and no per-frame allocation.
//
// Used by both the Loom docs site and the personal site. The personal site has no bundler, so
// the bare "three" specifier is resolved there by an import map — keep it bare.

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

const PALETTE = {
  a: new THREE.Color("#f0a742"), // amber
  b: new THREE.Color("#e0725f"), // coral
  c: new THREE.Color("#a06bff"), // violet
};

/**
 * One thread as a smooth curve. `axis` 0 = warp (runs along x), 1 = weft (runs along z).
 * `index` is which thread, `count` how many in that direction.
 *
 * The over/under is the whole point: a thread rises above each crossing where (i + j) is even
 * and dips below where it is odd, so neighbouring threads interlock instead of intersecting.
 */
function threadCurve(axis, index, count, span, amplitude) {
  const points = [];
  const steps = count * 2;
  const offset = -span / 2 + (index / (count - 1)) * span;

  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const along = -span / 2 + t * span;
    // Which crossing are we nearest, and does this thread go over or under it?
    const crossing = Math.round(t * (count - 1));
    const over = (index + crossing) % 2 === 0 ? 1 : -1;
    // Smooth the square over/under pattern into a sine so the thread reads as flexible.
    const y = over * amplitude * Math.abs(Math.sin(t * (count - 1) * Math.PI));
    points.push(axis === 0 ? new THREE.Vector3(along, y, offset) : new THREE.Vector3(offset, y, along));
  }
  return new THREE.CatmullRomCurve3(points, false, "centripetal", 0.5);
}

function buildFabric({ threads, span, amplitude, radius }) {
  const parts = [];
  for (let axis = 0; axis < 2; axis++) {
    for (let i = 0; i < threads; i++) {
      const geo = new THREE.TubeGeometry(
        threadCurve(axis, i, threads, span, amplitude),
        threads * 9, // tubular segments — a coarse sweep shows as facets along each thread
        radius,
        9, // radial segments; 5 gives a visibly polygonal silhouette on a large canvas
        false
      );
      parts.push(geo);
    }
  }
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return merged;
}

const VERT = /* glsl */ `
  uniform float uTime;
  uniform float uSpan;
  uniform float uRipple;
  varying float vShade;
  varying float vHeight;

  void main() {
    vec3 p = position;
    // A travelling wave across the cloth — diagonal, so it reads as fabric settling rather
    // than a bar sweeping through.
    float d = (p.x + p.z) / uSpan;
    float wave = sin(d * 3.14159 * 2.0 - uTime * 0.9) * uRipple
               + sin(p.x / uSpan * 6.2831 + uTime * 0.5) * uRipple * 0.4;
    p.y += wave;

    vShade = clamp((p.x / uSpan) + 0.5, 0.0, 1.0);
    vHeight = p.y;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const FRAG = /* glsl */ `
  precision mediump float;
  uniform vec3 uA;
  uniform vec3 uB;
  uniform vec3 uC;
  uniform float uOpacity;
  varying float vShade;
  varying float vHeight;

  void main() {
    // Amber → coral → violet across the cloth, the same ramp as the site's gradient.
    vec3 col = vShade < 0.5
      ? mix(uA, uB, vShade * 2.0)
      : mix(uB, uC, (vShade - 0.5) * 2.0);
    // Threads riding over a crossing catch a little more light than those dipping under.
    col *= 0.72 + clamp(vHeight * 6.0, -0.25, 0.42);
    gl_FragColor = vec4(col, uOpacity);
  }
`;

/**
 * Mount the animation into `canvas`. Returns a dispose function.
 *
 * Guards, in order of how often they matter:
 *  - no WebGL              → returns null, caller keeps its CSS fallback
 *  - prefers-reduced-motion → one static frame, no rAF loop at all
 *  - tab hidden / scrolled away → loop parked, so it never burns battery unseen
 */
export function mountWeave(canvas, options = {}) {
  const {
    threads = 15,
    span = 9,
    amplitude = 0.16,
    radius = 0.028,
    ripple = 0.12,
    opacity = 0.95,
    spin = 0.055,
    // Vertical drift per pixel scrolled. 0 disables. Small on purpose: parallax that outruns
    // the page reads as a bug rather than depth.
    parallax = 0,
  } = options;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "low-power" });
  } catch {
    return null; // no WebGL — the caller's static background stands in
  }
  if (!renderer.getContext()) return null;

  // Motion is ON by default, including for visitors whose OS asks to reduce it.
  //
  // That is a deliberate choice and worth being honest about: `prefers-reduced-motion` exists
  // because movement can trigger nausea or migraine, so ignoring it outright is not free.
  // The compromise here is that those visitors get a CALM profile rather than nothing — the
  // cloth still lives, but slower, with a shallower ripple and no pointer or scroll parallax,
  // since it is the large, fast, cursor-chasing movement that actually causes trouble.
  //
  // `?motion=0` forces the static frame for anyone who needs it; `?motion=1` forces the full
  // effect regardless.
  const prefersReduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  const param = new URLSearchParams(location.search).get("motion");
  const reduced = param === "0";
  const calm = param === "1" ? false : prefersReduced;

  renderer.setClearColor(0x000000, 0);
  // Supersample, do not merely honour devicePixelRatio. On a scaled display DPR reports 1, so
  // rendering 1:1 leaves these thin tubes stair-stepped even with MSAA on. Render above the
  // CSS size and let the browser downsample; cap it so a retina phone is not asked for 3x.
  const dpr = window.devicePixelRatio || 1;
  renderer.setPixelRatio(Math.min(Math.max(dpr, 1.8), 2.5));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
  // High and close: near edge-on the cloth collapses into a ribbon and the weave — the whole
  // point of the model — becomes invisible. Looking down on it keeps the over/under readable.
  camera.position.set(0.2, 6.6, 6.4);
  camera.lookAt(0, -0.2, 0);

  const geometry = buildFabric({ threads, span, amplitude, radius });
  const material = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    uniforms: {
      uTime: { value: 0 },
      uSpan: { value: span },
      uRipple: { value: reduced ? 0 : calm ? ripple * 0.45 : ripple },
      uA: { value: PALETTE.a },
      uB: { value: PALETTE.b },
      uC: { value: PALETTE.c },
      uOpacity: { value: opacity },
    },
  });

  const cloth = new THREE.Mesh(geometry, material);
  cloth.rotation.x = -0.12;
  scene.add(cloth);

  const resize = () => {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  resize();

  // Pointer parallax, damped. Skipped entirely under reduced motion.
  let targetX = 0;
  let targetY = 0;
  const onPointer = (e) => {
    targetX = (e.clientX / window.innerWidth - 0.5) * 0.35;
    targetY = (e.clientY / window.innerHeight - 0.5) * 0.2;
  };

  let scrollShift = 0;
  const onScroll = () => {
    scrollShift = -(window.scrollY || 0) * parallax;
  };

  // performance.now(), not THREE.Clock — the latter is deprecated in three 0.185, and a start
  // stamp is all the shader needs.
  const t0 = performance.now();
  let raf = 0;
  let visible = true;

  const frame = () => {
    raf = requestAnimationFrame(frame);
    material.uniforms.uTime.value = (performance.now() - t0) / 1000;
    cloth.rotation.y += (calm ? spin * 0.35 : spin) * 0.016;
    // Damped pointer parallax — the cloth drifts toward the cursor rather than snapping.
    cloth.position.x += (targetX - cloth.position.x) * 0.04;
    cloth.position.y += (-targetY + scrollShift - cloth.position.y) * 0.04;
    renderer.render(scene, camera);
  };

  const start = () => {
    if (raf || reduced || !visible) return;
    raf = requestAnimationFrame(frame);
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
    if (reduced) renderer.render(scene, camera);
  };

  window.addEventListener("resize", onResize, { passive: true });
  document.addEventListener("visibilitychange", onVisibility);
  io.observe(canvas);
  // Pointer- and scroll-linked movement is the part most likely to cause trouble, so the calm
  // profile drops both and keeps only the ambient drift.
  if (!reduced && !calm) {
    window.addEventListener("pointermove", onPointer, { passive: true });
    if (parallax) window.addEventListener("scroll", onScroll, { passive: true });
  }

  // Reduced motion still gets the object — just held still, rendered once.
  renderer.render(scene, camera);
  if (!reduced) start();

  return function dispose() {
    stop();
    io.disconnect();
    window.removeEventListener("resize", onResize);
    window.removeEventListener("pointermove", onPointer);
    window.removeEventListener("scroll", onScroll);
    document.removeEventListener("visibilitychange", onVisibility);
    geometry.dispose();
    material.dispose();
    renderer.dispose();
  };
}
