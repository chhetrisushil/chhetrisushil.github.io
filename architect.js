// A microservices architecture, in 3D — the hero model.
//
// Tiered slabs, colour-coded by role, wired together and labelled: clients on top, then the
// gateway, the services, and the data stores at the base. It is the diagram an architect draws
// on a whiteboard, stood up in space.
//
// Built from the layout, not from an asset: every slab is a box placed by data, so the scene is
// described by the NODES table below and nothing else.
//
// One deliberate departure from the reference it is modelled on: no scroll-to-zoom. In a hero
// banner that would swallow the page's own scrolling, which is a worse trade than losing a
// zoom. Drag still rotates.
//
// The bare "three" specifier is resolved by an import map — this site has no bundler.

import * as THREE from "three";

const TIERS = {
  client: { y: 3.1, color: "#4aa3ff", label: "Client" },
  gateway: { y: 2.0, color: "#a855f7", label: "Gateway" },
  service: { y: 0.95, color: "#10b981", label: "Service" },
  data: { y: -0.15, color: "#f0a742", label: "Database" },
};

/** The architecture itself. Everything on screen is derived from this. */
const NODES = [
  { id: "web", tier: "client", label: "Web Frontend", x: -1.5, z: -1.2 },
  { id: "mobile", tier: "client", label: "Mobile App", x: 1.6, z: -0.9 },
  { id: "admin", tier: "client", label: "Admin Console", x: 0.0, z: 1.5 },

  { id: "cdn", tier: "gateway", label: "Edge CDN", x: -2.4, z: 0.6 },
  { id: "gw", tier: "gateway", label: "API Gateway", x: 0.4, z: -0.4 },

  { id: "orders", tier: "service", label: "Orders", x: -2.0, z: -1.4 },
  { id: "catalog", tier: "service", label: "Catalog", x: 0.1, z: -1.9 },
  { id: "identity", tier: "service", label: "Identity", x: 2.2, z: -1.0 },
  { id: "payments", tier: "service", label: "Payments", x: 2.0, z: 1.1 },
  { id: "search", tier: "service", label: "Search", x: -0.4, z: 1.8 },
  { id: "inventory", tier: "service", label: "Inventory", x: -2.3, z: 0.9 },

  { id: "pg", tier: "data", label: "Postgres", x: -1.7, z: -0.9 },
  { id: "cache", tier: "data", label: "Redis", x: 0.6, z: -1.6 },
  { id: "queue", tier: "data", label: "Event Log", x: 1.9, z: 0.4 },
  { id: "blob", tier: "data", label: "Object Store", x: -0.9, z: 1.6 },
];

/** Who talks to whom. Drawn as edges, and the path the flow pulses travel. */
const EDGES = [
  ["web", "cdn"], ["mobile", "gw"], ["admin", "gw"], ["cdn", "gw"],
  ["gw", "orders"], ["gw", "catalog"], ["gw", "identity"], ["gw", "payments"],
  ["gw", "search"], ["gw", "inventory"],
  ["orders", "pg"], ["orders", "queue"], ["catalog", "pg"], ["catalog", "cache"],
  ["identity", "pg"], ["payments", "queue"], ["search", "cache"],
  ["inventory", "pg"], ["inventory", "blob"],
];

/** A label as a canvas texture on a sprite — self-contained in WebGL, no DOM to keep in sync. */
function labelSprite(text, dpr) {
  const pad = 12;
  const font = `600 ${26 * dpr}px ui-sans-serif, system-ui, -apple-system, sans-serif`;
  const measure = document.createElement("canvas").getContext("2d");
  if (!measure) return null;
  measure.font = font;
  const w = Math.ceil(measure.measureText(text).width) + pad * 2 * dpr;
  const h = Math.ceil(44 * dpr);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.font = font;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  // Drawn twice: a dark halo first, so the label stays readable wherever it crosses a beam.
  ctx.lineWidth = 6 * dpr;
  ctx.strokeStyle = "rgba(6,8,13,0.9)";
  ctx.strokeText(text, w / 2, h / 2);
  ctx.fillStyle = "#e7ecf3";
  ctx.fillText(text, w / 2, h / 2);

  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  sprite.scale.set((w / h) * 0.26, 0.26, 1);
  return sprite;
}

