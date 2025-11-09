// ============================================================
// reuse.js — ES Module
// Reusable SVG block system with:
//   <g id="reuse-thing"> … </g>       ← definition
//   <g id="use(thing)">              ← inject at original source location
//   <g id="use(thing)@self" ...>     ← inject at placeholder location
// Works in scroll mode + page mode.
// ============================================================


import {
    stripAllTransforms,
    alignCloneAtPlaceholder_TopLeft,
    uniqueReuseId
} from "./utils.js";

export let reuseRegistry = Object.create(null);

/** Resolve the base URL for /pages/ */
function getPagesBase(userProvided) {
    if (userProvided) return userProvided.replace(/\/+$/, "") + "/";
    if (typeof window !== "undefined" && window.pagesDir) {
        return ("" + window.pagesDir).replace(/\/+$/, "") + "/";
    }
    return "/pages/";
}

// ------------------------------------------------------------
// 1) Register reusable blocks in the currently loaded SVG
// ------------------------------------------------------------
export function registerReuseBlocks(svgRoot) {
    if (!svgRoot) return;
    window.reuseRegistry = window.reuseRegistry || {};

    const defs = svgRoot.querySelectorAll('g[id^="reuse-"]');
    defs.forEach(g => {
        const name = g.id.replace(/^reuse-/, "").trim();
        if (!name) return;

        // Capture original transform for origin-placement use()
        const originalTransform = g.getAttribute("transform") || "";

        reuseRegistry[name] = {
            template: g.cloneNode(true),
            sourceTransform: originalTransform
        };

        console.log(`[reuse] ✅ registered "${name}" (origin="${originalTransform}")`);
    });

    window.reuseRegistry = reuseRegistry;
}

// ------------------------------------------------------------
// 2) Preload reusable blocks from all SVGs in /pages/
// (directory-index scraping; no manifest needed)
// ------------------------------------------------------------
export async function preloadReuseBlocksFromPages(pagesUrl) {
    const base = getPagesBase(pagesUrl);

    try {
        const res = await fetch(base, { cache: "no-store" });
        if (!res.ok) {
            console.warn(`[reuse] ⚠️ Cannot read directory index at ${base} (HTTP ${res.status}).`);
            return;
        }
        const html = await res.text();

        const svgFiles = [...html.matchAll(/href="([^"]+\.svg)"/gi)]
            .map(m => decodeURIComponent(m[1]).split('/').pop())
            .filter(x => x && !x.startsWith(".") && !x.startsWith("?"));

        if (!svgFiles.length) return console.warn(`[reuse] ⚠️ no .svg files in ${base}`);

        console.log(`[reuse] 🌐 scanning pages for reuse-blocks →`, svgFiles);

        await Promise.all(svgFiles.map(async (fname) => {
            const url = base + fname;
            try {
                const r = await fetch(url, { cache: "no-store" });
                if (!r.ok) return;

                const text = await r.text();
                const doc = new DOMParser().parseFromString(text, "image/svg+xml");
                const parseErr = doc.querySelector("parsererror");
                if (parseErr) return;

                doc.querySelectorAll('g[id^="reuse-"]').forEach(g => {
                    const name = g.id.replace(/^reuse-/, "").trim();
                    const originalTransform = g.getAttribute("transform") || "";

                    reuseRegistry[name] = {
                        template: g.cloneNode(true),
                        sourceTransform: originalTransform
                    };

                    reuseRegistry[name].template.setAttribute("data-reuse-source", url);
                    console.log(`[reuse] + "${name}" from ${fname}`);
                });
            } catch (err) {
                console.warn(`[reuse] ❌ error reading ${url}:`, err);
            }
        }));

        console.log(`[reuse] ✅ preload complete. blocks:`, Object.keys(reuseRegistry));
    } catch (err) {
        console.warn(`[reuse] ❌ preloadReuseBlocksFromPages() failed:`, err);
    }

    window.reuseRegistry = reuseRegistry;
}

// ------------------------------------------------------------
// 3) Insert reusable blocks
//
// use(name)      → place at original transform from definition
// use(name)@self → place at placeholder's transform
// ------------------------------------------------------------

export function handleUse(raw, placeholder, scopeSvg = null) {
    const svg = scopeSvg || (placeholder && placeholder.ownerSVGElement);
    if (!svg || !placeholder) return null;

    const at = raw.indexOf('@');
    const name = (at >= 0 ? raw.slice(0, at) : raw).trim();
    const placement = (at >= 0 ? raw.slice(at + 1) : '').trim(); // 'self' or ''

    const reg = (window && window.reuseRegistry) || {};
    const def = reg[name];
    if (!def || !def.template) {
        console.warn(`[reuse] missing block "${name}"`);
        try { placeholder.remove(); } catch { }
        return null;
    }

    const parent = placeholder.parentNode;
    if (!parent) return null;

    // Clone template group
    const clone = def.template.cloneNode(true);
    // Ensure <g> wrapper; most reuse-* are already <g>
    if (clone.tagName?.toLowerCase() !== 'g') {
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.appendChild(clone);
        clone = g;
    }

    // Unique id
    const baseId = (def.template.id || `reuse-${name}`).replace(/__[a-z0-9]+$/i, "");
    clone.id = uniqueReuseId(baseId);

    // Insert before placeholder so CTMs/bboxes are valid
    parent.insertBefore(clone, placeholder);

    if (placement === "self") {
        // Remove all transforms so clone is in pure local geometry
        stripAllTransforms(clone);

        // Visually align clone to the placeholder position
        alignCloneAtPlaceholder_TopLeft(clone, placeholder);

    } else {
        // keep original authored transform for non-self case
        const t = def.sourceTransform || def.template.getAttribute("transform") || "";
        if (t) clone.setAttribute("transform", t);
    }

    // Remove placeholder
    placeholder.remove();

    // Done
    return clone;
}


