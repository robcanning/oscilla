// ============================================================
// reuse.js — ES Module (Mode B: always rebuild cueButtons)
// Reusable SVG block system with:
//   <g id="reuse(name)"> … </g>       ← definition
//   <g id="use(name)">               ← inject at original location
//   <g id="use(name)@self">          ← inject at placeholder location
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
  const defs = svgRoot.querySelectorAll('g[id^="reuse("]');

  defs.forEach(g => {
    const m = g.id.match(/^reuse\(\s*([^)]+)\s*\)$/);
    if (!m) return;

    const name = m[1].trim();
    const originalTransform = g.getAttribute("transform") || "";

    reuseRegistry[name] = {
      template: g.cloneNode(true),
      sourceTransform: originalTransform
    };

    console.log(`[reuse] ✓ registered "${name}" (origin="${originalTransform}")`);
  });

  window.reuseRegistry = reuseRegistry;
}

// ------------------------------------------------------------
// 2) Preload reusable blocks from all SVGs in /pages/
// ------------------------------------------------------------
export async function preloadReuseBlocksFromPages(pagesUrl) {
  const base = getPagesBase(pagesUrl);

  try {
    const res = await fetch(base, { cache: "no-store" });
    if (!res.ok) {
      console.warn(`[reuse] ⚠ Cannot read directory index at ${base} (HTTP ${res.status}).`);
      return;
    }

    const html = await res.text();
    const svgFiles = [...html.matchAll(/href="([^"]+\.svg)"/gi)]
      .map(m => decodeURIComponent(m[1]).split("/").pop())
      .filter(fname => fname && !fname.startsWith(".") && !fname.startsWith("?"));

    if (!svgFiles.length) {
      console.warn(`[reuse] ⚠ no .svg files in ${base}`);
      return;
    }

    console.log(`[reuse] 🌐 scanning pages for reuse-blocks →`, svgFiles);

    await Promise.all(svgFiles.map(async fname => {
      const url = base + fname;

      try {
        const r = await fetch(url, { cache: "no-store" });
        if (!r.ok) return;

        const text = await r.text();
        const doc = new DOMParser().parseFromString(text, "image/svg+xml");
        if (doc.querySelector("parsererror")) return;

        doc.querySelectorAll('g[id^="reuse("]').forEach(g => {
          const m = g.id.match(/^reuse\(\s*([^)]+)\s*\)$/);
          if (!m) return;

          const name = m[1].trim();
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

    console.log(`[reuse] ✓ preload complete. blocks:`, Object.keys(reuseRegistry));

  } catch (err) {
    console.warn(`[reuse] ❌ preloadReuseBlocksFromPages() failed:`, err);
  }

  window.reuseRegistry = reuseRegistry;
}

// ------------------------------------------------------------
// 3) Insert reusable blocks (with transform preservation)
// ------------------------------------------------------------
export function handleUse(raw, placeholder, scopeSvg = null) {
  const svg = scopeSvg || (placeholder && placeholder.ownerSVGElement);
  if (!svg || !placeholder) return null;

  // Parse name and placement
  const at = raw.indexOf('@');
  const name = (at >= 0 ? raw.slice(0, at) : raw).trim();
  const placement = (at >= 0 ? raw.slice(at + 1) : '').trim(); // "self" or ""

  // Lookup registry entry
  const reg = window.reuseRegistry || {};
  const def = reg[name];

  if (!def || !def.template) {
    console.warn(`[reuse] missing block "${name}"`);
    try { placeholder.remove(); } catch {}
    return null;
  }

  const parent = placeholder.parentNode;
  if (!parent) return null;

  // ------------------------------------------------------------
  // Clone template group (deep clone)
  // ------------------------------------------------------------
  let clone = def.template.cloneNode(true);

  // Ensure wrapper is <g>
  if (clone.tagName?.toLowerCase() !== "g") {
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.appendChild(clone);
    clone = g;
  }

// ------------------------------------------------------------
// Remove internal transforms from text (Inkscape artefacts)
// ------------------------------------------------------------
clone.querySelectorAll("text[transform]").forEach(el => {
  console.warn("[reuse] Removing internal text transform:", el.getAttribute("transform"));
  el.removeAttribute("transform");
});

  // ------------------------------------------------------------
  // Preserve all internal transforms
  // (critical for nested translations, button placeholders, etc.)
  // ------------------------------------------------------------
  const origTransEls = def.template.querySelectorAll("[transform]");
  const cloneTransEls = clone.querySelectorAll("[transform]");

  cloneTransEls.forEach((el, i) => {
    const orig = origTransEls[i];
    if (orig) {
      const t = orig.getAttribute("transform");
      if (t) el.setAttribute("transform", t);
    }
  });

  // ------------------------------------------------------------
  // Unique reusable id
  // ------------------------------------------------------------
  const baseId = (def.template.id || `reuse(${name})`).replace(/__[a-z0-9]+$/i, "");
  clone.id = uniqueReuseId(baseId);

  // ------------------------------------------------------------
  // Insert clone before placeholder
  // ------------------------------------------------------------
  parent.insertBefore(clone, placeholder);

  // ------------------------------------------------------------
  // Placement rules
  // ------------------------------------------------------------
  if (placement === "self") {
    // Completely flatten & align clone using placeholder geometry
    stripAllTransforms(clone);
    alignCloneAtPlaceholder_TopLeft(clone, placeholder);

  } else {
    // Default: flatten, then apply template transform once
    stripAllTransforms(clone);

    const t =
      def.sourceTransform ||
      def.template.getAttribute("transform") ||
      "";

    if (t) clone.setAttribute("transform", t);
  }

  // ------------------------------------------------------------
  // Remove the <g id="use(...)"> placeholder safely
  // ------------------------------------------------------------
  try { placeholder.remove(); } catch {}

  return clone;
}


// ------------------------------------------------------------
// 4) Auto-scan SVG and inject all use() references
// ------------------------------------------------------------
export function autoInjectUseBlocks(svgRoot) {
  if (!svgRoot) return;

  window.reuseRegistry = window.reuseRegistry || {};
  const placeholders = Array.from(svgRoot.querySelectorAll('[id^="use("]'));

  placeholders.forEach(ph => {
    const id = ph.id || "";
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
// Export globals
// ------------------------------------------------------------
if (typeof window !== "undefined") {
  window.registerReuseBlocks = registerReuseBlocks;
  window.preloadReuseBlocksFromPages = preloadReuseBlocksFromPages;
  window.autoInjectUseBlocks = autoInjectUseBlocks;
  window.handleUse = handleUse;
}

// ============================================================
// PAGE DISCOVERY
// ============================================================
export async function buildPageRegistryFromDirIndex() {
  const base = getPagesBase();

  try {
    const res = await fetch(base, { cache: "no-store" });
    if (!res.ok) {
      console.warn(`[allPages] ⚠ Cannot read directory index at ${base}`);
      return;
    }

    const html = await res.text();
    const files = [...html.matchAll(/href="([^"]+\.svg)"/gi)]
      .map(m => decodeURIComponent(m[1]).split("/").pop());

    if (!files.length) {
      console.warn("[allPages] ⚠ No SVG files found");
      return;
    }

    const excludes = Array.isArray(window.pageExclude) ? window.pageExclude : [];
    const includes = Array.isArray(window.pageInclude) ? new Set(window.pageInclude) : null;

    const registry = {};

    for (const fname of files) {
      const name = fname.replace(/\.svg$/i, "");

      if (includes && !includes.has(name)) continue;
      if (excludes.some(rx => rx.test(name))) continue;

      registry[name] = base + fname;
    }

    window.pageRegistry = registry;
    console.log("[allPages] ✓ pageRegistry:", Object.keys(registry));

  } catch (err) {
    console.warn("[allPages] ❌ Failed to build pageRegistry:", err);
  }
}

if (typeof window !== "undefined") {
  window.buildPageRegistryFromDirIndex = buildPageRegistryFromDirIndex;
}

export function refreshAllPagesMenu() {
  if (!window.pageRegistry || !Object.keys(window.pageRegistry).length) {
    console.warn("[allPages] ⏳ Registry not ready — deferring…");
    requestAnimationFrame(refreshAllPagesMenu);
    return;
  }

  console.log("[allPages] 🔄 Refreshing menu…");

  const submenu = document.getElementById("pages-submenu");
  if (!submenu) {
    console.warn("[allPages] ❌ submenu container not found.");
    return;
  }

  const pages = Object.keys(window.pageRegistry);
  if (!pages.length) {
    submenu.innerHTML = `<sl-menu-item disabled>(No pages)</sl-menu-item>`;
    return;
  }

  submenu.innerHTML = "";

  pages.forEach(name => {
    const item = document.createElement("sl-menu-item");
    item.textContent = name;
    item.value = name;
    item.addEventListener("click", () => {
      handleCueTrigger({ type: "cueNav", action: name, uid: name }, false, true);
    });
    submenu.appendChild(item);
  });

  console.log("[allPages] ✓ submenu updated.");
}

if (typeof window !== "undefined") {
  window.refreshAllPagesMenu = refreshAllPagesMenu;
}
