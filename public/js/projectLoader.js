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
    window.sharedDir = `shared/`;

    // 3️⃣ Preload shared + project-specific groups
    const preloadList = [
      // `${window.sharedDir}ui-defaults.svg`,
      // `${window.sharedDir}menus.svg`,
      // `${window.pagesDir}page-elements.svg`
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

window.resolveProjectPath = resolveProjectPath;


// --- Hamburger menu behaviour ---
document.addEventListener("DOMContentLoaded", () => {
  const menu = document.querySelector("#hamburger-container sl-menu");
  const dialog = document.getElementById("project-dialog");
  const projectList = document.getElementById("project-list");

  if (!menu || !dialog || !projectList) return;

  menu.addEventListener("sl-select", async (event) => {
    const value = event.detail.item.value;
    console.log("[MENU] Selected:", value);

    switch (value) {
      case "load":
        await showProjectList();
        break;

      case "settings":
        alert("⚙️ Settings coming soon.");
        break;

      case "save":
        alert("💾 Save State — not implemented yet.");
        break;

      case "quit":
        window.close?.(); // may not work in browsers
        break;
    }
  });

  async function showProjectList() {
    projectList.innerHTML = "<p>Loading projects...</p>";
    dialog.show();

    try {
      const res = await fetch("/public/scores/");
      const text = await res.text();

      // crude directory listing parser: extract subfolder names
      const projects = [...text.matchAll(/href="([^"/]+)\/"/g)].map((m) => m[1]);
      if (!projects.length) throw new Error("No projects found.");

      projectList.innerHTML = "";
      projects.forEach((name) => {
        const btn = document.createElement("button");
        btn.textContent = name;
        btn.addEventListener("click", () => {
          dialog.hide();
          console.log(`[MENU] Loading project '${name}'`);
          loadProject(name);
        });
        projectList.appendChild(btn);
      });
    } catch (err) {
      console.warn("[MENU] Failed to list projects:", err);
      projectList.innerHTML = `<p style="color:red">⚠️ Could not load project list.</p>`;
    }
  }
});


window.loadProject = loadProject;

// --- Simple auto-load by URL (wait for DOM) ---
window.addEventListener("DOMContentLoaded", () => {
  const url = new URL(window.location.href);
  const projectArg =
    url.searchParams.get("project") || url.pathname.split("/").filter(Boolean)[0];

  if (projectArg) {
    console.log("[BOOT] Auto-loading project:", projectArg);
    loadProject(projectArg);

    const splash = document.getElementById("splash");
    if (splash) {
      splash.style.opacity = 0;
      setTimeout(() => (splash.style.display = "none"), 600);
    }
  }
});

// Listen for the Help / Demo button click
document.addEventListener("DOMContentLoaded", () => {
  const helpBtn = document.getElementById("load-help-btn");
  if (helpBtn) {
    helpBtn.addEventListener("click", async () => {
      console.log("[UI] 🖱️ Help button clicked → loading shared/help project...");
      try {
        await loadProject("helper-score");
        // Optional: hide the splash overlay after loading
        const splash = document.getElementById("splash");
        if (splash) splash.style.display = "none";
      } catch (err) {
        console.error("[UI] ❌ Failed to load help project:", err);
      }
    });
  } else {
    console.warn("[UI] ⚠️ No #load-help-btn found in DOM.");
  }
});




// window.resolveProjectPath = resolveProjectPath;