// ------------------------------------------------------------
// 4) Auto-scan SVG and inject all use() references
// ------------------------------------------------------------
export function autoInjectUseBlocks(svgRoot) {
    if (!svgRoot) return;
    window.reuseRegistry = window.reuseRegistry || {};

    // Take static snapshot — allows safe removal while iterating
    const placeholders = Array.from(svgRoot.querySelectorAll('[id^="use("]'));

    placeholders.forEach(ph => {
        const id = ph.id || "";

        //   use(name)
        //   use(name)@self
        //   use(name)@self   (with transforms)
        //
        //   capture:
        //     group1 = name
        //     group2 = optional "@self"
        //
        const m = id.match(/^use\(\s*([^)]+)\s*\)(?:@(\w+))?$/);
        if (!m) return;

        const name = m[1].trim();
        const placement = m[2]?.trim(); // "self" or undefined

        handleUse(
            placement ? `${name}@${placement}` : name,
            ph,
            svgRoot
        );
    });
}

// ------------------------------------------------------------
// Export globals (optional, convenient for console debugging)
// ------------------------------------------------------------
if (typeof window !== "undefined") {
    window.registerReuseBlocks = registerReuseBlocks;
    window.autoInjectUseBlocks = autoInjectUseBlocks;
    window.handleUse = handleUse;
    window.preloadReuseBlocksFromPages = preloadReuseBlocksFromPages;
}



// --- pages-discovery.js (or inside cues.js) ---



/**
 * Build window.pageRegistry by scraping the /pages/ directory index.
 * - No assumptions about "page-" prefix; includes ANY *.svg in /pages/
 * - Optional excludes via window.pageExclude (array of regex)
 * - Optional explicit include list via window.pageInclude (array of strings w/o .svg)
 */
export async function buildPageRegistryFromDirIndex() {
  const base = getPagesBase();
  try {
    const res = await fetch(base, { cache: "no-store" });
    if (!res.ok) {
      console.warn(`[allPages] ⚠️ Cannot read directory index at ${base} (HTTP ${res.status}).`);
      return;
    }
    const html = await res.text();

    // Extract *.svg names from directory listing
    const files = [...html.matchAll(/href="([^"]+\.svg)"/gi)]
      .map(m => decodeURIComponent(m[1]).split("/").pop());

    if (!files.length) {
      console.warn(`[allPages] ⚠️ No SVG files found in ${base}`);
      return;
    }

    // Optional caller-controlled filters
    const excludes = Array.isArray(window.pageExclude) ? window.pageExclude : [];
    const includes = Array.isArray(window.pageInclude) ? new Set(window.pageInclude) : null;

    // Normalize → { [nameWithoutExt]: url }
    const registry = {};
    for (const fname of files) {
      const name = fname.replace(/\.svg$/i, "");

      // include filter (if provided) takes precedence
      if (includes && !includes.has(name)) continue;

      // apply excludes (regexes)
      if (excludes.some(rx => rx.test(name))) continue;

      registry[name] = base + fname;
    }

    // Expose globally
    window.pageRegistry = registry;
    console.log("[allPages] ✅ pageRegistry:", Object.keys(registry));
  } catch (err) {
    console.warn("[allPages] ❌ Failed to build pageRegistry:", err);
  }
}

window.buildPageRegistryFromDirIndex = buildPageRegistryFromDirIndex;
export function refreshAllPagesMenu() {

    if (!window.pageRegistry || !Object.keys(window.pageRegistry).length) {
  console.warn("[allPages] ⏳ Registry not ready — deferring...");
  requestAnimationFrame(() => refreshAllPagesMenu());
  return;
}

  console.log("[allPages] 🔄 Refreshing menu…");

  const submenu = document.getElementById("pages-submenu");
  if (!submenu) {
    console.warn("[allPages] ❌ submenu container not found.");
    return;
  }

  // Ensure registry exists
  const pages = window.pageRegistry && Array.isArray(window.pageRegistry)
    ? window.pageRegistry
    : Object.keys(window.pageRegistry || {});

  if (!pages.length) {
    console.warn("[allPages] ⚠ No pages found in registry.");
    submenu.innerHTML = `<sl-menu-item disabled>(No pages)</sl-menu-item>`;
    return;
  }

  console.log("[allPages] ✅ Pages:", pages);

  // Clear existing items
  submenu.innerHTML = "";

  // Insert pages
  pages.forEach(name => {
    const item = document.createElement("sl-menu-item");
    item.textContent = name;
    item.value = name;
    item.addEventListener("click", () => {
      handleCueTrigger({ type: "cueNav", action: name, uid: name }, false, true);
    });
    submenu.appendChild(item);
  });

  console.log("[allPages] ✅ Submenu updated.");
}



window.refreshAllPagesMenu = refreshAllPagesMenu;