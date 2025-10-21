/*!
 * projectLoader.js — Modular project loader for OscillaScore
 * -----------------------------------------------------------
 * Handles loading of self-contained score projects from /scores/
 */

import { initializeSVG } from "./app.js";
import { setSpeed, applyDarkMode } from "./transport.js";

// ------------------------------------------------------------
// 🚀 Main entry point
// ------------------------------------------------------------
export async function loadProject(projectName) {
  try {
    console.log(`\n[loadProject] 🚀 Loading project: ${projectName}`);

    // 1️⃣ Define base paths
    window.currentProject = projectName;
    window.projectBase = `scores/${projectName}/`;
    window.svgDir = `${window.projectBase}`;
    window.audioDir = `${window.projectBase}audio/`;
    window.textDir = `${window.projectBase}texts/`;
    window.pagesDir = `${window.projectBase}pages/`;
    window.videoDir = `${window.projectBase}videos/`;
    window.sharedDir = `shared/`;

    // 2️⃣ Load and apply preferences
    const prefs = await loadPreferences(window.projectBase);
    applyDarkMode(!!prefs.darkMode);
    if (prefs.defaultPlaybackSpeed) setSpeed(prefs.defaultPlaybackSpeed);

    // 3️⃣ Prepare scroll container
    const container = document.getElementById("scoreContainer");
    if (!container) {
      console.error("[loadProject] ❌ No #scoreContainer found in DOM.");
      return;
    }
    Object.assign(container.style, {
      width: "100vw",
      height: "100vh",
      overflowX: "auto",
      overflowY: "hidden",
      whiteSpace: "nowrap",
      display: "block",
      position: "relative",
    });

    // 4️⃣ Load scroll score first (always)
    await loadScrollMode(container);

    // 5️⃣ Handle initial mode preference
    const mode = prefs.defaultViewMode || "scroll";
    const startPage = prefs.defaultPage || "home";

    if (mode === "page" || mode === "hybrid") {
      const cue = `cue:page(${startPage})`;
      console.log(`[ProjectLoader] 📄 Starting in ${mode} mode → ${cue}`);

      // give scroll setup time to finish before cueing
      requestAnimationFrame(() =>
        requestAnimationFrame(() => window.handleCueTrigger?.(cue))
      );
    }

    console.log(`[loadProject] ✅ Project "${projectName}" fully loaded.`);
  } catch (err) {
    console.error(`[loadProject] ❌ Failed to load project "${projectName}":`, err);
  }
}

// ------------------------------------------------------------
// ⚙️ Load preferences.json (if available)
// ------------------------------------------------------------
async function loadPreferences(basePath) {
  const prefsPath = `${basePath}preferences.json`;
  try {
    const res = await fetch(prefsPath);
    if (!res.ok) throw new Error("No preferences.json found");
    const prefs = await res.json();
    console.log("[Prefs] ✅ Loaded project preferences:", prefs);
    window.oscillaPrefs = prefs;
    return prefs;
  } catch (err) {
    console.warn("[Prefs] ⚠️ Using defaults (no preferences.json):", err);
    const defaults = {
      darkMode: false,
      defaultPlaybackSpeed: 1.0,
      defaultViewMode: "scroll",
    };
    window.oscillaPrefs = defaults;
    return defaults;
  }
}

// ------------------------------------------------------------
// 🧾 SCROLL MODE — load main score.svg
// ------------------------------------------------------------
async function loadScrollMode(container) {
  const scorePath = `${window.svgDir}score.svg`;
  const res = await fetch(scorePath);
  if (!res.ok) throw new Error(`Failed to load ${scorePath}`);

  const svgText = await res.text();
  const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
  const svg = doc.querySelector("svg");
  if (!svg) throw new Error("No <svg> root found in loaded file");
  svg.id = "score";

  Object.assign(svg.style, {
    display: "inline-block",
    height: "100vh",
    width: "auto",
    maxWidth: "none",
    maxHeight: "100%",
    verticalAlign: "top",
  });

  container.innerHTML = "";
  container.appendChild(svg);
  window.mode = "scroll";

  console.log("[ScrollMode] ✅ Loaded score.svg");
  if (typeof initializeSVG === "function") initializeSVG(svg);
  window.hideControls?.();
}

// ------------------------------------------------------------
// 📚 Preload reusable shared SVG groups (unchanged)
// ------------------------------------------------------------
export async function preloadSvgGroups(list = []) {
  window.groupRegistry = window.groupRegistry || {};

  for (const src of list) {
    try {
      const text = await fetch(src).then((r) => r.text());
      const doc = new DOMParser().parseFromString(text, "image/svg+xml");
      const groups = doc.querySelectorAll(
        'g[id^="group-"], g[id^="menu-"], g[id^="ui-"]'
      );
      groups.forEach((g) => {
        const id = g.id.replace(/^group-|^menu-|^ui-/, "");
        window.groupRegistry[id] = g.cloneNode(true);
      });
      console.log(`[preloadSvgGroups] ✅ Loaded from ${src}`);
    } catch (err) {
      console.warn(`[preloadSvgGroups] ⚠️ Could not load ${src}: ${err}`);
    }
  }

  console.log(
    `[preloadSvgGroups] Registered ${Object.keys(window.groupRegistry).length} groups`
  );
}

// ------------------------------------------------------------
// 📂 Utility: resolve project path
// ------------------------------------------------------------
export function resolveProjectPath(type, filename) {
  if (!filename) return "";
  switch (type) {
    case "audio":
      return `${window.audioDir}${filename}`;
    case "text":
      return `${window.textDir}${filename}`;
    case "video":
      return `${window.videoDir}${filename}`;
    case "page":
      return `${window.pagesDir}${filename}`;
    default:
      return `${window.projectBase}${filename}`;
  }
}

window.resolveProjectPath = resolveProjectPath;
window.loadProject = loadProject;
