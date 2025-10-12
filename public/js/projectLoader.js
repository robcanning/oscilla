/*!
 * projectLoader.js — Modular project loader for OscillaScore
 * -----------------------------------------------------------
 * Handles loading of self-contained score projects from /scores/
 */

import { initializeSVG } from './app.js';

export async function loadProject(projectName) {
  try {
    console.log(`\n[loadProject] 🚀 Loading project: ${projectName}`);

    // 1️⃣ Define base paths
    window.currentProject = projectName;
    window.projectBase = `scores/${projectName}/`;
    window.svgDir   = `${window.projectBase}`;
    window.audioDir = `${window.projectBase}audio/`;
    window.textDir  = `${window.projectBase}texts/`;
    window.pagesDir = `${window.projectBase}pages/`;
    window.videoDir = `${window.projectBase}videos/`;
    window.sharedDir = `scores/shared/`;

    // 2️⃣ Load optional config.json
    try {
      const cfg = await fetch(`${window.projectBase}config.json`);
      window.projectConfig = cfg.ok ? await cfg.json() : {};
      console.log(`[loadProject] ✅ Config loaded`);
    } catch {
      console.warn(`[loadProject] ⚠️ No config.json found — using defaults.`);
      window.projectConfig = {};
    }

    // 3️⃣ Preload shared + project-specific groups
    const preloadList = [
      `${window.sharedDir}ui-defaults.svg`,
      `${window.sharedDir}menus.svg`,
      `${window.pagesDir}page-elements.svg`
    ];
    await preloadSvgGroups(preloadList);

    // 4️⃣ Fetch and inject main SVG as a DOM node (not innerHTML)
    const scorePath = `${window.svgDir}score.svg`;
    const container = document.getElementById("scoreContainer");
    if (!container) {
      console.error("[loadProject] ❌ No #scoreContainer found in DOM.");
      return;
    }

    const res = await fetch(scorePath);
    if (!res.ok) throw new Error(`Failed to load ${scorePath}`);
    const svgText = await res.text();

    // Parse the SVG text → DOM element
    const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
    const svgElement = doc.querySelector("svg");
    if (!svgElement) throw new Error("No <svg> root found in loaded file");

    // 🧭 Pre-size it correctly *before* appending (fixes button placement timing)
    svgElement.removeAttribute("width");
    svgElement.removeAttribute("height");
    Object.assign(svgElement.style, {
      display: "inline-block",
      height: "100vh",
      width: "auto",
      maxWidth: "none",
      maxHeight: "100%",
      verticalAlign: "top"
    });

    // Prepare container for scroll mode
    Object.assign(container.style, {
      width: "100vw",
      height: "100vh",
      overflowX: "auto",
      overflowY: "hidden",
      whiteSpace: "nowrap",
      display: "block",
      position: "relative"
    });

    // Replace any old score
    container.innerHTML = "";
    container.appendChild(svgElement);

    // 5️⃣ Initialize cues, animations, observers immediately — layout is already correct
    console.log("[loadProject] 🔧 Initializing SVG logic...");
    if (typeof initializeSVG === "function") {
      initializeSVG(svgElement);
    } else {
      console.warn("[loadProject] ⚠️ initializeSVG() not defined yet.");
    }

    console.log(`[loadProject] ✅ Project "${projectName}" fully loaded.`);

  } catch (err) {
    console.error(`[loadProject] ❌ Failed to load project "${projectName}":`, err);
  }
}

/**
 * preloadSvgGroups(list)
 * ------------------------------------------
 */
export async function preloadSvgGroups(list = []) {
  window.groupRegistry = window.groupRegistry || {};

  for (const src of list) {
    try {
      const text = await fetch(src).then(r => r.text());
      const doc = new DOMParser().parseFromString(text, "image/svg+xml");
      const groups = doc.querySelectorAll('g[id^="group-"], g[id^="menu-"], g[id^="ui-"]');
      groups.forEach(g => {
        const id = g.id.replace(/^group-|^menu-|^ui-/, "");
        window.groupRegistry[id] = g.cloneNode(true);
      });
      console.log(`[preloadSvgGroups] ✅ Loaded from ${src}`);
    } catch (err) {
      console.warn(`[preloadSvgGroups] ⚠️ Could not load ${src}: ${err}`);
    }
  }

  console.log(`[preloadSvgGroups] Registered ${Object.keys(window.groupRegistry).length} groups`);
}

/**
 * resolveProjectPath(), populateProjectMenu()
 * (unchanged)
 */
export function resolveProjectPath(type, filename) {
  if (!filename) return "";
  switch (type) {
    case "audio": return `${window.audioDir}${filename}`;
    case "text":  return `${window.textDir}${filename}`;
    case "video": return `${window.videoDir}${filename}`;
    case "page":  return `${window.pagesDir}${filename}`;
    default:      return `${window.projectBase}${filename}`;
  }
}

export async function populateProjectMenu() {
  const listEl = document.getElementById("score-list");
  if (!listEl) return;
  try {
    const res = await fetch("scores/manifest.json");
    const { projects } = await res.json();
    listEl.innerHTML = "";
    for (const name of projects) {
      const btn = document.createElement("button");
      btn.textContent = `🎼 ${name}`;
      btn.onclick = () => loadProject(name);
      listEl.appendChild(btn);
    }
    console.log("[populateProjectMenu] ✅ Loaded project list.");
  } catch (err) {
    console.warn("[populateProjectMenu] ⚠️ manifest.json missing or invalid.");
    const fallback = document.createElement("li");
    fallback.innerHTML = `<button onclick="loadProject('help')">🎼 Load Default</button>`;
    listEl.appendChild(fallback);
  }
}

window.loadProject = loadProject;
window.resolveProjectPath = resolveProjectPath;
window.populateProjectMenu = populateProjectMenu;
