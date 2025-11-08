// reuse.js — ES Module (directory-index preload version)

export let reuseRegistry = Object.create(null);

/** Resolve the base URL for /pages/ */
function getPagesBase(userProvided) {
  if (userProvided) return userProvided.replace(/\/+$/, "") + "/";
  if (typeof window !== "undefined" && window.pagesDir) {
    // ensure trailing slash
    return ("" + window.pagesDir).replace(/\/+$/, "") + "/";
  }
  return "/pages/"; // default
}

/**
 * Find reusable blocks *inside the currently loaded score SVG*.
 * <g id="reuse-XYZ">…</g>
 */
export function registerReuseBlocks(svgRoot) {
  if (!svgRoot) return;

  const blocks = svgRoot.querySelectorAll('g[id^="reuse-"]');
  blocks.forEach(block => {
    const name = block.id.replace(/^reuse-/, "");
    reuseRegistry[name] = block.cloneNode(true);
    console.log(`[reuse] Registered local block "${name}"`);
  });

  if (typeof window !== "undefined") {
    window.reuseRegistry = reuseRegistry; // debug
  }
}

/**
 * Preload ALL SVGs found in the /pages/ directory by scraping the directory index.
 * No manifest.json required. Works when the server exposes /pages/ as static with autoindex.
 */
export async function preloadReuseBlocksFromPages(pagesUrl) {
  const base = getPagesBase(pagesUrl);

  try {
    // 1) Fetch directory index HTML (e.g., Apache/Express autoindex page)
    const res = await fetch(base, { cache: "no-store" });
    if (!res.ok) {
      console.warn(`[reuse] ⚠️ Cannot read directory index at ${base} (HTTP ${res.status}).`);
      return;
    }
    const html = await res.text();

    // 2) Extract *.svg file names from hrefs
const svgFiles = [...html.matchAll(/href="([^"]+\.svg)"/gi)]
  .map(m => decodeURIComponent(m[1]).split('/').pop()) 
      .filter(name => !name.startsWith("?") && !name.startsWith("."));

    if (!svgFiles.length) {
      console.warn(`[reuse] ⚠️ No SVGs found in ${base}`);
      return;
    }

    console.log(`[reuse] 🌐 Found SVGs in ${base}:`, svgFiles);

    // 3) Fetch each SVG and register any <g id="reuse-..."> blocks
    await Promise.all(
      svgFiles.map(async (fname) => {
        const url = base + fname.replace(/^\/+/, "");
        try {
          const r = await fetch(url, { cache: "no-store" });
          if (!r.ok) {
            console.warn(`[reuse] ⚠️ Failed to fetch ${url} (HTTP ${r.status}).`);
            return;
          }
          const svgText = await r.text();
          const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
          const parseErr = doc.querySelector("parsererror");
          if (parseErr) {
            console.warn(`[reuse] ⚠️ Parser error in ${url}`);
            return;
          }

          const blocks = doc.querySelectorAll('g[id^="reuse-"]');
          blocks.forEach(block => {
            const name = block.id.replace(/^reuse-/, "");
            reuseRegistry[name] = block.cloneNode(true);
            reuseRegistry[name].setAttribute("data-reuse-source", url);
            console.log(`[reuse] + "${name}" (from ${fname})`);
          });
        } catch (err) {
          console.warn(`[reuse] ❌ Error reading ${url}:`, err);
        }
      })
    );

    console.log(`[reuse] ✅ External preload complete. Blocks:`, Object.keys(reuseRegistry));
  } catch (e) {
    console.warn("[reuse] ❌ preloadReuseBlocksFromPages() failed:", e);
  }

  if (typeof window !== "undefined") {
    window.reuseRegistry = reuseRegistry;
  }
}

/** Insert a reusable block into the active SVG (default: original coords). */
export function handleUse(name, anchorEl = null) {
  if (!name) return;
  const source = reuseRegistry[name];

  if (!source) {
    console.warn(`[use] ⚠️ No reusable block named "${name}" found.`);
    return;
  }

  const clone = source.cloneNode(true);

  const currentSvg =
    window._currentPageSvg ||
    document.querySelector('#singlePage-content svg') ||
    document.querySelector('svg#pageSVG') ||
    document.querySelector('svg#score') ||
    document.querySelector('#scoreContainer svg');

  if (!currentSvg) {
    console.warn("[use] ⚠️ No SVG found to insert into.");
    return;
  }

  currentSvg.appendChild(clone);

  // Allow internal button() to be discovered
  window.assignCues?.(clone, window.cues);

  // Restart animations / observers
  window.propagate?.(clone);
  window.initializeObserver?.(clone);

  console.log(`[use] ✅ Inserted "${name}"`);
}

/** Expand all <g id="use(NAME)"> in the given SVG. */
export function autoInjectUseBlocks(svgRoot) {
  if (!svgRoot) return;

const directives = svgRoot.querySelectorAll('[id*="use("]');
  directives.forEach(el => {
    const match = el.id.match(/^use\(([^)]+)\)/);
    const name = match?.[1]?.trim();
    if (!name) return;
    handleUse(name, el);
  });
}

// Optional globals for console debugging
if (typeof window !== "undefined") {
  window.handleUse = handleUse;
  window.autoInjectUseBlocks = autoInjectUseBlocks;
  window.registerReuseBlocks = registerReuseBlocks;
  window.preloadReuseBlocksFromPages = preloadReuseBlocksFromPages;
}
