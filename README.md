# chhetrisushil.github.io

My personal site — https://chhetrisushil.github.io

Plain static HTML and CSS. No framework, no build step, no CI: GitHub Pages serves this branch
directly, so a push is a deploy. That is deliberate for a page this size — the whole thing is
three files, and there is nothing to break between writing it and it being live.

```
index.html    the page
styles.css    design tokens + layout (dark-first; light is a real second theme)
favicon.svg   shared with the Loom docs site
blog/         the blog (see below)
vendor/       three.js, marked, mermaid — vendored, no CDN at runtime
```

## Blog

Still no build step. `blog/index.html` lists posts from `blog/posts.json`; each item links to
`blog/post.html?p=<slug>`, which fetches `blog/posts/<slug>.md` and renders it in the browser
with marked. A ` ```mermaid ` fenced block becomes a diagram — mermaid is only loaded on a post
that has one, and diagrams re-render in the site's colours when the theme is toggled.

To publish a post:

1. Write `blog/posts/<slug>.md` — body only; the title comes from the manifest, so start with
   prose or a `##` heading, not a `#`.
2. Add an entry to `blog/posts.json`:
   `{ "slug", "title", "date": "YYYY-MM-DD", "summary", "tags": [] }`.
   The list sorts newest first; only slugs in the manifest can be opened.

Preview locally with `python3 -m http.server` from the repo root (paths are root-absolute,
so opening the file directly will not work).

Related: [loom-site](https://github.com/chhetrisushil/loom-site) — the documentation site for
Loom, which is what most of this page is about.
