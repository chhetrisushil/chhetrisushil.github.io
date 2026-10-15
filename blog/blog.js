// Blog: one manifest (posts.json), one markdown file per post. No build step, same as the rest
// of the site — the list page and the post page both read the manifest at runtime, and the post
// page renders its markdown in the browser.
//
// Mermaid is ~2.6 MB, so it is only fetched when the post actually contains a ```mermaid block.

const MANIFEST = "/blog/posts.json";

async function loadPosts() {
  const res = await fetch(MANIFEST, { cache: "no-cache" });
  if (!res.ok) throw new Error(`manifest: ${res.status}`);
  const posts = await res.json();
  // ISO dates sort lexically; newest first.
  return posts.slice().sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

const fmtDate = (iso) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

const el = (tag, attrs = {}, text) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (text != null) n.textContent = text;
  return n;
};

const postUrl = (slug) => `/blog/post.html?p=${encodeURIComponent(slug)}`;

function tagsEl(tags) {
  const ul = el("ul", { class: "post-tags" });
  for (const t of tags || []) ul.append(el("li", {}, t));
  return ul;
}

// List page ------------------------------------------------------------------
async function renderList(root) {
  let posts;
  try {
    posts = await loadPosts();
  } catch {
    root.replaceChildren(el("p", { class: "body" }, "Couldn't load the post list. Try reloading."));
    return;
  }
  if (!posts.length) {
    root.replaceChildren(el("p", { class: "body" }, "Nothing here yet."));
    return;
  }
  const ol = el("ol", { class: "post-list" });
  for (const p of posts) {
    const a = el("a", { class: "post-item", href: postUrl(p.slug) });
    const time = el("time", { datetime: p.date }, fmtDate(p.date));
    a.append(time, el("h3", {}, p.title), el("p", {}, p.summary || ""), tagsEl(p.tags));
    const li = el("li");
    li.append(a);
    ol.append(li);
  }
  root.replaceChildren(ol);
}

// Post page ------------------------------------------------------------------
let mermaidReady;
function loadMermaid() {
  mermaidReady ??= new Promise((resolve, reject) => {
    const s = el("script", { src: "/vendor/mermaid.min.js" });
    s.onload = () => resolve(window.mermaid);
    s.onerror = reject;
    document.head.append(s);
  });
  return mermaidReady;
}

// Diagrams take their colours from the site's own tokens, so they follow the theme toggle.
function mermaidConfig() {
  const css = getComputedStyle(document.documentElement);
  const v = (name) => css.getPropertyValue(name).trim();
  const dark = document.documentElement.dataset.theme !== "light";
  return {
    startOnLoad: false,
    securityLevel: "strict",
    theme: "base",
    fontFamily: v("--font-sans"),
    themeVariables: {
      darkMode: dark,
      background: v("--bg-raised"),
      primaryColor: v("--bg-inset"),
      primaryTextColor: v("--text"),
      primaryBorderColor: v("--accent"),
      secondaryColor: v("--bg-raised"),
      tertiaryColor: v("--bg-raised"),
      lineColor: v("--text-dim"),
      textColor: v("--text"),
      noteBkgColor: v("--bg-raised"),
      noteTextColor: v("--text-dim"),
      noteBorderColor: v("--border-strong"),
      actorBkg: v("--bg-inset"),
      actorBorder: v("--accent"),
      actorTextColor: v("--text"),
      signalColor: v("--text-dim"),
      signalTextColor: v("--text"),
      labelBoxBkgColor: v("--bg-inset"),
      labelBoxBorderColor: v("--border-strong"),
      labelTextColor: v("--text"),
      edgeLabelBackground: v("--bg-raised"),
    },
  };
}

let diagramSeq = 0;
async function renderDiagrams(figs) {
  if (!figs.length) return;
  const mermaid = await loadMermaid();
  mermaid.initialize(mermaidConfig());
  for (const fig of figs) {
    try {
      const { svg } = await mermaid.render(`mmd-${++diagramSeq}`, fig.dataset.src);
      fig.innerHTML = svg;
      fig.classList.remove("is-error");
    } catch (e) {
      // Show the source rather than a blank hole, so a typo in a diagram is visible.
      fig.replaceChildren(el("pre", {}, fig.dataset.src));
      fig.classList.add("is-error");
      console.error("mermaid:", e);
    }
  }
}

function notFound(root) {
  document.title = "Post not found — Sushil Chhetri";
  const back = el("a", { href: "/blog/" }, "All posts");
  const p = el("p", { class: "body" }, "There is no post at this address. ");
  p.append(back);
  root.replaceChildren(el("h1", {}, "Not found"), p);
}

async function renderPost(root) {
  const slug = new URLSearchParams(location.search).get("p");
  let posts;
  try {
    posts = await loadPosts();
  } catch {
    root.replaceChildren(el("p", { class: "body" }, "Couldn't load this post. Try reloading."));
    return;
  }
  // Only slugs listed in the manifest are fetched — the query string never becomes a path.
  const post = posts.find((p) => p.slug === slug);
  if (!post) return notFound(root);

  const res = await fetch(`/blog/posts/${encodeURIComponent(post.slug)}.md`, { cache: "no-cache" });
  if (!res.ok) return notFound(root);
  const md = await res.text();

  document.title = `${post.title} — Sushil Chhetri`;
  document.querySelector('meta[name="description"]')?.setAttribute("content", post.summary || post.title);

  const header = el("header", { class: "post-head" });
  header.append(
    el("time", { datetime: post.date }, fmtDate(post.date)),
    el("h1", {}, post.title),
    tagsEl(post.tags),
  );
  const body = el("div", { class: "prose" });
  body.innerHTML = window.marked.parse(md, { gfm: true });

  // ```mermaid fences arrive as <pre><code class="language-mermaid">; swap each for a figure
  // that keeps its source, so a theme switch can re-render it.
  const figs = [];
  for (const code of body.querySelectorAll("pre > code.language-mermaid")) {
    const fig = el("figure", { class: "diagram" });
    fig.dataset.src = code.textContent;
    code.parentElement.replaceWith(fig);
    figs.push(fig);
  }
  // A post's images live beside it in blog/posts/<slug>/, and the markdown references them
  // relatively (`images/x.png`), so it previews the same in an editor as on the site.
  const assetBase = new URL(`/blog/posts/${encodeURIComponent(post.slug)}/`, location.origin);
  for (const img of body.querySelectorAll("img[src]")) {
    const src = img.getAttribute("src");
    if (!/^([a-z]+:|\/)/i.test(src)) img.src = new URL(src, assetBase).href;
    img.loading = "lazy";
    img.decoding = "async";
  }
  // External links leave the site; mark them so.
  for (const a of body.querySelectorAll('a[href^="http"]')) {
    if (new URL(a.href).origin !== location.origin) a.rel = "noopener noreferrer";
  }

  const nav = el("p", { class: "post-back" });
  nav.append(el("a", { href: "/blog/" }, "← All posts"));
  root.replaceChildren(header, body, nav);

  await renderDiagrams(figs);
  new MutationObserver(() => renderDiagrams(figs)).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
}

const listRoot = document.getElementById("post-list");
const postRoot = document.getElementById("post");
if (listRoot) renderList(listRoot);
if (postRoot) renderPost(postRoot);