export function mountArchitecture(canvas, options = {}) {
  const { opacity = 1, spin = 0.1 } = options;

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
  const dpr = Math.min(Math.max(window.devicePixelRatio || 1, 1.8), 2.5);
  renderer.setPixelRatio(dpr);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
  camera.position.set(7.0, 6.0, 8.9);
  camera.lookAt(0, 1.3, 0);

  const world = new THREE.Group();
  scene.add(world);

  // Ground plane grid — gives the slabs somewhere to stand.
  const grid = new THREE.GridHelper(16, 16, 0x2b3444, 0x1e2430);
  grid.position.y = -1.15;
  const gm = grid.material;
  for (const m of Array.isArray(gm) ? gm : [gm]) {
    m.transparent = true;
    m.opacity = 0.5;
  }
  world.add(grid);

  const byId = new Map();

  // Slabs.
  for (const n of NODES) {
    const tier = TIERS[n.tier];
    const color = new THREE.Color(tier.color);
    const g = new THREE.BoxGeometry(1.15, 0.16, 0.85);
    const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.62 });
    const slab = new THREE.Mesh(g, m);
    slab.position.set(n.x, tier.y, n.z);
    world.add(slab);

    // A brighter wireframe over the fill reads as an edge-lit panel rather than a flat box.
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(g),
      new THREE.LineBasicMaterial({ color: color.clone().offsetHSL(0, 0, 0.18), transparent: true, opacity: 0.95 })
    );
    edges.position.copy(slab.position);
    world.add(edges);

    const sprite = labelSprite(n.label, Math.min(dpr, 2));
    if (sprite) {
      sprite.position.set(n.x, tier.y + 0.38, n.z);
      world.add(sprite);
    }
    byId.set(n.id, slab.position);
  }

  // Edges between tiers.
  const flowPoints = [];
  for (const [from, to] of EDGES) {
    const a = byId.get(from);
    const b = byId.get(to);
    if (!a || !b) continue;
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([a, b]),
      new THREE.LineBasicMaterial({ color: 0x8aa0bd, transparent: true, opacity: 0.22 })
    );
    world.add(line);
    flowPoints.push([a, b]);
  }

  // Data-flow pulses: one travelling dot per edge, staggered so they never march in step.
  const pulseGeo = new THREE.BufferGeometry();
  const pulsePos = new Float32Array(flowPoints.length * 3);
  pulseGeo.setAttribute("position", new THREE.BufferAttribute(pulsePos, 3));
  const pulses = new THREE.Points(
    pulseGeo,
    new THREE.PointsMaterial({ color: 0xf0d9a8, size: 0.11, transparent: true, opacity: 0.9, sizeAttenuation: true })
  );
  world.add(pulses);

  const applyTheme = () => {
    const light = document.documentElement.dataset.theme === "light";
    for (const m of Array.isArray(gm) ? gm : [gm]) m.opacity = light ? 0.7 : 0.5;
    pulses.material.color.set(light ? 0x8a5a00 : 0xf0d9a8);
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

  // Drag to rotate. Pointer events only — the wheel is left to the page, deliberately.
  let dragging = false;
  let lastX = 0;
  let manual = 0;
  const onDown = (e) => {
    dragging = true;
    lastX = e.clientX;
    canvas.setPointerCapture?.(e.pointerId);
  };
  const onMove = (e) => {
    if (!dragging) return;
    manual += (e.clientX - lastX) * 0.006;
    lastX = e.clientX;
  };
  const onUp = () => { dragging = false; };

  const t0 = performance.now();
  let raf = 0;
  let visible = true;
  let auto = 0;

  const tick = () => {
    raf = requestAnimationFrame(tick);
    const t = (performance.now() - t0) / 1000;
    if (!dragging) auto += (calm ? spin * 0.35 : spin) * 0.016;
    world.rotation.y = auto + manual;

    // March each pulse along its edge; the offset keeps them out of lockstep.
    for (let i = 0; i < flowPoints.length; i++) {
      const [a, b] = flowPoints[i];
      const k = (t * 0.28 + i * 0.137) % 1;
      pulsePos[i * 3] = a.x + (b.x - a.x) * k;
      pulsePos[i * 3 + 1] = a.y + (b.y - a.y) * k;
      pulsePos[i * 3 + 2] = a.z + (b.z - a.z) * k;
    }
    pulseGeo.attributes.position.needsUpdate = true;

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
  canvas.addEventListener("pointerdown", onDown);
  window.addEventListener("pointermove", onMove, { passive: true });
  window.addEventListener("pointerup", onUp, { passive: true });

  renderer.render(scene, camera);
  if (!still) start();

  return function dispose() {
    stop();
    themeObserver.disconnect();
    io.disconnect();
    window.removeEventListener("resize", onResize);
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    canvas.removeEventListener("pointerdown", onDown);
    document.removeEventListener("visibilitychange", onVisibility);
    scene.traverse((o) => {
      const mesh = o;
      mesh.geometry?.dispose?.();
      const mat = mesh.material;
      for (const m of Array.isArray(mat) ? mat : mat ? [mat] : []) {
        m.map?.dispose?.();
        m.dispose?.();
      }
    });
    renderer.dispose();
  };
}
