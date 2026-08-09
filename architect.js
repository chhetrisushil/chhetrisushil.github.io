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

// Tiers are coloured along the site's own gradient — amber → coral → violet — rather than the
// stock blue/purple/green/amber of an architecture diagram. Two things follow from that:
//
//  - The ramp is ORDERED, and so is the stack. Violet at the top through amber at the base
//    means the colour itself says how far down the request has travelled, which four unrelated
//    hues cannot. Adjacent tiers stay ~26–58° apart in hue, so the legend still resolves.
//  - Light theme needs its own set. These hues are chosen to glow on near-black; over white,
//    dimmed by the shading term, they turn to pastel mud. The light values are deeper and more
//    saturated so they read AS colour on paper — the same split the weave uses.
const TIERS = {
  client: { y: 3.1, dark: "#a06bff", light: "#6a37cc", label: "Client" },
  gateway: { y: 2.0, dark: "#d566b9", light: "#a63a8b", label: "Gateway" },
  service: { y: 0.95, dark: "#e2704f", light: "#c04a2f", label: "Service" },
  data: { y: -0.15, dark: "#f0a742", light: "#b8690a", label: "Database" },
};

/** Everything else that has to flip with the theme, in one place. */
const THEME = {
  dark: { wire: "#9d8fa8", pulse: 0xf0d9a8, ink: "#e7ecf3", halo: "rgba(6,8,13,0.9)", fill: 0.62, wireA: 0.22, grid: 0.5 },
  light: { wire: "#8c7d97", pulse: 0x8a5a00, ink: "#10141c", halo: "rgba(255,255,255,0.92)", fill: 0.58, wireA: 0.3, grid: 0.7 },
};

const isLight = () => document.documentElement.dataset.theme === "light";

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

/**
 * A label as a canvas texture — self-contained in WebGL, no DOM to keep in sync.
 *
 * Ink and halo swap with the theme: light text haloed in near-black is legible over the dark
 * page, and exactly as illegible over the white one. Returns the texture and its aspect so the
 * caller can size the sprite; the font does not change with the theme, so a re-render on toggle
 * keeps the same dimensions and only the map has to be replaced.
 */
function labelTexture(text, dpr, light) {
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
  const t = light ? THEME.light : THEME.dark;
  ctx.font = font;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  // Drawn twice: a halo first, so the label stays readable wherever it crosses a beam.
  ctx.lineWidth = 6 * dpr;
  ctx.strokeStyle = t.halo;
  ctx.strokeText(text, w / 2, h / 2);
  ctx.fillStyle = t.ink;
  ctx.fillText(text, w / 2, h / 2);

  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  return { tex, aspect: w / h };
}

export function mountArchitecture(canvas, options = {}) {
  const { spin = 0.1 } = options;

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
  // Held so the theme switch can recolour in place rather than rebuild the scene.
  const tinted = []; // { tier, fill, edge }
  const labels = []; // { sprite, text }

  // Slabs.
  for (const n of NODES) {
    const tier = TIERS[n.tier];
    const g = new THREE.BoxGeometry(1.15, 0.16, 0.85);
    const m = new THREE.MeshBasicMaterial({ transparent: true });
    const slab = new THREE.Mesh(g, m);
    slab.position.set(n.x, tier.y, n.z);
    world.add(slab);

    // A brighter wireframe over the fill reads as an edge-lit panel rather than a flat box.
    const edgeMat = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.95 });
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(g), edgeMat);
    edges.position.copy(slab.position);
    world.add(edges);
    tinted.push({ tier: n.tier, fill: m, edge: edgeMat });

    const label = labelTexture(n.label, Math.min(dpr, 2), isLight());
    if (label) {
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: label.tex, transparent: true, depthTest: false })
      );
      sprite.scale.set(label.aspect * 0.26, 0.26, 1);
      sprite.position.set(n.x, tier.y + 0.38, n.z);
      world.add(sprite);
      labels.push({ sprite, text: n.label });
    }
    byId.set(n.id, slab.position);
  }

  // Edges between tiers.
  const flowPoints = [];
  const wires = [];
  for (const [from, to] of EDGES) {
    const a = byId.get(from);
    const b = byId.get(to);
    if (!a || !b) continue;
    const wireMat = new THREE.LineBasicMaterial({ transparent: true });
    world.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), wireMat));
    wires.push(wireMat);
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
    const light = isLight();
    const t = light ? THEME.light : THEME.dark;

    for (const m of Array.isArray(gm) ? gm : [gm]) m.opacity = t.grid;
    pulses.material.color.set(t.pulse);

    for (const { tier, fill, edge } of tinted) {
      const c = new THREE.Color(light ? TIERS[tier].light : TIERS[tier].dark);
      fill.color.copy(c);
      fill.opacity = t.fill;
      // Lighten the outline on dark, darken it on light — either way the edge stays the
      // brighter-contrast one against its own fill.
      edge.color.copy(c).offsetHSL(0, 0, light ? -0.14 : 0.18);
    }
    for (const w of wires) {
      w.color.set(t.wire);
      w.opacity = t.wireA;
    }
    // Labels are baked pixels, so a theme change means redrawing them, not recolouring.
    for (const { sprite, text } of labels) {
      const next = labelTexture(text, Math.min(dpr, 2), light);
      if (!next) continue;
      sprite.material.map?.dispose();
      sprite.material.map = next.tex;
      sprite.material.needsUpdate = true;
    }
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
